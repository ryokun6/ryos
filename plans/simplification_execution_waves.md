# ryOS simplification execution waves

## Goal

Turn the audit into a deletion-first simplification program that:

- reduces the number of patterns for storage, fetches, sync, and theming
- removes dead abstractions and compatibility scaffolding
- makes data flow more obvious
- preserves product behavior while shrinking the architecture surface

## Guardrails

- prefer deletion over adaptation
- prefer one obvious path over option-heavy helpers
- move shared pure logic into runtime-neutral modules when both `src/` and `api/` need it
- do not preserve old cloud-sync architecture; replace it outright
- keep each wave independently reviewable and shippable

## Current status / handoff snapshot

### Completed

- Wave 1 is complete:
  - dead backend request-context path removed
  - duplicate request header helpers collapsed
  - stale Finder `STORES` re-export removed
  - docs updated away from the old middleware/request-context pattern

- Wave 4 is complete at the architectural boundary level:
  - sync engine/state/transport now live under `src/sync/`
  - old sync sidecar modules were deleted
  - old `src/utils/cloudSync.ts` entrypoint was removed
  - remaining sync compatibility read paths were deleted

- Wave 5 is partially complete:
  - `useThemeFlags()` exists
  - repeated theme booleans were replaced in key touched UI/app files

- Wave 6 is complete:
  - `src/utils/indexedDBOperations.ts` is the winning IndexedDB helper surface
  - Finder-owned `dbOperations` was removed in favor of the shared utility
  - `useFilesStore` and `useDisplaySettingsStore` now use the shared helper path
  - direct runtime IndexedDB CRUD flows were reduced to the shared module plus backup/migration utilities

- Wave 7 is complete:
  - auth, applet sharing, media, presence, AirDrop, and sync status/backup client calls now flow through `src/api/*`
  - `src/api/core.ts` now supports non-JSON request bodies for shared API wrappers
  - auth-related client calls now flow through `src/api/auth.ts`
  - remaining song, typing, link-preview/share-link, and sync transport clients now flow through `src/api/*`
  - raw internal fetches were reduced to framework-owned transport URLs (`useChat` / AI SDK) rather than ad hoc request code

- Wave 8 is partially complete:
  - sync song/video/sticky/calendar/contact serializers and apply/merge logic now live in `src/sync/domains/*.ts`
  - `src/sync/domains.ts` is smaller and now delegates several domain concerns
  - settings/files/blob-specific logic still remain in the main module and need further extraction

### Partially complete

- Wave 2 is only partially complete:
  - room and song API paths were unified through `src/api/*`
  - some internal API calls still bypass the shared client layer and use direct `abortableFetch`

- Wave 3 is only partially complete:
  - backup/restore serialization was unified
  - `indexedDBOperations.ts` was not fully narrowed to a single winning API shape
  - multiple direct IndexedDB transaction paths still exist

- Wave 4 is only partially complete at the domain-file granularity:
  - `src/sync/domains.ts` and `src/sync/types.ts` now exist
  - the sync monolith was moved out of `src/utils/cloudSync.ts`
  - domain logic is still grouped inside one large `src/sync/domains.ts` file rather than split into per-domain modules

### Known unrelated noise still visible during sync verification

- `useFilesStore` rehydrate still logs a null-spread failure in `withRequiredRootDirectories()`
- this does not currently fail the focused sync suite, but it should be cleaned up

## Recommended next agent order

1. Finish internal API client unification
2. Split `src/sync/domains.ts` into per-domain modules
3. Unify style tokens between `src/index.css` and `src/styles/themes.css`
4. Reduce legacy Windows CSS runtime surface
5. Fix `useFilesStore` rehydrate noise

## Wave order

### Wave 1 - dead abstractions and duplicated helpers

**Intent**

Remove low-value abstraction layers and helper duplication that make later rewrites harder.

**Scope**

- remove the dead request-context path from `api/_utils/middleware.ts`
- remove dead helper exports from `api/_utils/middleware.ts`
- introduce one shared request helper module for header access
- remove duplicate `getHeader()` implementations
- remove Finder's `STORES` re-export from `src/apps/finder/hooks/useFileSystem.ts`
- replace per-store shallow wrapper boilerplate in `src/stores/helpers.ts` with one generic helper
- update docs that still describe the old backend helper path

**Expected payoff**

- smaller API helper surface
- fewer local helper clones
- clearer backend entry pattern
- less fake indirection in store helpers

**Commit**

- `refactor: remove dead request helpers and duplicate store wrappers`

**Verification**

- `bun run build`
- targeted bun tests for API-architecture-adjacent behavior if needed

---

### Wave 2 - obvious client/data-access paths

**Status**

Partially complete.

**Intent**

Collapse competing frontend access layers so components and stores stop reaching for raw transport primitives.

**Scope**

- standardize internal API calls on `src/api/*` + `apiRequest`
- add missing chat room write wrappers to `src/api/rooms.ts`
- migrate `useChatsStore` room create/delete/send flows away from local raw fetch helpers
- unify song-related internal API access in `src/api/songs.ts`
- migrate `useSongCover` to `src/api/songs.ts`
- remove helper drift where frontend code mixes `apiRequest`, `abortableFetch`, and direct internal fetches

**Expected payoff**

- one obvious internal API path
- consistent error handling and retry behavior
- less fetch boilerplate in stores/hooks

**Commit**

- `refactor: unify frontend api access paths`

**Verification**

- `bun run build`
- targeted chat and song-related test suites

---

### Wave 3 - IndexedDB and backup/restore simplification

**Status**

Partially complete.

**Intent**

Stop splitting blob/content persistence across fake layers and duplicated flows.

**Scope**

- extract one shared IndexedDB content helper surface
- reuse one backup/restore serializer for local export, local restore, and cloud backup/export paths
- remove duplicated backup/restore code from `useControlPanelsLogic.ts`
- narrow `indexedDBOperations.ts` to the winning API shape
- reduce direct transaction code outside the shared module

**Expected payoff**

- one blob serialization format
- less duplication in control panels
- cleaner path to a later file-system split

**Commit**

- `refactor: unify indexeddb access and backup flows`

**Verification**

- `bun run build`
- targeted file-system and cloud-backup regression checks

---

### Wave 4 - cloud sync rewrite

**Status**

Mostly complete at the module-boundary level; still needs per-domain file splits inside `src/sync/domains.ts`.

**Intent**

Delete the current layered sync architecture and replace it with a smaller, explicit engine.

**Rewrite stance**

Do not preserve the existing logical/transport/sidecar split just because it already exists. Keep the external caller surface needed by `useAutoCloudSync` and control panels, but replace the internals aggressively.

**Scope**

- replace the current cloud sync internals with:
  - one sync engine
  - one persisted sync state source
  - one serializer/apply adapter per domain
  - one transport layer
- remove `cloudSyncClientState.ts`, `cloudSyncSettingsState.ts`, `cloudSyncLocalChangeState.ts` if their responsibilities can be absorbed into the engine/state layer
- collapse `syncLogicalClient.ts` and `syncTransportClient.ts` into the rewritten sync engine unless a tiny split remains clearly justified
- keep only the public API needed by:
  - `src/hooks/useAutoCloudSync.ts`
  - `src/apps/control-panels/hooks/useControlPanelsLogic.ts`
  - `src/utils/cloudSyncEvents.ts`
  - `src/stores/useCloudSyncStore.ts`

**Target shape**

- `src/sync/engine.ts`
- `src/sync/domains.ts`
- `src/sync/state.ts`
- `src/sync/transport.ts`
- `src/sync/types.ts`

**Expected payoff**

- fewer moving parts
- easier debugging
- easier feature work on sync-enabled apps
- fewer state races caused by cross-module sidecars

**Commit**

- `refactor: rewrite cloud sync engine`

**Verification**

- `bun run build`
- targeted sync-related tests if available
- focused manual terminal checks against the standalone API if needed

---

### Wave 5 - theme branching cleanup

**Status**

Partially complete.

**Intent**

Replace repeated theme booleans and reduce styling drift before it grows further.

**Scope**

- introduce a shared `useThemeFlags()` or equivalent helper backed by `src/themes/index.ts`
- replace repeated `currentTheme === "xp" || currentTheme === "win98"` checks in touched code
- reduce token duplication between `src/index.css` and `src/styles/themes.css` where safe
- keep legacy Windows CSS loading only as an explicit compatibility layer

**Expected payoff**

- fewer repeated theme branches
- clearer styling model
- easier app/component implementation

**Commit**

- `refactor: centralize theme flags and simplify style branching`

**Verification**

- `bun run build`

## Execution notes

- Waves should land in order.
- Each wave should be committed separately.
- If a wave reveals dead code in adjacent files, delete it in the same wave instead of deferring.
- If cloud sync becomes easier by deleting old compatibility behavior, delete it.

## Remaining follow-up waves

### Wave 6 - finish IndexedDB winner selection

**Intent**

Collapse the remaining competing IndexedDB entrypoints into one obvious API.

**Scope**

- decide whether `src/utils/indexedDBOperations.ts` or Finder-owned `dbOperations` wins
- migrate `useDisplaySettingsStore`, Finder, and any remaining direct transaction code to the winner
- reduce `ensureIndexedDBInitialized()` call sites outside the chosen shared module
- remove dead or duplicate helpers after migration

### Wave 7 - finish internal API client unification

**Intent**

Eliminate remaining direct internal API calls that bypass `src/api/*`.

**Scope**

- move auth-related client calls to `src/api/auth.ts`
- move remaining AI/internal mutation calls behind `src/api/*` wrappers where appropriate
- leave raw `fetch` only for third-party services, not ryOS internal APIs

### Wave 8 - split sync domains by concern

**Intent**

Break `src/sync/domains.ts` into real per-domain modules so the sync rewrite stops at a true modular boundary instead of a moved monolith.

**Suggested target shape**

- `src/sync/domains/settings.ts`
- `src/sync/domains/files.ts`
- `src/sync/domains/songs.ts`
- `src/sync/domains/videos.ts`
- `src/sync/domains/stickies.ts`
- `src/sync/domains/calendar.ts`
- `src/sync/domains/contacts.ts`
- `src/sync/domains/blob-shared.ts`
- `src/sync/domains/index.ts`

### Wave 9 - style token unification

**Intent**

Reduce the remaining styling-system overlap after the theme flag cleanup.

**Scope**

- choose the canonical token source between `src/index.css` and `src/styles/themes.css`
- remove duplicated token definitions where safe
- keep legacy Windows styling as an explicit compatibility layer instead of a broad second styling system
