# ryOS duplication & complexity audit

Read-only audit of duplicated/redundant code paths and unnecessary complexity across
frontend (`src/`) and API (`api/`). Goal: identify what can be deleted, consolidated, or
rearchitected simpler **without changing product behavior**.

This complements the existing `plans/simplification_execution_waves.md`. Where that doc
tracks an in-flight wave program, this audit is a fresh, evidence-backed snapshot. It also
flags **drift between the waves doc's "completed" claims and current reality** (see
[Status reconciliation](#status-reconciliation)).

Repo size at time of audit: ~1,164 `.ts/.tsx` files in `src/`, 159 in `api/`.

---

## TL;DR

The codebase is well organized (per-app folders, a shared `apiHandler`, a `useThemeFlags`
helper, a moving-target sync engine). The remaining issues cluster into four themes:

1. **God modules** — a handful of 1.5k–5.5k line hooks/stores mix unrelated concerns
   (`useIpodLogic` ~5.5k, `useFileSystem` ~2.2k, `sync/domains.ts` ~2.5k, `useAiChat` ~2.1k).
2. **Copy-pasted request/stream/rate-limit boilerplate in the API** — `apiHandler` is ~95%
   adopted but the highest-traffic routes (songs SSE, chat, telegram) bypass or re-implement it.
3. **Frontend↔API duplicated typed boundaries** — AI models, chat/room/message types,
   sync snapshot shapes, lyrics types, and validation rules are redefined on both sides with
   no shared module. One **active data drift** found (songs `deletedTrackIds`).
4. **Small-helper sprawl** — `isTouchDevice`, `isMobileSafari`, `formatTime`, `clamp`,
   `localStorage`+`JSON.parse`, redis key prefixes, and mobile breakpoints are reimplemented
   in many places.

Quick wins are low-risk and mechanical. The big refactors (god hooks, sync) are high-blast-radius
and should follow the existing wave sequencing.

---

## Top 10 concrete findings

Ranked by impact (combination of duplication surface, drift risk, and how much it blocks future work).

### 1. API SSE streaming triplicated inside `api/songs/[id].ts`

- **Where:** `api/songs/[id].ts` — three near-identical blocks for `translate-stream`,
  `furigana-stream`, `soramimi-stream` (SSE headers, `sendEvent`, line-buffer parsing,
  `streamText` loop, progress + completion + caching). File is ~1,700 lines.
- **Redundant because:** `api/songs/_lyrics.ts` already has `streamTranslation()`, and
  `api/songs/_furigana.ts` defines `streamFurigana()` that is **never imported** (dead).
- **Target:** `api/songs/_streaming.ts` → `createLyricsSseStreamHandler({ action, model, parseLine, ... })`;
  route becomes action dispatch + rate limits. Delete or wire `streamFurigana`.
- **Risk:** High (client SSE event shapes are sensitive). **Behavior change:** No if event payloads preserved.

### 2. AI model registry duplicated frontend↔API (explicit copy)

- **Where:** `src/types/aiModels.ts` vs `api/_utils/_aiModels.ts` (the latter's header literally
  says "duplicated from src/types/aiModels.ts").
- **Drift already present:** `DEFAULT_AI_MODEL` (src) vs `DEFAULT_MODEL` (api). Many endpoints
  hardcode `google("gemini-3-flash-preview")` instead of `getModelInstance(...)`
  (`api/ai/ryo-reply.ts`, `api/parse-title.ts`, `extract-memories.ts`, `process-daily-notes.ts`,
  `applet-ai.ts`, `tv/create-channel.ts`, `songs/_utils.ts`).
- **Target:** runtime-neutral `shared/ai/models.ts` (registry + `SUPPORTED_AI_MODELS` +
  `DEFAULT_AI_MODEL`) imported by both; `api/_utils/_aiModels.ts` keeps only server provider
  mapping (`getModelInstance`, OpenAI options). Add `TASK_MODELS.{ryoReply,memory,...}` to kill hardcoded IDs.
- **Risk:** Medium. **Behavior change:** No (unless hardcoded preview IDs differ from registry mapping — verify during migration).

### 3. Cloud-sync snapshot shapes redefined 3–4× + one active data drift

- **Where:** per-domain snapshot interfaces live in `src/sync/domains.ts` (~2.5k lines), again in
  `api/chat/tools/types.ts` (calendar/stickies/contacts), and again in the Zustand stores.
- **Active drift (bug-class, not just style):** client `SongsSnapshotData` includes
  `deletedTrackIds`; server `api/_utils/song-library-state.ts` (`writeSongsState`) **drops
  tombstones**, so deletion merge can diverge after sync. Calendar `location` is in the store +
  client snapshot but missing from `api/chat/tools/types.ts` `CalendarSnapshotData`.
- **Target:** `shared/sync/snapshots.ts` for wire/sync shapes; align `writeSongsState` with the
  client tombstone contract (this one is a fix, not pure refactor).
- **Risk:** High (data-loss class). **Behavior change:** Yes for the songs tombstone fix; No for type extraction.

### 4. `useIpodLogic.ts` god-hook (~5,458 lines)

- **Where:** `src/apps/ipod/hooks/useIpodLogic.ts`. Owns wheel/menu state, YouTube + Apple Music
  playback, lyrics/furigana, brick game, music quiz, cover flow, listen sessions, analytics,
  share URLs, backlight, themes, and library import.
- **Redundant because:** several concerns are already partially extracted
  (`useAppleMusicLibrary.ts` ~1.9k, `useLibraryUpdateChecker`, `useIpodActiveLibrary`) yet the
  orchestrator still absorbs everything; UA sniffing is copy-pasted with `useKaraokeLogic.ts`.
- **Target:** split into `useIpodPlayback`, `useIpodWheelMenus`, `useIpodAppleMusic`,
  `useIpodGames`, `useIpodLyricsUi` behind a thin composition hook; move menu builders to `ipod/menu/`.
- **Risk:** High (effect ordering / shared refs). **Behavior change:** No if return type frozen first.

### 5. Three IndexedDB abstractions for one concern

- **Where:** `dbOperations` inside `src/apps/finder/hooks/useFileSystem.ts` (imported by 15+
  **non-Finder** modules), `src/utils/indexedDBOperations.ts`, and inline transactions in
  `src/stores/useFilesStore.ts`. Overlapping `StoredContent`/`DocumentContent` types.
- **Redundant because:** the VFS layer lives inside a Finder hook; cross-app code imports a
  Finder-internal export.
- **Target:** single `src/lib/indexedDb/` module (this is Wave 6 in the existing plan — still open);
  `useFileSystem` becomes Finder navigation only; `useFilesStore` owns metadata only.
- **Risk:** High (cloud sync, trash, cross-app open depend on coupling). **Behavior change:** No if API preserved.

### 6. Rate-limit burst+daily block copy-pasted across ~12 endpoints

- **Where:** `youtube-search.ts`, `link-preview.ts`, `parse-title.ts`, `ie-generate.ts`,
  `audio-transcribe.ts`, `speech.ts`, `iframe-check.ts`, `songs/index.ts`, `songs/[id].ts`,
  `share-applet.ts`, `tv/create-channel.ts`, … — the same ~25-line `getClientIp` →
  `makeKey(["rl", …])` → `checkCounterLimit` ×2 → `Retry-After` pattern.
- **Redundant because:** `api/_utils/_rate-limit.ts` already has `checkCounterLimit`; only the
  wiring is duplicated. `RATE_LIMIT_TIERS` in `api/_utils/constants.ts` is **unused dead config**.
- **Target:** `enforceBurstAndDailyLimits(req, { namespace, burst, daily })` helper, or an
  `apiHandler` `rateLimit: { burst, daily }` option.
- **Risk:** Medium (misconfiguration). **Behavior change:** No.

### 7. Chat/room/message types redefined on both sides

- **Where:** `src/types/chat.ts` (`ChatRoom`, `ChatMessage`, `User`) vs
  `api/rooms/_helpers/_types.ts` (`Room`, `Message`, `User`) vs `src/api/rooms.ts`
  (`RoomSummary`, `RoomMessage`). Three parallel room types; `clientId` only on the client side.
- **Target:** `shared/chat/types.ts` for `Room`/`Message`/`User` + request/response DTOs;
  `ClientChatMessage = Message & { clientId?: string }`.
- **Risk:** Medium. **Behavior change:** No (wire format unchanged).

### 8. Mobile / touch / viewport detection — five parallel systems

- **Where:**
  - `useIsMobile` (`src/hooks/useIsMobile.ts`, touch **or** width<768)
  - `useIsPhone` (`src/hooks/useIsPhone.ts`, touch **and** width<640)
  - `useMediaQuery` (`src/hooks/useMediaQuery.ts`)
  - `src/utils/device.ts` (`isMobileDevice`, `isTouchDevice`, `isMobileSafari`)
  - inline `window.innerWidth < 768` in `useWindowManager.ts`, `useWindowInsets.ts`, `useAppStore.ts`
  - **breakpoint inconsistency:** 767px (`DashboardAppComponent`, `HtmlPreview`, `AppDrawer`) vs
    768px (`menubar.tsx`, `dropdown-menu.tsx`, `useIsMobile`).
  - `isTouchDevice` reimplemented in `chat-message-item/utils.ts` and `link-preview/utils.ts`;
    `isMobileSafari` re-inlined in `useSound`, `useSoundboardLogic`, `SoundSlot`, `useSynthLogic`, `indexedDBMigration`.
- **Target:** one `MOBILE_MAX_WIDTH` constant; route all `isTouchDevice`/`isMobileSafari` through
  `utils/device.ts`; keep the two breakpoint hooks but back them with the shared constant.
- **Risk:** Low–medium (767 vs 768 boundary; touch-desktop semantics). **Behavior change:** Possible at the exact boundary — verify.

### 9. Theme branching still partly hand-rolled despite `useThemeFlags`

- **Where:** `src/utils/tabStyles.ts`, `src/components/shared/toolInlineCardShell.ts`,
  `AboutFinderDialog.tsx`, `useControlPanelsLogic.ts` (recomputes theme booleans),
  `menubar.tsx` (~52 theme refs), `dropdown-menu.tsx` (~34). CSS escape-hatch explosion in
  `src/styles/themes.css` (`ipod-force-font`, `karaoke-force-font`, `tv-cc-force-font`, …) vs the
  newer `os-native-chrome-skip` in `src/lib/themeChrome.ts`.
- **Target:** extend the `OsTheme` config with `tabChrome`/`inlineCardShell`/`menubarContentStyle`
  tokens; migrate per-app `*-force-font` to `os-native-chrome-skip`. (Waves 5/9 in the existing plan.)
- **Risk:** Medium (visual regressions across 4 themes). **Behavior change:** No if tokens match current output.

### 10. Dead `api/_utils/middleware.ts` barrel + unused "unified" constants

- **Where:** `api/_utils/middleware.ts` — a re-export hub with **zero code importers**
  (only `docs/1.2-api-architecture.md` + generated `public/docs/api-architecture.html` reference it).
  It re-exports `RATE_LIMIT_TIERS`/`REDIS_PREFIXES`/`VALIDATION` from `api/_utils/constants.ts`
  (also unused elsewhere) and defines an unused `isAdmin()`. `getClientIpFromVercel`
  (`_rate-limit.ts`) and `handlePreflight` (`_cors.ts`) are only referenced by this dead barrel.
- **Target:** delete `middleware.ts` (or shrink to `export { apiHandler }`), drop the orphaned
  alias/`handlePreflight`/unused constants, and update the two docs. Left **unapplied** in this PR
  only because of the doc coupling — see recommendation in [Applied cleanups](#applied-safe-cleanups).
- **Risk:** Low. **Behavior change:** No.

---

## What can be deleted / consolidated

### Verified dead (zero importers — grep-confirmed)

| Item | Path | Note |
|------|------|------|
| `saveAsMarkdown`, `createHtmlRenderer` | `src/utils/markdown/saveUtils.ts` | whole file; barrel `index.ts` does not re-export — **deleted in this PR** |
| `useTokenRefresh`, `useTokenAge` | `src/apps/chats/hooks/useTokenRefresh.ts` | explicit no-op stub — **deleted in this PR** |
| `isTabletDevice` | `src/utils/device.ts` | **removed in this PR** |
| `TranslationChunkInfo`/`FuriganaChunkInfo`/`SoramimiChunkInfo` | `src/utils/chunkedStream.ts` | `@deprecated` aliases, 0 importers — **removed in this PR** |
| `middleware.ts` barrel | `api/_utils/middleware.ts` | 0 code importers (doc-coupled) — recommend delete |
| `getClientIpFromVercel` | `api/_utils/_rate-limit.ts` | alias only used by dead barrel |
| `handlePreflight` | `api/_utils/_cors.ts` | exported, never called |
| `RATE_LIMIT_TIERS`, `REDIS_PREFIXES` | `api/_utils/constants.ts` | only re-exported by dead barrel |
| `streamFurigana` | `api/songs/_furigana.ts` | never imported (route inlines SSE) |
| `getClientIp`, `createSuccessResponse`, `addCorsHeaders` | `api/rooms/_helpers/_helpers.ts` | rooms use `_utils/_rate-limit.getClientIp`; these helpers unused |
| `getActiveUsersAndPrune` | `api/rooms/_helpers/_presence.ts` | one-line alias of `getActiveUsersInRoom` |
| `refreshRoomPresence` ≡ `setRoomPresence` | `api/rooms/_helpers/_presence.ts` | identical implementations |
| `isWeb` | `src/utils/platform.ts` | 0 importers |
| `generateHtmlFromJson` (async) | `src/utils/tiptapHtml.ts` | 0 importers (sync variant is used) |
| `getTranslatedAppDescription`, `getTranslatedHelpItems` | `src/utils/i18n.ts` | superseded by `useTranslatedHelpItems` |
| `USER_PICTURE_CATEGORIES` | `src/utils/userPictures.ts` | only used internally |

### Unused npm dependencies (grep-confirmed zero imports in `src/`, `api/`, `scripts/`)

`next-themes`, `@vercel/og`, `@vercel/edge`, `node-fetch` + `@types/node-fetch`. Candidates for
removal from `package.json` (verify deploy tooling does not need `vercel` CLI deps separately).

### Consolidation targets (duplicated small helpers)

| Helper | Locations | Action |
|--------|-----------|--------|
| `isTouchDevice` | `utils/device.ts` + `chat-message-item/utils.ts` + `link-preview/utils.ts` | import from `device.ts` |
| `isMobileSafari` (inline) | `useSound`, `useSoundboardLogic`, `SoundSlot`, `useSynthLogic`, `indexedDBMigration` | import from `device.ts` |
| `formatTime`/duration | `timeFormat.ts` + `useTvLogic` + `useVideosLogic` + `LyricsSyncMode` + `CursorRunEventView` + `MenuBarClock` | extend `timeFormat.ts` (ms/timestamp variants) |
| `useLongPress` | `src/hooks/useLongPress.ts` + ~70-line copy in `MinesweeperAppComponent.tsx` | reuse shared hook |
| `clamp` | `themes/accents.ts`, `wallpaperAccentColor.ts`, `mapRegionUtils.ts`, inline elsewhere | one `utils/math.ts` |
| `localStorage`+`JSON.parse` try/catch | `syncLogicalDirtyState`, `cloudSyncIndividualBlobState`, `sync/state`, `useThemeStore`, `useControlPanelsLogic`, `useChatsStore`, `indexedDBMigration` | one `readJsonFromLocalStorage(key, fallback)` |
| Redis key prefixes (`chat:users:` etc.) | `rooms/_helpers/_constants.ts` + `_utils/auth/_constants.ts` + `_utils/constants.ts` + hardcoded in `listen/*`, `rooms/[id]/join.ts` | one `api/_utils/redis-keys.ts`; ban raw strings |
| Apple JWT token endpoints | `mapkit-token.ts` + `musickit-token.ts` (+ `_mapkit-jwt.ts`/`_musickit-jwt.ts`) | `createAppleJwtTokenHandler({ sign, listMissing, ttl, … })` |
| ZSET presence | `presence/heartbeat.ts` + `rooms/_helpers/_presence.ts` + `airdrop/*` | `presenceZset.ts`: `touchPresence`/`listActive` |

---

## Proposed target architecture by area

### Shared typed boundary (`shared/`)
- **Feasibility: yes, low-risk, partially already practiced.** `api/` already imports from
  `../../src/utils/**` (cloud sync, contacts, furigana) and `api/tsconfig.json` resolves `src/`.
  There is **no** `shared/` dir or `@shared` alias yet, and the frontend **cannot** import from `api/`.
- **Plan:** add a runtime-neutral (no React/Zustand/DOM) `shared/` with `tsconfig.shared.json` +
  `@shared/*` aliases in `tsconfig.app.json`, `api/tsconfig.json`, and `vite.config.ts`. Seed it with
  `shared/ai/models.ts`, `shared/chat/types.ts`, `shared/sync/snapshots.ts`, `shared/songs/lyrics.ts`,
  `shared/validation/{auth,chat}.ts`. Migrate `Track` out of `useIpodStore.ts` (the API imports it
  from a 2.6k-line Zustand store today — a bad coupling).

### API request layer
- Make `apiHandler` the single entry: add `contentType: "text/event-stream"` support, an optional
  `rateLimit` preset, and `auth: "required" | "optional" | "body-or-header"` modes; migrate the
  remaining bespoke handlers (`audio-transcribe`, `webhooks/telegram`, `cron/*`, songs SSE, `chat.ts`).
  Stop re-setting `Access-Control-Allow-Origin` in streaming routes (the wrapper already does it).

### Frontend internal API access
- Finish Wave 2/7: all internal calls go through `src/api/*` + `apiRequest`; reserve raw
  `abortableFetch` for third-party/static assets. Client DTOs import shared types instead of redefining.

### VFS / IndexedDB
- Finish Wave 6: one `src/lib/indexedDb/` content module; `useFileSystem` → Finder-only;
  `useFilesStore` → metadata only.

### Media apps
- Extract a shared track-navigation/playback slice used by `useIpodStore` + `useKaraokeStore`
  (shuffle/loop/sequential + history); unify `FullScreenPortal` (iPod) and `VideoFullScreenPortal`
  behind one `MediaFullscreenPortal` with app-specific overlays.

### Theme system
- Table-driven theme tokens (extend `OsTheme`) for tab/menubar/inline-card chrome; collapse
  per-app `*-force-font` CSS into `os-native-chrome-skip`. (Waves 5/9.)

### Sync
- Finish Wave 8: split `src/sync/domains.ts` into `src/sync/domains/<domain>.ts` with a registry
  table `{ domain, store, blobStrategy, serialize, apply }`; align client/server tombstone semantics.

---

## Risk-ranked migration sequence

| Phase | Work | Risk | Notes |
|-------|------|------|-------|
| **0 (quick wins)** | Delete verified dead code/exports; consolidate `isTouchDevice`/`isMobileSafari`; `MOBILE_MAX_WIDTH` constant; `readJsonFromLocalStorage`; prune unused deps; merge presence aliases; delete dead `middleware.ts` + docs | Low | Mostly mechanical; covered partly by this PR |
| **1** | Apple JWT token handler factory; rate-limit preset helper; redis-keys module | Low–med | Localized, testable |
| **2** | `shared/` module: AI models, chat types, sync snapshots, validation, lyrics types | Med | Build-config change; no runtime change if literals preserved |
| **3** | Songs SSE extraction; memory-extraction shared module | Med–high | SSE/event-shape sensitive — snapshot tests first |
| **4** | Finish Wave 6 (IndexedDB) and Wave 7 (API client) | Med–high | Cross-app coupling |
| **5** | Split `useIpodLogic` / `useFileSystem` / `useInternetExplorerLogic` / `useAiChat` behind frozen return types | High | Effect-ordering risk |
| **6** | Sync domain split + tombstone alignment (Wave 8) | High | Data-loss class — strongest tests |
| **7** | Theme token table + CSS `*-force-font` collapse (Waves 5/9) | Med | Visual regression across 4 themes |

### Quick wins vs larger refactors
- **Quick wins:** Phase 0 + Phase 1 (dead code, helper consolidation, factory extraction, presets).
- **Larger refactors:** Phases 4–7 (VFS, god-hook splits, sync, theme tokens) — sequence per the
  existing waves doc; each must land independently shippable with tests.

---

## Tests / smoke checks needed

- **Build/typecheck:** `bun run build` (runs `tsc -b`) — fast regression gate for deletions/type moves.
- **API integration:** `bun run dev:api` + `bun run test:api` (auth/rooms/messages/presence,
  songs, AI). Critical before touching `apiHandler`, rate-limit, presence, songs SSE.
- **Targeted suites already present:** `test:new-api`, `test:song`, `test:ai`, `test:media`,
  `test:chat-regression`, `test:pusher-regression` (see `AGENTS.md`).
- **Sync:** focused sync suite + a manual round-trip (create/delete a song, sync, confirm tombstone
  survives) — required for the songs `deletedTrackIds` fix and any Wave 8 work.
- **Theme:** visual check across System 7 / macOS Aqua / Windows XP / Windows 98 for any theme-token
  migration (screenshots per theme).
- **New unit tests recommended** for any extracted shared helper (`createLyricsSseStreamHandler`,
  `enforceBurstAndDailyLimits`, `createAppleJwtTokenHandler`, presence helpers).

---

## Dead / obsolete code paths inventory

- **Verified dead:** see the [deletion table](#verified-dead-zero-importers--grep-confirmed) above.
- **Legacy migrations safe to retire after a deploy/telemetry window (do not rush):**
  `useChatsStore` legacy localStorage keys + commented-out cleanup `removeItem`s; `useThemeStore`
  `LEGACY_THEME_KEY = "os_theme"`; `prefetch.ts` `LEGACY_MANIFEST_KEY`; Finder
  `app_finder_initialPath`/`pending_file_open` dual-key reads; `indexedDBMigration.ts`
  `ryos:indexeddb-uuid-migration-v1` (~500 lines, once-per-profile).
- **Deprecated fields still wired:** `useIpodStore` `koreanDisplay`/`japaneseFurigana`
  (superseded by `romanization`); `useWindowInsets` `isXpTheme` alias (use `useThemeFlags`).
- **Test-only `@deprecated`:** `buildDynamicSystemPrompt` in `api/_utils/ryo-conversation.ts`
  (only `tests/test-ryo-conversation-prompt-caching.test.ts` imports it).
- **TODO/FIXME/HACK:** effectively **zero** real markers in `src/`/`api/` (only i18n tooling
  `[TODO]` placeholders and a Spanish string false-positive). The codebase is clean on this axis.

---

## Status reconciliation

`plans/simplification_execution_waves.md` marks **Wave 1 complete** ("remove dead helper exports
from `api/_utils/middleware.ts`"), but `middleware.ts` still exists as a full dead barrel with
unused `isAdmin`, `getClientIpFromVercel`, `handlePreflight`, and unused constant re-exports — and
the docs still present it as the canonical import pattern. Wave 1 also called for replacing the
`src/stores/helpers.ts` per-store shallow wrappers with one generic helper; the generic
`useStoreShallow` now exists **but the nine per-store wrappers remain** (still used). These are the
clearest "claimed done, actually open" items.

Open waves per that doc that this audit confirms are still live: **2** (API client unification),
**3/6** (IndexedDB winner), **4/8** (sync domain split + this audit's songs tombstone drift),
**5/9** (theme/CSS tokens).

---

## Applied safe cleanups

This PR applies only **fully isolated, zero-importer** removals (verified by grep; `bun run build`
green):

- Deleted `src/utils/markdown/saveUtils.ts`
- Deleted `src/apps/chats/hooks/useTokenRefresh.ts`
- Removed `isTabletDevice()` from `src/utils/device.ts`
- Removed the three `@deprecated *ChunkInfo` aliases from `src/utils/chunkedStream.ts`

Deliberately **not** applied in the first commit (followed up below): deleting
`api/_utils/middleware.ts` (needs the two doc updates), removing
`getClientIpFromVercel`/`handlePreflight`, pruning npm deps, and the
helper-consolidation/architecture work — these landed in the phased commits documented next.

---

## Phased implementation status

This PR implements the **API-side and shared-boundary phases** of the migration sequence,
each as its own tested, behavior-preserving commit. The **large frontend/architecture rewrites**
are intentionally deferred to dedicated, individually-reviewed PRs — consistent with both the
audit's risk ranking and the repo's own `plans/simplification_execution_waves.md`
("keep each wave independently reviewable and shippable").

### Completed in this PR (verified)

| Phase | Work | Verification |
|-------|------|--------------|
| **0** | Dead-code removal (`saveUtils`, `useTokenRefresh`, `middleware.ts` barrel, `constants.ts`, `isTabletDevice`, `*ChunkInfo`, `getClientIpFromVercel`, `handlePreflight`); `isTouchDevice` dedupe; presence-alias consolidation; pruned 5 unused npm deps | `bun run build`; `test:unit`; API server boot + rooms/presence tests |
| **1** | `createAppleJwtTokenHandler` factory (MapKit/MusicKit); `checkBurstAndDailyLimits` helper (parse-title/youtube-search/audio-transcribe); single `CHAT_USERS_PREFIX` source + 4 hardcoded literals replaced | Live token endpoints (TTLs 1800s/604800s); `test-parse-title`/`test-media`; rooms/auth/listen suites |
| **2** | `src/shared/` runtime-neutral module pattern; AI model registry single source (`src/shared/aiModels`); validation primitives single source (`src/shared/validation`) | `bun run build`; 42 AI tests; auth/rooms tests; `test:unit` |
| **3** | `startLyricsSseResponse` shared SSE scaffolding (songs); `consolidateMemoryContent` shared memory module | Live `translate-stream` SSE round-trip; `test-song` (23); memory+AI tests (45) |

All commits keep product behavior unchanged; live verification used real Redis/Pusher/AI/MapKit
credentials present in the environment.

### Deferred to dedicated, individually-reviewed PRs (with rationale)

These cannot be verified to preserve behavior in a single autonomous PR without extensive
multi-client and per-app GUI testing; shipping them blind would risk the exact regressions the
audit warns about.

| Phase | Work | Why deferred |
|-------|------|--------------|
| **4** | Finish IndexedDB winner-selection (Wave 6); finish internal API-client unification (Wave 7) | VFS layer feeds 15+ modules (cloud sync, trash, cross-app open); needs per-app file save/load GUI testing. API-client swaps change error/retry semantics. |
| **5** | Split god hooks (`useIpodLogic` ~5.5k, `useFileSystem` ~2.2k, `useInternetExplorerLogic`, `useAiChat`) behind frozen return types | Behavior-preserving splits of large stateful hooks hinge on effect ordering / shared refs; only manual per-app testing (iPod playback, IE browsing, chat tools) can confirm no regression. |
| **6** | Sync domain split (Wave 8); **songs `deletedTrackIds` tombstone alignment** | **Data-loss class.** Songs sync uses version-conflict + client-side merge; persisting tombstones server-side is a real correctness need but requires multi-device, multi-cycle verification to confirm it doesn't resurrect or wrongly delete tracks. |
| **7** | Theme token table (`tabStyles`, `toolInlineCardShell`, menubar inline styles); collapse `*-force-font` CSS | Visual-regression risk across all 4 OS themes; requires screenshot verification per theme. The small `useThemeFlags` swaps are low value and need consumer-by-consumer equivalence checks. |
| **2 (rest)** | Chat / room / message types, sync snapshot types, lyrics types into `src/shared/` | Type-only consolidation across dozens of files in both projects; high churn, no functional benefit, real build-breakage risk. The `src/shared/` pattern is now established for these to follow. |

The shared-module pattern (`src/shared/`, importable by both the Vite frontend via `@/shared/*`
and the Bun API via `../../src/shared/*.js`) established in Phase 2 is the vehicle for the
remaining type consolidations.
