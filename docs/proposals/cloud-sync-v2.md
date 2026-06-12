# Cloud Sync v2 — Journal-Based Sync

Status: **implemented** (full rewrite / direct cutover — no v1 coexistence)

Implementation map:

- Server core: `api/sync/v2/_core.ts` (KV + journal + LWW), `_import.ts`
  (lazy v1 → v2 import on first access), `_tool-state.ts` (AI tool adapters)
- Routes: `api/sync/v2/{ops,changes,snapshot,blobs}.ts`
- Shared: `src/shared/sync2/{types,hlc,namespaces}.ts`
- Client: `src/sync/{engine,codecs,state,blobs,transport}.ts`,
  `src/hooks/useAutoCloudSync.ts`, `src/stores/useCloudSyncStore.ts`
- Tests: `tests/test-sync-v2-{core,codecs,api,engine-e2e}.test.ts`

Implementation notes where the final system deviates from the original
proposal text below:

- **No persistent outbox.** Pending uploads are derived as
  `diff(local state, shadow map)` — a persisted map of key → (HLC, content
  hash of the last synced doc). This is strictly simpler than an outbox and
  still survives reloads.
- **Deletions are inferred from shadow keys missing locally**, corroborated
  by the existing deletion markers when a wipe looks suspiciously large
  (storage-eviction guard), instead of marker-driven delete ops.
- **The journal is a bounded Redis list** (op JSON, ascending seq) rather
  than a zset; per-user writes are serialized by a short-TTL lock.
- **v1 import runs lazily server-side** on a user's first v2 access (the
  legacy per-item blob signatures are reused as content hashes, so existing
  libraries do not re-upload).
- **Blob GC is deferred**: superseded content-addressed blobs are not yet
  garbage-collected (bounded per-user; can be added as a periodic sweep).

This document studies the current cloud sync system (v1) and proposes a
redesign that eliminates its main inefficiencies: full-snapshot uploads and
downloads, read-before-write round trips, multi-stage blob uploads, metadata
refetch storms, and polling.

- [1. The current system (v1), studied](#1-the-current-system-v1-studied)
- [2. Why v1 is expensive](#2-why-v1-is-expensive)
- [3. v2 design goals](#3-v2-design-goals)
- [4. The v2 model: keys, ops, journal, cursor](#4-the-v2-model-keys-ops-journal-cursor)
- [5. Server design](#5-server-design)
- [6. Blob handling: content-addressed storage](#6-blob-handling-content-addressed-storage)
- [7. Client engine](#7-client-engine)
- [8. Conflict semantics](#8-conflict-semantics)
- [9. Efficiency comparison](#9-efficiency-comparison)
- [10. What v2 deletes or simplifies](#10-what-v2-deletes-or-simplifies)
- [11. Migration plan](#11-migration-plan)
- [12. Risks and open questions](#12-risks-and-open-questions)

---

## 1. The current system (v1), studied

### 1.1 Architecture recap

v1 syncs **13 physical domains** grouped into **9 logical domains**
(`src/utils/cloudSyncShared.ts`, `src/utils/syncLogicalDomains.ts`):

- **Redis snapshot domains** (`settings`, `files-metadata`, `songs`, `videos`,
  `tv`, `stickies`, `calendar`, `contacts`, `maps`): the full domain state is
  stored as one JSON blob at `sync:state:{username}:{domain}`
  (`api/sync/_state.ts`).
- **Blob domains** (`files-images`, `files-trash`, `files-applets`,
  `custom-wallpapers`): per-item gzip blobs in object storage at
  `sync/{username}/{domain}/items/{key}.gz`, plus a Redis manifest at
  `sync:auto:meta:{username}` (`api/sync/_blob.ts`).

The HTTP surface is `GET/PUT /api/sync/domains/[domain]` (logical granularity)
plus `POST /api/sync/domains/[domain]/attachments/prepare` for storage upload
tokens. Writes carry a `syncVersion` vector
(`src/utils/cloudSyncVersion.ts`); the server returns **409** when the vector
does not fast-forward, and the client merges and retries.

The client orchestrator (`src/hooks/useAutoCloudSync.ts`, ~1,700 lines) wires
zustand store subscriptions to per-domain debounced uploads (2.5–8 s, max
8–15 s), listens for Pusher `domain-updated` events, polls every 10 min
(2 min when realtime is down), and maintains upload-suppression windows
(2–60 s) to avoid feedback loops. Upload preparation and download application
live in `src/sync/domains.ts` (~2,350 lines).

### 1.2 What actually happens per operation (verified against the code)

**Uploading one settings change** (e.g. user switches theme):

1. Store subscription fires → debounce 2.5 s (`UPLOAD_DEBOUNCE_MS`).
2. `prepareRedisStateDomainWrite` calls `fetchRedisStateDomainSnapshot`,
   which calls `fetchRedisDomainSnapshot` (`src/sync/transport.ts`) — and that
   helper **downloads the entire logical domain payload** (every part, data
   inline) just to read one part for merge. Read-before-write on every upload.
3. `PUT /api/sync/domains/settings` with the merged snapshot or a patch.
4. On 409: invalidate cache, re-fetch, re-merge, retry.

**Receiving that change on another device:**

5. Pusher `domain-updated` arrives carrying only
   `{domain, updatedAt, syncVersion, sourceSessionId}` — no data
   (`api/sync/_state.ts`).
6. The handler calls `fetchPhysicalCloudSyncMetadata()` — a full
   `GET /api/sync/domains` (`src/hooks/useAutoCloudSync.ts`).
7. Then `GET /api/sync/domains/settings` downloads the **whole logical
   payload** again, even though one field changed.

That is 4 HTTP round trips plus a Pusher hop to move ~100 bytes of real
change between two devices.

**Uploading N changed images** (`uploadIndividualBlobDomain`,
`src/sync/domains.ts`):

1. `GET /api/sync/domains/files` — the **entire** files logical payload
   (manifests for all 5 parts) to learn the current remote manifest.
2. N × `POST /api/sync/domains/files/attachments/prepare` — one token round
   trip **per item** (rate-limited to 500/min).
3. N × storage PUT.
4. `PUT /api/sync/domains/files` with a manifest containing **every item in
   the library** (`nextItems` includes all `preservedRemoteItems`), so
   manifest payload grows O(library size) on every write.

**Receiving on another device:** Pusher event → full metadata GET → full
logical GET (all 5 parts) → N CDN GETs.

**Bootstrap / catch-up after offline:** there is no delta mechanism. The
client compares per-domain `updatedAt`/`serverVersion` metadata and
re-downloads whole domains that look stale.

### 1.3 The complexity bill

The protocol's snapshot orientation forces compensating machinery, all of
which is real code that must be maintained:

| Mechanism | Where | Why it exists |
|---|---|---|
| Version vectors + 409 + merge-retry | `cloudSyncVersion.ts`, `_state.ts`, domain mergers | Concurrent snapshot writes clobber each other |
| Read-before-write + 1.5 s burst cache | `domains.ts` | Client must merge into latest remote before PUT |
| Incremental patch paths (settings, files-metadata only) | `_state.ts`, `cloudSyncSettingsMerge.ts` | Full snapshots too big; patches bolted on for 2 of 9 Redis domains |
| Per-section timestamps, per-item signatures, deletion markers | `state.ts`, `cloudSyncIndividualBlobState.ts`, `cloudSyncDeletionMarkers.ts` | Merge granularity below snapshot level |
| Suppression windows (2–60 s) | `useAutoCloudSync.ts` | Applying a remote snapshot triggers store subscriptions → echo uploads |
| Dirty-part tracking in localStorage | `syncLogicalDirtyState.ts` | Avoid uploading unchanged parts of a logical domain |
| Polling despite Pusher | `useAutoCloudSync.ts` | Events carry no data and can be missed; no cursor to detect gaps |

Total: ~7,000 lines across `src/sync/`, `src/hooks/useAutoCloudSync.ts`,
`src/utils/cloudSync*`, and `api/sync/` — most of it conflict patching around
a snapshot-shaped protocol.

---

## 2. Why v1 is expensive

All of the costs trace back to four root causes:

1. **The unit of transfer is a snapshot, not a change.** The smallest thing
   you can PUT or GET for a Redis domain is the whole domain (or, for two
   domains, a patch that still requires knowing the remote `baseUpdatedAt`).
   Logical GETs always return every part inline.
2. **Writers must read first.** Because writes are whole snapshots guarded by
   version vectors, every upload does a remote fetch + client-side merge, and
   a concurrency race surfaces as a 409 and a second full cycle.
3. **Notifications carry no information.** Pusher events say "something in
   domain X changed", so every receiver re-derives *what* changed via a
   metadata GET plus a full domain GET.
4. **Blob upload is N+1 staged.** One token round trip per item, then a
   manifest PUT that re-states the entire library.

A redesign that fixes the *unit of transfer* makes all four problems — and
most of the compensating machinery — disappear at once.

---

## 3. v2 design goals

1. **Transfer only deltas.** A change moves across the wire once, as itself,
   in both directions. Never re-upload or re-download unchanged data.
2. **One round trip per sync action.** Upload = 1 POST. Catch-up = 1 GET.
   Realtime apply = 0 HTTP requests for small changes.
3. **No read-before-write, no 409s.** Writes are commutative operations the
   server can always accept and order.
4. **A single cursor answers "am I up to date?".** Replaces metadata
   aggregation, per-domain `updatedAt` comparison, and most polling.
5. **Blob upload count proportional to *new bytes*,** with dedupe, and a
   constant number of control round trips regardless of item count.
6. **Strictly less client machinery** — delete the suppression windows,
   dirty-part files, burst caches, and merge-retry loops rather than adding
   to them.
7. **Same external dependencies:** Upstash-compatible Redis (the
   `RedisLike` abstraction in `api/_utils/redis.ts` already covers hashes,
   zsets, and pipelines), the existing object storage providers, and Pusher.

Non-goals: real CRDTs/OT (no collaborative text editing requirement),
multi-user shared state (sync is per-user), end-to-end encryption (unchanged
from v1).

---

## 4. The v2 model: keys, ops, journal, cursor

### 4.1 Flatten all state into one per-user key space

Every syncable piece of state becomes a **key → document** pair, where keys
are namespaced strings and documents are small JSON values:

```
settings/theme                 → { current: "macosx", wallpaper: {...} }
settings/audio                 → { uiSoundsEnabled: true, ... }
settings/dock                  → { pinned: [...], magnify: ... }
files/doc:/Documents/notes.md  → { name, type, size, contentRef? , ... }
files/trash:uuid               → { originalPath, deletedAt, contentRef }
songs/track:dQw4w9WgXcQ        → { title, artist, url, ... }
songs/order                    → { ids: [...] }
videos/video:abc123            → { title, url, ... }
stickies/note:uuid             → { content, position, color, ... }
calendar/event:uuid            → { title, start, end, ... }
contacts/contact:uuid          → { name, phone, ... }
maps/favorite:uuid             → { name, coordinate, ... }
images/item:uuid               → { name, contentRef: { sha256, size } }
applets/item:uuid              → { name, contentRef: { sha256, size } }
wallpapers/item:uuid           → { name, contentRef: { sha256, size } }
```

The granularity rule: **a key is the unit of conflict resolution**. v1
already merges at exactly these granularities (settings sections, file
paths, track ids, per-item signatures) — v2 makes that granularity the
protocol's native unit instead of reconstructing it from snapshots.

Binary content never lives in a document. Documents reference blobs by
content hash (`contentRef`, §6).

### 4.2 Ops

A change is an **op**:

```ts
interface SyncOp {
  k: string;            // key, e.g. "settings/theme"
  v?: unknown;          // new document (absent for deletes)
  del?: true;           // tombstone
  t: string;            // HLC timestamp: "1718180000000-0003-c4f2a9"
  // assigned by the server on accept:
  seq?: number;         // position in the user's journal
  c?: string;           // origin clientId (for echo suppression)
}
```

`t` is a **hybrid logical clock**: `physicalMs-counter-clientId`. It is
generated client-side at edit time, totally ordered as a string, and immune
to modest clock skew (the counter advances past any larger timestamp the
client has seen). This replaces v1's `syncVersion` vectors, per-section
timestamps, and per-item signature maps with one uniform mechanism.

### 4.3 State + journal + cursor

The server keeps, per user:

- **KV state** — the latest document per key (with its `t`). This is the
  materialized "current state"; a new device can be built from it alone.
- **Journal** — the ordered list of recently accepted ops, indexed by a
  monotonically increasing per-user `seq`. Retained to a bounded length
  (e.g. last 4,096 ops); older history is unnecessary because the KV state
  *is* the compaction.
- **Cursor (`seq`)** — one integer. A client whose cursor equals the server's
  is fully up to date, across every domain, with zero further requests.

Sync becomes:

```
upload:   POST ops since my last flush          (1 request)
catch-up: GET ops where seq > my cursor         (1 request)
bootstrap/gap: GET full KV state + current seq  (1 request)
```

---

## 5. Server design

### 5.1 Redis data structures

```
sync2:seq:{user}       STRING   monotonically increasing op counter (INCR)
sync2:kv:{user}        HASH     field = key, value = JSON { v, t, del?, seq }
sync2:log:{user}       ZSET     score = seq, member = JSON-encoded op
sync2:lock:{user}      STRING   short-TTL write lock (SET NX PX 2000)
```

All four use commands already exposed by `RedisLike`
(`hset`/`hget`/`hgetall`, `zadd`/`zrangebyscore`/`zremrangebyscore`, `incr`,
`set nx`). No Lua required: writes for a user are serialized with the
lightweight lock (sync writes for one user are low-frequency — the v1
debouncer already spaces them seconds apart), and within the lock a single
pipeline applies KV updates, journal appends, and the seq bump.

Journal trimming: after append, `ZREMRANGEBYSCORE sync2:log:{user} -inf (seq - 4096)`.
TTLs use `USER_TTL_SECONDS` (1 year), refreshed on writes and — throttled
daily — on reads, so any device check-in retains the user's cloud data.

### 5.2 Endpoints

Three data endpoints plus one blob endpoint (vs. v1's domain matrix):

#### `POST /api/sync/v2/ops`

```jsonc
// request
{
  "clientId": "c4f2a9",
  "ops": [
    { "k": "settings/theme", "v": { "current": "macosx" }, "t": "1718180000000-0001-c4f2a9" },
    { "k": "files/doc:/Documents/old.md", "del": true, "t": "1718180000200-0002-c4f2a9" }
  ]
}

// response
{
  "ok": true,
  "seq": 1042,                       // server cursor after this batch
  "results": [
    { "k": "settings/theme", "accepted": true, "seq": 1041 },
    { "k": "files/doc:/Documents/old.md", "accepted": false,
      "winner": { "v": { "...": "..." }, "t": "1718180000500-0007-9be1d2" } }
  ]
}
```

Server logic per op (inside the user lock):

1. Read current entry for `k` from the KV hash.
2. If `op.t > current.t` (string compare): accept — write KV, append to
   journal with the next `seq`.
3. Else: reject as superseded and return the winning entry inline, so the
   losing client converges in the same round trip.

**There is no 409 and no retry loop.** Every request succeeds; conflicts are
resolved per key, deterministically, in one pass. Idempotent by construction:
re-sending an op after a network failure compares equal-or-less on `t` and is
a no-op.

If accepted ops reference `contentRef`s, the server verifies the blobs exist
(HEAD against `sync2:blobs:{user}` set, §6) before accepting.

After the write, the server publishes to Pusher on the existing
`getSyncChannelName(username)` channel:

```jsonc
// event "ops" — payload kept under Pusher's 10 KB limit
{ "seq": 1042, "ops": [ /* accepted ops, inline */ ], "c": "c4f2a9" }
// if too large: { "seq": 1042, "c": "c4f2a9" }   → receivers GET /changes
```

#### `GET /api/sync/v2/changes?since={seq}`

```jsonc
// response (since is within journal retention)
{ "ok": true, "seq": 1042, "ops": [ /* ops with seq > since, ordered */ ] }

// response (since too old / never synced)
{ "ok": true, "seq": 1042, "snapshotRequired": true }
```

One `ZRANGEBYSCORE`. No metadata aggregation, no per-domain anything.

#### `GET /api/sync/v2/snapshot`

Returns the full KV hash (optionally gzip via `Content-Encoding`) plus the
current `seq`. Used for bootstrap, journal-gap recovery, and as the
**replacement for the manual backup download path** (which today returns the
entire backup as base64 inside JSON — ~33% overhead). Documents are small
(blobs are refs); a heavy user's snapshot is tens to hundreds of KB gzipped.

`?prefix=files/` allows partial snapshots if ever needed (e.g. per-domain
sync toggles), but is not required for the core flow.

#### `POST /api/sync/v2/blobs` — see §6.

### 5.3 What the server no longer does

- No version-vector assessment (`assessCloudSyncWrite`) or conflict 409s.
- No domain-specific patch appliers (`applySettingsRedisPatch`,
  `applyFilesMetadataRedisPatch`) — every domain is incremental natively.
- No manifest documents that re-state whole libraries.
- No `sync:state:meta` / `sync:auto:meta` aggregation reads on every check —
  the cursor replaces them.

---

## 6. Blob handling: content-addressed storage

### 6.1 Layout

```
storage: sync/{username}/blobs/{sha256}.gz          (immutable, deduped)
redis:   sync2:blobs:{user}  HASH  field = sha256, value = { size, refCount, firstSeenAt }
```

Documents reference blobs via `contentRef: { sha256, size }`. Because blobs
are immutable and content-addressed:

- The same wallpaper installed twice, or an image restored from trash,
  uploads **zero** new bytes.
- "Moving" a file (e.g. Documents → Trash) is a metadata op only; v1 today
  re-uploads the item envelope because the key changes stores.
- CDN caching is perfect (URLs never change meaning).

### 6.2 Upload: one control round trip for any number of items

```jsonc
// POST /api/sync/v2/blobs
{ "blobs": [ { "sha256": "ab12…", "size": 48211 }, { "sha256": "cd34…", "size": 901 } ] }

// response
{
  "ok": true,
  "results": [
    { "sha256": "ab12…", "exists": true },                       // skip upload entirely
    { "sha256": "cd34…", "exists": false, "upload": { /* StorageUploadInstruction */ } }
  ]
}
```

The client then PUTs only the missing blobs directly to storage (parallel,
no further API involvement), and includes the `contentRef`s in its next
`POST /ops` batch. Compare v1: one `attachments/prepare` round trip **per
item**, every time, even for content the server already has.

Rate limiting moves from "500 prepares/min" to a byte/size budget per batch,
which is what actually matters.

### 6.3 Download

Receivers see a document op with a `contentRef`, check IndexedDB for that
hash, and fetch `sync/{username}/blobs/{sha256}.gz` from the CDN only if
missing. Hash-keyed local cache means re-downloads never happen for content
the device has ever seen — including across trash/restore cycles.

Blob fetches can also be **lazy**: a device that never opens an applet never
downloads its payload. v1's reconcile loop (`individualBlobDomainNeedsLocalReconcile`)
forces full hydration of every item on every device.

### 6.4 Garbage collection

On accepting an op that adds/removes/changes a `contentRef`, the server
adjusts `refCount` in `sync2:blobs:{user}` (within the same user lock).
A periodic job (or opportunistic check on write) deletes storage objects
whose refCount has been 0 for > 30 days — a grace window that keeps undo
and journal-replay safe.

---

## 7. Client engine

### 7.1 Components

```
┌────────────────────────────────────────────────────────────┐
│  zustand stores + IndexedDB (unchanged app-facing state)   │
└──────────┬─────────────────────────────────▲───────────────┘
           │ store subscriptions             │ appliers (per key prefix)
           ▼                                 │
┌──────────────────┐                ┌────────┴─────────┐
│  Outbox          │                │  Inbox           │
│  (IndexedDB,     │                │  ops from Pusher │
│  survives reload)│                │  or GET /changes │
└──────────┬───────┘                └────────▲─────────┘
           │ flush (≤1 s batch)              │
           ▼                                 │
   POST /api/sync/v2/ops          Pusher "ops" / GET /changes?since=cursor
```

- **Outbox**: edits append ops to a persisted IndexedDB queue keyed by `k`
  (later edits to the same key coalesce). A short flush timer (~1 s, vs.
  v1's 2.5–15 s per-domain debounce matrix) batches ops into one POST.
  Persistence fixes a real v1 gap: debounced uploads die with the tab.
- **Cursor**: one integer in localStorage. Replaces v1's per-domain
  `lastFetchedAt` / `lastAppliedRemoteAt` / `lastKnownServerVersion` /
  `lastLocalChangeAt` bookkeeping.
- **Appliers**: a registry mapping key prefixes to store updaters
  (`settings/theme` → `useThemeStore`, `files/doc:` → `useFilesStore` +
  IndexedDB `documents`, …). These already exist in v1 as the per-domain
  apply functions in `src/sync/domains.ts`; they shrink because they receive
  one key's document instead of deconstructing snapshots.

### 7.2 Echo suppression without timing windows

v1 suppresses uploads for 2–60 s after applying remote data, because store
subscriptions can't tell remote applies from user edits. v2 doesn't need
timers:

- Ops carry the origin `clientId`; a client ignores ops where `c` equals its
  own id (it already applied them optimistically) and just advances its
  cursor.
- Appliers write to stores inside a `applyingRemote` re-entrancy guard (the
  same `beginApplyingRemoteDomain` pattern v1 already has), so subscriptions
  skip outbox writes during remote applies.
- If an echo slips through anyway, the op's `t` equals the stored `t` and is
  rejected server-side as a duplicate — harmless by idempotency, not by
  timing.

### 7.3 Realtime, gap detection, and the end of polling

- Pusher `ops` events carry the accepted ops inline (≤ 10 KB) → receivers
  apply them with **zero HTTP requests**.
- Each event carries `seq`. If a receiver's cursor isn't `seq - len(ops)`,
  it missed something → one `GET /changes?since=cursor`.
- On reconnect/visibility/focus: the same single cheap `GET /changes`
  (typically returning `ops: []`) replaces v1's metadata fetch + per-domain
  comparison + conditional logical downloads.
- Polling can be dropped entirely, or kept as a slow heartbeat (e.g. 30 min)
  hitting `/changes` — a request that costs one ZSET read and usually
  returns ~50 bytes.

### 7.4 Bootstrap

New device or stale cursor: `GET /snapshot` → write all documents through
the appliers → set cursor → fetch referenced blobs lazily or in a background
queue. One request for all structured state, instead of v1's 9 logical
domain downloads plus the metadata round trip.

---

## 8. Conflict semantics

**Per-key last-writer-wins, ordered by HLC.** This is not a regression from
v1 — it is what v1 already converges to, expressed directly:

| State | v1 mechanism | v2 equivalent |
|---|---|---|
| Settings | per-section `sectionUpdatedAt`, newer section wins | key per section, LWW |
| Files metadata | per-path merge by timestamp | key per path, LWW |
| Songs / videos / contacts / calendar / stickies / maps | client-side merge of snapshots by item timestamp + deletion markers | key per item, LWW |
| Blob items | per-item signature comparison | key per item, LWW + content hash |
| Deletions | deletion-marker maps in `useCloudSyncStore` | `del` tombstone ops; tombstoned KV entries pruned after 90 d |

Two genuinely concurrent edits to the *same* key (same sticky note edited
offline on two devices) resolve to the later HLC — identical to v1's
behavior, minus the 409/merge/retry choreography. Keys are sized so that
this is rare and low-stakes; anything needing finer merges (none today) can
shrink its key granularity (e.g. `stickies/note:uuid/position` vs
`/content`) without protocol changes.

Ordering guarantee: the journal gives all devices the same total order of
accepted ops, so replicas converge regardless of arrival order.

---

## 9. Efficiency comparison

Round trips counted as client↔API requests; CDN/storage transfers noted
separately.

| Scenario | v1 | v2 |
|---|---|---|
| Change one setting, upload | GET logical domain (read-before-write) + PUT snapshot/patch; retry cycle on 409 | 1 POST (~200 B) |
| Same change, other device applies | Pusher (no data) + GET metadata + GET logical domain (all parts inline) | 0 requests (ops inline in Pusher event) |
| Save a 5-item batch of images | GET logical files payload + 5× prepare + 5× storage PUT + PUT full manifest (O(library) size) | 1 blob batch POST + ≤5 storage PUTs (deduped) + 1 ops POST |
| Move file to trash | re-upload item blob under new domain + 2 manifest PUTs | 1 ops POST, 0 bytes of content |
| Foreground/visibility check, nothing changed | GET /api/sync/domains (full metadata aggregation) | GET /changes → `{ops: []}` (~50 B) |
| Catch up after 1 h offline (3 changes) | metadata GET + full logical GET per stale domain | 1 GET /changes → 3 ops |
| New device bootstrap | metadata GET + 9 logical domain GETs + per-item CDN fetches (all, eagerly) | 1 snapshot GET + lazy CDN fetches |
| Concurrent writes from 2 devices | 409 → invalidate → re-GET → merge → re-PUT | both POSTs succeed; loser of each key gets winner inline |
| Re-upload of unchanged content | possible (trash moves, monolithic path, signature loss) | impossible (content-addressed) |

Server-side, the hot path drops from "read meta map + read snapshot + merge
+ write snapshot + write meta map (+ song per-track keys)" to "lock + HGET
changed fields + HSET + ZADD + INCR" — and Pusher messages become the
delivery mechanism instead of an invalidation signal.

---

## 10. What v2 deletes or simplifies

Removed outright:

- Read-before-write fetches, the 1.5 s burst caches, and
  `invalidateRedisStateSnapshotForUpload`.
- `cloudSyncVersion.ts` version vectors, 409 handling, merge-retry loops, and
  all domain merge modules (`cloudSyncFileMerge`, `cloudSyncSettingsMerge`,
  snapshot mergers in `src/shared/domains/*`) as *sync* mechanisms.
- Suppression-window timers and `lastLocalChangeAt` bookkeeping.
- Dirty-part tracking (`syncLogicalDirtyState.ts`) — the outbox *is* the
  dirty state.
- Per-item known-signature maps (`cloudSyncIndividualBlobState.ts`) — the
  content hash in the document is the signature.
- The logical/physical domain split and metadata aggregation
  (`syncLogicalDomains.ts`, most of `cloudSyncShared.ts`).
- The monolithic blob path and `restoreStoreItems`'s clear-then-restore.
- 2-minute disconnected polling.

Retained / reused:

- Auth, `apiHandler`, rate limiting, Pusher channel naming, the
  `RedisLike` abstraction, `StorageUploadInstruction` and storage providers.
- IndexedDB stores and zustand stores as the app-facing local state.
- The applier knowledge in `src/sync/domains.ts` (recast per-key).
- Manual backup/restore UI can sit on `GET /snapshot` + a restore path that
  emits ops, replacing the base64-in-JSON backup blob.

Estimated footprint: the v2 engine (outbox, cursor, appliers registry, HLC)
plus three server routes is on the order of a quarter of the current ~7,000
lines, because conflict-compensation code dominates v1.

---

## 11. Migration (as implemented: direct cutover)

v1 and v2 do not coexist. The cutover replaced the v1 endpoints, client
engine, and conflict machinery in one change:

**Server.** `api/sync/v2/` (ops, changes, snapshot, blobs) plus the
`sync2:*` Redis schema replaced `api/sync/domains/*` and the
`_state`/`_blob`/`_domains`/`_physical` modules, which were deleted.
Server-side AI tool writers (songs, contacts, calendar, stickies, files
metadata) were rewired onto the v2 op pipeline (`_tool-state.ts`,
`song-library-state.ts`, `contacts.ts`), so tool writes broadcast realtime
ops like any other client.

**Import.** On a user's first v2 access (any v2 endpoint),
`ensureSync2Initialized` converts existing `sync:state:{user}:*` snapshots,
the per-track song library, and blob manifests into KV entries —
translating per-section/per-item timestamps into HLC values and keeping
legacy per-item storage URLs (their v1 signatures are SHA-256 over the same
serialization, so they seed the dedupe registry and nothing re-uploads).
Idempotent and one-way per user; v1 keys are left to expire via their
90-day TTLs.

**Client.** The new engine + codecs replaced `src/sync/` and the
`cloudSync*` utility constellation (~7,000 lines down to roughly a quarter
of that). The Control Panels sync tab and menu-bar indicator now read
per-category status from the slimmed `useCloudSyncStore`; force upload =
re-stamped full flush, force download = snapshot apply. The manual backup
endpoints were kept unchanged.

---

## 12. Risks and open questions

- **Per-user lock contention.** The 2 s `SET NX PX` lock serializes a user's
  writes. With sub-second outbox flushes from several devices, queuing is
  bounded and fair (retry with jitter); if it ever matters, the lock can be
  replaced by a Lua CAS script on backends that support it.
- **Large single documents.** A few keys can be big-ish (e.g. a TextEdit
  document's content in `files/doc:*`). Anything that regularly exceeds a few
  hundred KB should move its content into a `contentRef` blob (TextEdit
  documents arguably should anyway, matching how images work).
- **Pusher payload ceiling.** Inline-op events must stay under 10 KB; the
  fallback (`seq`-only event + one `/changes` GET) is exactly v1's behavior,
  so the worst case equals today's normal case.
- **HLC trust.** Timestamps are client-generated; a device with a wildly
  wrong clock could win conflicts unfairly. Mitigation: server clamps
  accepted `t` to `serverNow + ε` (e.g. 5 min) and the HLC counter preserves
  causality for clients that have seen newer values. (v1 has the same
  exposure via client `updatedAt` fields.)
- **Journal retention sizing.** 4,096 ops ≈ weeks of typical use; a device
  offline longer falls back to one snapshot GET. Tunable per measurement.
- **Songs server model.** v1 stores songs as expanded per-track Redis keys
  (`song-library-state.ts`) shared with other features; Phase 3's songs wave
  must either keep dual-writing those keys or migrate their consumers.
