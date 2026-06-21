# Next Improvements — Codebase Audit & Proposals

Status: **proposal** (audit + roadmap; nothing implemented yet)

This document is a point-in-time audit of the ryOS codebase and a prioritized
set of proposals for the next round of refactoring, reliability/performance
work, hardening, and new features. It is meant to be read top-to-bottom by a
maintainer deciding what to pick up next; each item is sized by *which
subsystems change and how invasive the edit is*, not by calendar time.

Audit basis: full-tree review of `src/` and `api/`, plus the last ~4 months of
git history (~1,600 commits between 2026-02 and 2026-06).

- [1. Where the codebase is today](#1-where-the-codebase-is-today)
- [2. Refactoring proposals](#2-refactoring-proposals)
- [3. Reliability & performance](#3-reliability--performance)
- [4. Security & hardening](#4-security--hardening)
- [5. New features](#5-new-features)
- [6. Prioritization](#6-prioritization)

---

## 1. Where the codebase is today

Recent work has been dominated by a few large efforts that are now in their
final-cleanup phase:

- **Cloud Sync v2** — journal-based delta sync, shipped via direct cutover
  (`docs/proposals/cloud-sync-v2.md`). v1 backup routes (`api/sync/backup.ts`,
  `status.ts`, `backup-token.ts`) still run in parallel.
- **Canonical Redis key scheme** — `src/shared/redisKeys.ts` is now the source
  of truth, but several hot paths still carry legacy dual-read fallbacks
  (listen sessions, airdrop presence, rate-limit counters).
- **macOS Aqua / "Aqua Glass" theme overhaul** — large CSS surface
  (`src/styles/themes/aqua.css` ~2.8k lines, `aqua-glass.css` ~1.4k,
  `dark-aqua.css` ~1.9k, `control-panels-mac.css` ~1.6k). This is the single
  most fix-prone area in recent history (browser-specific `backdrop-filter`).
- **Tauri → Electron desktop shell** — migration is **complete**; only
  changelog/test references to Tauri remain. No `src-tauri/` directory.
- **Self-service account recovery & deletion**, dynamic/shader wallpapers with
  a 3-tier perf classifier, and a menu-descriptor + keyboard-shortcut refactor.

The architecture is healthy overall: `*AppComponent.tsx` files are mostly thin
shells delegating to `use*Logic` hooks + `AppWindowShell`, the API layer has a
shared `apiHandler` wrapper, and there are 210 `bun:test` suites. The debt is
concentrated in a handful of **god-files** (logic hooks and a few API handlers)
and in **incomplete migrations** that left dual-code paths behind.

Quantitative hotspots (lines):

| File | Lines | Kind |
|------|------:|------|
| `src/apps/ipod/hooks/useIpodLogic.ts` | 5,143 | logic hook |
| `src/stores/useIpodStore.ts` | 2,535 | store (persist v40) |
| `src/apps/chats/hooks/useAiChat.ts` | 1,920 | logic hook |
| `src/apps/internet-explorer/hooks/useInternetExplorerLogic.ts` | 1,833 | logic hook |
| `api/songs/[id].ts` | 1,694 | API handler |
| `api/chat/tools/executors.ts` | 1,642 | AI tool executors |
| `src/apps/finder/hooks/useFileSystem.ts` | 1,729 | logic hook |
| `api/_utils/_memory.ts` | 1,265 | memory store |
| `api/admin.ts` | 1,203 | admin monolith |
| `api/iframe-check.ts` | 1,126 | IE proxy |

---

## 2. Refactoring proposals

### 2.1 Decompose the iPod stack (highest debt concentration)

`useIpodLogic.ts` (5,143) + `useIpodStore.ts` (2,535) + `useAppleMusicLibrary.ts`
(1,778) ≈ 9.4k lines, and recent history shows recurring Apple Music
playback-race and render-loop fixes here.

Proposal:
- Split `useIpodLogic` into cohesive sub-hooks: menu/wheel navigation, Cover
  Flow, playback transport, Apple Music bridge, lyrics, and the mini-games.
- Slice `useIpodStore` persisted state by concern (playback vs library/catalog
  vs lyrics/display preferences) so the v40 migration chain stops touching
  unrelated state, and replace the `as any` casts in `migrate`.
- Treat the existing satellite modules (`ipodPreload`, `ipodTrackMetadataSync`,
  `ipodTrackOrder`, `ipodCatalogTrackMapping`, `playbackTime`) as the template
  for the boundary.

Risk: high (most-touched user-facing app) — do behind the existing test suite
(`test-ipod-*`) and add playback-race regression tests first.

### 2.2 Generalize store persistence

~25 stores hand-roll `STORE_VERSION` + `partialize` + bespoke `migrate`, and the
biggest ones leave verbose `console.log` in the production migrate path
(`useChatsStore` ~56 logs, `useFileSystem` ~69, `useIpodStore` ~32).

Proposal: introduce a `createPersistedStore({ name, version, migrate,
partialize })` helper with typed, registered migrations and a debug logger that
is silent in production. Generalize the already-good `createDebouncedPersistStorage`
(currently only in `useFilesStore`/`useIpodStore`/`useChatsStore`).

### 2.3 Split the API god-files

- `api/songs/[id].ts` (1,694) → facet modules (CRUD, lyrics, streaming,
  furigana, Kugou).
- `api/chat/tools/executors.ts` (1,642) → per-tool files (web-fetch, memory,
  songs, documents, maps, HTML).
- `api/admin.ts` (1,203) → replace the single `action`-string POST dispatch
  with discrete sub-handlers (also improves testability).

### 2.4 Finish the migrations that left dual paths

- **Sync v1 retirement**: remove `api/sync/backup*.ts` + `status.ts` once v2
  adoption is confirmed (telemetry on v1 route hits first).
- **Legacy Redis dual-reads**: drop fallback reads in `listen/_helpers/_redis.ts`,
  `airdrop/send.ts`, and the `rl:*` → `rate:*` translation once the migration
  CLI has been run everywhere. Reuse the handler-injected `redis` client in
  `rooms/_helpers/_redis.ts` and `listen/_helpers/_redis.ts` instead of calling
  `createRedisClient()` per operation.
- **Theme-token consolidation**: ~20 components still branch on raw theme-id
  strings (`AdminToolbar`, `WindowsTaskbar`, `EditorToolbar`, etc.) despite
  `useThemeFlags` + `themes/index.ts` helpers. Finish routing these through the
  helpers / `data-os-platform` tokens.

### 2.5 Adopt shared UI primitives everywhere

- **Help/About**: `useAppHelpAboutDialogs` + `AppHelpAboutDialogs` exist and are
  used by ~15 apps, but iPod, Karaoke, Videos, Chats, Admin, IE, and Applet
  Viewer still hand-roll `isHelpDialogOpen`/`isAboutDialogOpen`.
- **Media menu bars**: iPod/Karaoke/Videos/TV share the `AppMenuBarShell` +
  File/Controls/View/Library structure but duplicate `use*MenuBar.ts`
  view-models — extract a media-menu factory.
- **Long-press**: deprecate touch-only `useLongPress` in favor of
  `usePointerLongPress`.
- **Admin prop-drilling**: `AdminAppComponent` passes 40+ props from a flat
  `useAdminLogic` bag — group into context or sub-view-models.

---

## 3. Reliability & performance

### 3.1 Fix `deleteToken` full-keyspace SCAN

`api/_utils/auth/_tokens.ts` runs `SCAN auth:user:*:sessions` across **every
user** on every single-token delete (logout / refresh). This is O(all users)
per logout. Use the reverse index: the session record already knows its owner,
so delete from `auth:user:{owner}:sessions` directly.

### 3.2 Attack the recurring bug classes

History shows repeated, similar fixes — worth structural guards rather than
one-off patches:
- **Duplicate React keys / missing effect cleanups** (multiple PRs). Add an
  eslint rule pass (`react-hooks/exhaustive-deps`) and a dev-time duplicate-key
  detector around the mapped lists (dock slots, chat rooms) that regress most.
- **Aqua Glass `backdrop-filter`** (Safari/Chrome). Centralize the glass
  material into a small set of tested utility classes + a feature-detection
  shim, instead of per-component prefixed CSS that drifts.
- **Apple Music playback races** (see 2.1) — add deterministic state-machine
  tests around `setQueue`/pause transitions.

### 3.3 Rate-limit the unprotected proxies

`/api/stocks`, `/api/currency-rate`, `/api/users` (search), and `GET /api/rooms`
have no rate limits and proxy/scan on every call. Add `checkCounterLimit`
buckets (these are cheap, high-abuse-potential relays).

### 3.4 Generalize debounced persistence & worker offload

The Spotlight index already runs in a worker. Audit whether the largest store
writes (files, iPod library) should batch through the shared debounced storage
helper to reduce main-thread serialization jank on big libraries.

---

## 4. Security & hardening

### 4.1 Replace the hardcoded-`ryo` admin gate with a role flag

`api/_utils/api-handler.ts` treats username `ryo` as admin. A stolen `ryo`
session = full admin, and there is no second admin or audit trail. Add an
`isAdmin`/role field to the user profile, gate `auth: "admin"` on it, and log
admin actions.

### 4.2 Authenticate (or at least rate-limit) `/api/users`

`api/users/index.ts` is `auth: none` and runs a Redis SCAN-backed username
search with no limits. At minimum require `optional`→`required` auth for the
full search and add a rate bucket.

### 4.3 Add a Zod validation layer at the `apiHandler` boundary

Zod is used in only ~12 API files. High-value untyped bodies: `POST /api/chat`
(messages/systemState validated only with `Array.isArray`), `speech.ts`,
`rooms` message bodies, `analytics/events`. Add an optional `schema` option to
`apiHandler` that parses + 400s on invalid input, returning structured error
codes.

### 4.4 Session lifetime & cookie review

1-year session TTL (`USER_TTL_SECONDS`) is long. Consider shorter sliding
sessions with refresh, and reconcile the `PASSWORD_BCRYPT_ROUNDS` constant with
the hardcoded `10` in `_password.ts`.

---

## 5. New features

These build naturally on systems that already exist; ordered by leverage.

### 5.1 Self-host one-click realtime (drop the Upstash limitation)

Local WebSocket realtime requires `REDIS_URL` (Upstash REST can't pub/sub), so
Upstash-only deploys silently lose live chat/presence/sync. Ship a bundled
lightweight pub/sub fallback (or document a managed Redis path in the
self-host guide) so a single deploy gets full realtime.

### 5.2 Role-based multi-admin + audit log

Once 4.1 lands, expose an admin "team" management pane and an append-only audit
log of admin actions in the existing Admin app — useful for the growing
moderation surface (rooms, bans, Redis browser).

### 5.3 Applet Store enhancements

`applet-viewer` + `share-applet` already exist. Natural additions: applet
versioning/forking, a public gallery with the existing OG-share pipeline, and
per-applet rate-limited AI regeneration.

### 5.4 Cross-device "handoff" for media + documents

Cloud Sync v2 + realtime already carry per-user state. Add a handoff affordance
(continue iPod playback / open TextEdit doc on another device) using the
existing sync ops channel — low new surface, high "wow".

### 5.5 OpenAPI spec + typed client generation

The API is large (82 route files) and `src/api/` only covers 8 domains by hand.
Generate an OpenAPI document from the route manifest + Zod schemas (after 4.3),
then codegen typed clients to replace ad-hoc `fetch` calls scattered in app
code.

---

## 6. Prioritization

**Do first (low risk, high payoff):**
- 3.1 `deleteToken` SCAN fix
- 3.3 rate-limit unprotected proxies
- 4.2 `/api/users` auth/limit
- 2.2 shared persisted-store helper (+ strip prod migrate logs)

**Foundational (enables later work):**
- 4.1 role-based admin → unlocks 5.2
- 4.3 Zod-at-`apiHandler` → unlocks 5.5
- 2.4 finish dual-path migrations (sync v1 retirement, legacy Redis reads)

**Large but high-value:**
- 2.1 iPod stack decomposition
- 2.3 API god-file splits
- 3.2 structural fixes for the recurring bug classes (esp. Aqua Glass)

**Feature bets:**
- 5.1 self-host realtime fallback
- 5.4 cross-device handoff
- 5.3 applet store enhancements

> Scope note: every item above is independently shippable. The "do first" bucket
> is intentionally small and self-contained so it can land without coordinating
> with the in-flight migrations.
