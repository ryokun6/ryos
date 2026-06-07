# Codebase Simplification Audit

Date: 2026-06-07

This audit covers duplicated or redundant code paths and unnecessary complexity across the ryOS frontend, API routes, shared contracts, sync/storage, media apps, chats, and integrations. It is intentionally documentation-only: product behavior should remain unchanged until each refactor is split into small migrations with focused tests.

## Method

- Ran scoped read-only investigations for frontend architecture, API architecture, shared type/state boundaries, and ROI/risk hotspots.
- Verified the highest-signal findings directly in source files before writing this report.
- Ranked findings by expected simplification value, blast radius, and likelihood of deleting duplicated code.

## Top 10 findings

### 1. App registration has several sources of truth

**Examples**

- `src/config/appRegistryData.ts:7-35` defines `appIds` and `AppId`.
- `src/config/appRegistryData.ts:56-82` defines app display names.
- `src/config/appRegistry.tsx:40-165` separately defines every lazy component and app ID cache key.
- `src/config/appRegistry.tsx:172-180` begins another metadata import table.
- `src/apps/base/types.ts` also carries app-level registry typing, and individual app `index.ts(x)` files export app metadata/constants.

**Why it matters**

Adding or renaming an app requires touching unrelated files and keeping IDs, display names, metadata imports, lazy imports, window config, and app-specific initial-data types aligned.

**Consolidate/delete**

- Consolidate app ID, display metadata, lazy loader, help items, window defaults, admin visibility, and initial-data typing into one typed registry descriptor.
- Keep `appRegistryData.ts` only as a lightweight generated/barrel view if stores need a component-free import.
- Delete duplicate per-app `BaseApp` exports once imports are migrated to metadata-only exports.

**Target architecture**

One `appDescriptors` table:

- `id`
- `name`
- `metadata`
- `helpItems`
- `loadComponent`
- `windowConfig`
- `initialData` type mapping
- optional `legacyAliases`

Generate `appIds`, `appNames`, lazy app registry, and basic app info from that table.

**Risk**

Medium. App launch, persistence, admin visibility, deep links, and legacy aliases all depend on IDs.

### 2. API route infrastructure is only partially centralized

**Examples**

- `api/_utils/api-handler.ts:44-151` centralizes CORS, method checks, Redis creation, auth resolution, error handling, analytics, and IP logging.
- `api/presence/heartbeat.ts:21-25` uses `apiHandler` but creates a second Redis client instead of using context Redis.
- Several large or older routes still define local `jsonResponse`/`errorResponse` helpers and local validation/error formatting.

**Why it matters**

Routes look similar but behave differently under invalid methods, invalid bodies, auth failures, rate limits, and analytics. This makes API changes harder to reason about and makes tests less reusable.

**Consolidate/delete**

- Use injected `redis` from `apiHandler` in all wrapped routes.
- Extend `apiHandler` context with `json`, `error`, and optional schema parsing helpers.
- Keep special-case wrappers only where streaming or multipart parsing requires it.

**Target architecture**

`apiHandler` should own request lifecycle, response helpers, structured errors, request-scoped Redis, auth, analytics, and optional `bodySchema`/`querySchema` parsing. Route files should mostly contain domain behavior.

**Risk**

Low to medium. Start with routes already using `apiHandler`; delay multipart and streaming routes.

### 3. AI model definitions are duplicated and bypassed

**Examples**

- `src/types/aiModels.ts:4-45` defines UI model metadata and default model.
- `api/_utils/_aiModels.ts:7-27` duplicates the same model list with a comment explaining the copy.
- `api/_utils/_aiModels.ts:37-52` maps registry IDs to provider SDK instances.
- Some AI endpoints still call `google(...)` or `openai(...)` directly for structured sub-tasks instead of using purpose-based model selection.

**Why it matters**

The UI can advertise models that drift from server support. Direct provider calls spread model policy across unrelated route files.

**Consolidate/delete**

- Move provider-free model catalog into a shared contract module.
- Keep provider SDK imports server-only in a resolver module.
- Replace hard-coded model calls with named purposes such as `chat`, `smallStructured`, `imageGeneration`, and `telegramDefault`.

**Target architecture**

`shared/aiModels` exports model IDs, metadata, defaults, and schemas. `api/_utils/ai-model-resolver.ts` maps IDs and purposes to provider SDK instances/options.

**Risk**

Medium. Provider options and model availability can affect AI output and cost.

### 4. Cloud sync has shared domain constants but duplicated routing and maps

**Examples**

- `src/utils/cloudSyncShared.ts:7-21` defines all sync domains.
- `src/utils/cloudSyncShared.ts:68-107` defines Redis/blob domain groups and type guards.
- `api/sync/_physical.ts:31-80` repeats Redis-domain routing with manual `domain === ...` checks.
- Client sync stores and hooks also repeat initial domain maps, debounce maps, deletion buckets, and IndexedDB routing.

**Why it matters**

Every new sync domain requires a multi-file checklist. Missing one location creates subtle partial-sync bugs.

**Consolidate/delete**

- Replace manual API routing checks with `isRedisSyncDomain` and `isBlobSyncDomain`.
- Derive initial maps from a domain descriptor table.
- Delete repeated `Object.fromEntries` variants and hard-coded category switches after descriptor adoption.

**Target architecture**

One `cloudSyncDomainDescriptors` table:

- physical storage kind
- logical category
- deletion bucket
- IndexedDB store
- debounce policy
- remote apply order
- snapshot validator

**Risk**

Medium to high. Sync touches persisted user data; start with behavior-preserving derivations.

### 5. Song API contracts and actions are split across overlapping modules

**Examples**

- `api/songs/index.ts:59-121` defines local song create/import schemas.
- `api/songs/_constants.ts` exports another set of song schemas and constants used elsewhere.
- `src/api/songs.ts` redeclares request/response interfaces for the frontend.
- `api/songs/[id].ts` handles CRUD plus many POST sub-actions in one route.

**Why it matters**

Schema drift between create/import/update endpoints is easy, and adding actions to `[id].ts` increases route complexity instead of isolating behavior.

**Consolidate/delete**

- Replace local schemas in `api/songs/index.ts` with shared song contract imports.
- Generate or infer client request/response types from the same schemas.
- Split `[id].ts` actions into internal action modules behind the same public route.

**Target architecture**

`shared/contracts/songs` owns schemas and inferred types. `api/songs/actions/*` owns route actions. `src/api/songs.ts` becomes a typed transport wrapper.

**Risk**

Medium. Bulk import and legacy export compatibility need regression tests.

### 6. Chat has duplicated realtime, contract, and tool-dispatch paths

**Examples**

- `src/apps/chats/hooks/useChatRoom.ts:100-260` owns Pusher refs, global handlers, room handlers, message dedupe, unread behavior, and typing state.
- `src/hooks/useBackgroundChatNotifications.ts:90-275` repeats Pusher refs, global handlers, room handlers, message dedupe, and unread/notification behavior.
- `api/rooms/_helpers/_types.ts:9-46`, `src/types/chat.ts:11-34`, and `src/api/rooms.ts` define overlapping room/message shapes.
- `src/apps/chats/tools/index.ts:6-43` has a client tool registry, but `src/apps/chats/hooks/useAiChat.ts:394-434` still dispatches many registered tools through a large switch.

**Why it matters**

Foreground and background chat behavior can diverge. Tool handlers are partly extracted but still controlled by a long hook-level switch.

**Consolidate/delete**

- Extract one chat subscription service with foreground/background callbacks.
- Move room/message contracts into shared schemas/types.
- Route registered tools through `executeToolHandler`, then extract file/list/open/read/write/edit handlers.

**Target architecture**

`chatRealtimeService` owns Pusher subscription lifecycle and normalized events. UI hooks provide mode-specific callbacks. `shared/contracts/chat` owns API shapes. Tool execution uses a single registry.

**Risk**

High for realtime behavior; medium for tool dispatch once covered by tests.

### 7. Media apps repeat playback and YouTube controller logic

**Examples**

- `src/apps/videos/hooks/useVideosLogic.ts:331-444` implements YouTube URL parsing, oEmbed fetch, title parsing, duplicate detection, add-and-play, status messages, and autoplay notes.
- `src/apps/karaoke/hooks/useKaraokeLogic.ts:533-610` and nearby logic implement listen sync, status timers, auto-hide, track-switch guards, and playback control.
- iPod and Karaoke also repeat add-by-video-ID, sharing, listen-session, and playback state transitions with app-specific variations.

**Why it matters**

Playback edge cases such as iOS autoplay, track-switch races, fullscreen state, and listen sync need to be fixed in multiple app hooks.

**Consolidate/delete**

- Extract pure YouTube add/metadata helpers first.
- Then extract shared hooks for playback status, track-switch guard, fullscreen controls, and listen sync.

**Target architecture**

`useYouTubeLibraryController` handles URL/video ID ingestion and metadata. `useMediaPlaybackController` handles player state and transitions. Apps provide adapters for library source, lyrics, UI chrome, and listen behavior.

**Risk**

High. Playback regressions are user-visible and device/browser dependent.

### 8. VFS and IndexedDB ownership are spread across app hooks and utilities

**Examples**

- `src/apps/finder/hooks/useFileSystem.ts:149-281` exports generic `dbOperations`.
- `src/utils/indexedDBOperations.ts:1-120` also owns generic IndexedDB content helpers.
- Finder, TextEdit, file store, migrations, and media caches import storage operations from different places.

**Why it matters**

Generic persistence utilities living inside a Finder hook blur ownership. File metadata, file contents, and app presentation/navigation are coupled.

**Consolidate/delete**

- Move `dbOperations` and `DocumentContent` into neutral IndexedDB/VFS utilities.
- Keep Finder hook focused on UI navigation and file actions.
- Centralize path/store routing helpers.

**Target architecture**

`useFilesStore` owns file metadata and mutations. `src/utils/vfs/*` owns path normalization and store routing. `src/utils/indexedDBOperations.ts` owns content CRUD. App hooks call these layers rather than importing from Finder.

**Risk**

Medium. File persistence and migration paths need careful tests.

### 9. External media/integration utilities are duplicated

**Examples**

- `api/youtube-search.ts:109-228` implements YouTube key rotation, quota detection, request building, response normalization, and result mapping.
- `api/tv/create-channel.ts:92-139` implements a separate YouTube search loop with similar quota handling and result mapping.
- Chat song-tool executors also search YouTube with another code path.
- `api/_utils/_mapkit-jwt.ts:24-86` and `api/_utils/_musickit-jwt.ts:34-103` duplicate Apple `.p8` PEM normalization and parsing.

**Why it matters**

API quota behavior, title normalization, error hints, and key fallbacks can diverge across features.

**Consolidate/delete**

- Add `api/_utils/youtube-service.ts` for search, quota detection, key rotation, and result normalization.
- Add `api/_utils/apple-jwt.ts` for generic Apple ES256 private-key parsing and token signing.

**Target architecture**

Feature routes call integration services with feature-specific options instead of rebuilding provider HTTP requests inline.

**Risk**

Low to medium. Start by moving code without changing output shapes.

### 10. Several obsolete or legacy paths are active enough to require deliberate deletion

**Examples**

- `src/apps/paint/components/PaintFiltersMenu.tsx:14-178` defines a full filters dropdown and filter list, but current references only import its `Filter` type.
- `src/apps/paint/components/paint-menu-bar/paintMenuFilters.ts` and related menubar files carry the active filters path.
- `src/config/appRegistryData.ts:37-40` maps legacy `infinite-pc` to live app ID `pc`, while `src/config/appRegistry.tsx:137-139` still imports from `apps/infinite-pc`.
- Deprecated stream/client IP aliases and legacy sync/blob/auth compatibility branches remain present in utility layers.

**Why it matters**

Legacy compatibility is useful when intentional, but stale paths increase reader cost and may hide real ownership.

**Consolidate/delete**

- Move `Filter` to a neutral Paint type file, then delete `PaintFiltersMenu.tsx` after confirming no dynamic import.
- Rename `apps/infinite-pc` toward `apps/pc` only with a persisted-key migration plan.
- Time-box legacy aliases behind explicit compatibility notes and remove them after usage checks.

**Target architecture**

Legacy support should be represented as named adapters/migrations, not mixed into live app/component names.

**Risk**

Low for Paint type move; high for app ID/path migrations and persisted data.

## Quick wins

1. Use `apiHandler`'s injected Redis in routes that currently create a second client.
2. Replace `api/sync/_physical.ts` manual domain checks with `isRedisSyncDomain` / `isBlobSyncDomain`.
3. Move Paint `Filter` type to a neutral file and delete the unused `PaintFiltersMenu` component after import cleanup.
4. Route already-extracted chat tools through `executeToolHandler`.
5. Extract YouTube key rotation/quota detection into one server utility.
6. Extract Apple private-key parsing into one generic helper used by MapKit and MusicKit.
7. Move Finder `dbOperations` into `src/utils/indexedDBOperations.ts`.
8. Normalize API JSON error helpers in `apiHandler` before touching route behavior.

## Larger refactors

1. Unified app descriptor registry.
2. Shared contract layer for songs, chat rooms, sync snapshots, and AI tool inputs.
3. Cloud sync domain descriptor table with validators and storage routing.
4. Song route action modules behind the existing public route contract.
5. Chat realtime subscription service with foreground/background adapters.
6. Shared media playback and YouTube ingestion controllers for Videos, iPod, and Karaoke.
7. Admin and Control Panels workflow controllers split by domain.

## Suggested migration sequence

1. **Low-risk derivations:** replace copied constants and helpers while preserving outputs.
2. **Contract extraction:** introduce shared schemas/types without changing API shapes.
3. **Route/helper adoption:** move one endpoint family at a time to shared API helpers.
4. **Storage descriptor adoption:** derive sync maps and routing from descriptors.
5. **Controller extraction:** split large hooks/routes internally while preserving public interfaces.
6. **Compatibility cleanup:** delete legacy branches after telemetry/tests prove no reads remain.
7. **Naming migrations:** rename obsolete namespaces only with explicit persisted-data migration plans.

## Tests and smoke checks needed

### Baseline checks before refactors

- `bun run test:unit`
- `bun run test:api` with `bun run dev:api` running
- `bun run test:chat-wiring`
- `bun run test:song`
- `bun test tests/test-cloud-sync-domains.test.ts tests/test-sync-logical-domains.test.ts`

### Area-specific checks

- **App registry/window plumbing:** launch every app from desktop, dock, terminal, and direct URL; verify lazy loading, recent apps, window size, and legacy aliases.
- **API handler/auth/rate limit:** invalid method, invalid body, missing auth, expired auth, rate limit, CORS preflight, and analytics behavior.
- **Cloud sync/VFS:** create, rename, move, trash, restore, edit TextEdit files, add images/applets, sync, reload, and restore.
- **Chats:** foreground room messages, background notifications, unread counts, typing, presence, IRC rooms, private rooms, and message deletion.
- **Media:** add YouTube URL, add by ID, duplicate detection, iOS autoplay fallback, fullscreen, listen host/listener sync, lyrics, and shared links.
- **Songs:** create/update/delete/import/export, lyrics, translation, furigana, soramimi, clear cached data, and legacy import formats.
- **Integrations:** YouTube quota fallback, MapKit token, MusicKit token, maps search, TV channel creation, and chat song tools.

## Dead or obsolete candidates to audit before deletion

- `src/apps/paint/components/PaintFiltersMenu.tsx` after moving the `Filter` type.
- Deprecated stream aliases in `src/utils/chunkedStream.ts`.
- Deprecated IP helper aliases in API rate-limit utilities.
- Legacy whole-blob sync compatibility branches after confirming all blob domains use item manifests.
- Legacy localStorage auth-token migrations after old clients are no longer supported.
- `apps/infinite-pc` naming once `pc` persisted IDs and imports have a migration path.

## Recommended target architecture summary

- **Frontend:** descriptor-driven app registry, shared window layout utilities, typed VFS storage layer, shared media controllers, chat realtime service, and one client tool registry.
- **API:** one route wrapper, one auth/session service, request-scoped rate limiting, shared response helpers, domain services for large areas, and integration utilities for YouTube/Apple providers.
- **Shared boundary:** provider-free schemas and types for app IDs, AI models, songs, chat rooms/messages, cloud sync domains/snapshots, and AI tool inputs/outputs.
- **Persistence:** descriptors and migrations should make legacy behavior explicit; live code should not need to know every historical storage shape forever.
