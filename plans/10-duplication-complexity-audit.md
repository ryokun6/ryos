# Duplication and Complexity Audit

Date: 2026-06-07

This audit identifies duplicated code paths, redundant abstractions, and complexity hotspots across the ryOS frontend, API, and shared boundaries. It is intentionally a planning document: product behavior should remain unchanged while future refactors reduce concepts, consolidate typed contracts, and make migration steps testable.

## Executive summary

The highest-return simplification work is concentrated in four areas:

1. Cloud sync spans many frontend stores, sync adapters, API physical domains, and server tool readers. It needs shared domain contracts before any coordinator rewrite.
2. AI tools have parallel browser and server/Telegram implementations. The execution split is valid, but the pure state transitions should be shared.
3. The media stack has one user-facing library spread across iPod, Karaoke, TV, Videos, Finder, listen sessions, and AI tools.
4. Chat/auth contracts and room/message shapes are duplicated across API helpers, frontend types, API clients, and store normalizers.

The safest immediate work is small consolidation: delete local helper copies, centralize contracts/constants, remove unused legacy helpers, and document intentional dual models.

## Top 10 findings

### 1. Cloud sync is a distributed monolith

**Representative paths**

- `src/sync/domains.ts`
- `src/hooks/useAutoCloudSync.ts`
- `src/stores/useCloudSyncStore.ts`
- `api/sync/_state.ts`
- `api/sync/_physical.ts`
- `api/sync/_domains.ts`
- `src/utils/cloudSyncShared.ts`
- `src/utils/cloudSyncFileMerge.ts`
- `src/utils/cloudSyncSettingsMerge.ts`

**Problem**

Logical domains, physical domains, merge behavior, tombstones, dirty tracking, and store subscriptions are spread across several modules. API routes also import frontend utility modules directly, which keeps the system working but blurs the server/client boundary.

**Consolidate**

- Move domain interfaces, logical-to-physical mapping, merge functions, tombstone helpers, and normalizers into dependency-free shared sync modules.
- Replace long conditional physical-domain routing with `isRedisSyncDomain()` and shared physical-domain metadata.
- Keep blob storage and Redis transport adapters separate from shared merge logic.

**Target architecture**

- `src/shared/domains/*`: snapshot types, normalizers, and merge helpers.
- `src/shared/sync/*`: domain mapping, version rules, deletion marker helpers.
- `src/sync/adapters/*`: store-specific adapters.
- `src/sync/SyncCoordinator`: single client owner for timers, dirty state, and realtime sync events.

**Risk**

High. Mistakes can cause sync conflicts or data loss.

**Migration**

1. Extract shared types and normalizers.
2. Move pure merge/plan helpers under tests.
3. Migrate one low-risk domain, such as stickies or maps.
4. Shrink `useAutoCloudSync` after adapters exist.

### 2. AI tool logic is duplicated between browser chat and server/Telegram

**Representative paths**

- `api/chat/tools/executors.ts`
- `api/chat/tools/schemas.ts`
- `api/chat/tools/index.ts`
- `src/apps/chats/hooks/useAiChat.ts`
- `src/apps/chats/tools/calendarHandler.ts`
- `src/apps/chats/tools/contactsHandler.ts`
- `src/apps/chats/tools/stickiesHandler.ts`

**Problem**

Tools such as calendar, contacts, stickies, documents, and song library run in the browser for web chat and on the server for Telegram. That execution split is necessary, but the state transitions are reimplemented. Examples include contact draft serialization, calendar list/create logic, sticky mutations, and generated ID behavior.

**Consolidate**

- Extract pure reducers such as `applyCalendarAction(state, input)` and `applyContactsAction(state, input)`.
- Keep two adapters: Zustand/IndexedDB for the browser and Redis sync-domain reads/writes for server tools.
- Generate client/server execution metadata from the tool registry instead of hand-maintained name sets.

**Target architecture**

- `src/shared/tools/types.ts`
- `src/shared/tools/calendarReducer.ts`
- `src/shared/tools/contactsReducer.ts`
- `src/shared/tools/stickiesReducer.ts`
- thin browser and server adapters around those reducers.

**Risk**

Medium. Tool behavior is user-facing and model-driven, so parity tests should come before broad extraction.

**Migration**

1. Extract shared input/output types from schemas.
2. Convert one domain tool, preferably contacts.
3. Add parity fixtures for browser and server adapters.
4. Split `api/chat/tools/executors.ts` by domain.

### 3. Media playback and library logic is spread across too many surfaces

**Representative paths**

- `src/apps/ipod/hooks/useIpodLogic.ts`
- `src/stores/useIpodStore.ts`
- `src/apps/karaoke/hooks/useKaraokeLogic.ts`
- `src/apps/tv/hooks/useTvLogic.ts`
- `src/apps/videos/hooks/useVideosLogic.ts`
- `src/components/shared/YouTubePlayer.tsx`
- `src/hooks/useListenSync.ts`
- `src/apps/finder/hooks/useFileSystem.ts`

**Problem**

iPod owns the main library and much playback behavior, but Karaoke, TV, Videos, Finder virtual folders, listen sessions, music quiz, and AI tools all depend on overlapping music/video concepts. Several components still import `ReactPlayer` directly even though `YouTubePlayer` centralizes YouTube player configuration.

**Consolidate**

- Split `useIpodStore` into a media library slice and playback/session slices.
- Route iPod, Karaoke, TV, Videos, and fullscreen views through shared player wrappers.
- Share cover/thumbnail resolution and lyrics display contracts.

**Target architecture**

- `src/media/useMediaLibraryStore`
- `src/media/usePlaybackController`
- `src/media/resolveArtwork`
- shared `LyricsDisplay` props consumed by iPod, Karaoke, and TV overlays.

**Risk**

Medium-high. Playback and sync regressions are easy to introduce.

**Migration**

1. Extract utility-only helpers first.
2. Introduce shared player wrapper without changing app state.
3. Move Karaoke playback onto shared playback primitives.
4. Split persisted library state after behavior is covered.

### 4. Chat room, message, and auth contracts are duplicated

**Representative paths**

- `api/rooms/_helpers/_types.ts`
- `api/_utils/auth/_types.ts`
- `src/types/chat.ts`
- `src/api/rooms.ts`
- `src/api/auth.ts`
- `src/stores/useChatsStore.ts`

**Problem**

The same room, message, user, token, and auth verification shapes are defined several times. The drift is already visible: message `clientId` exists in frontend/client types but not the API persistence type, `VerifyTokenResponse` has different fields, and timestamps are normalized inline in the chats store.

**Consolidate**

- Add shared contracts for chat and auth DTOs.
- Keep server-only persistence details in API helper types.
- Move timestamp/message normalization to shared functions.

**Target architecture**

- `src/shared/contracts/chat.ts`
- `src/shared/contracts/auth.ts`
- `src/api/rooms.ts` as wrappers only.
- `src/types/chat.ts` limited to UI-only extensions.

**Risk**

Medium. Room auth, optimistic dedupe, and IRC/private room flows need regression coverage.

**Migration**

1. Add shared contracts and re-export existing names.
2. Convert frontend API clients.
3. Convert API route helpers.
4. Delete unused request/response wrappers from `api/rooms/_helpers/_types.ts`.

### 5. VFS and file handling have three overlapping layers

**Representative paths**

- `src/stores/useFilesStore.ts`
- `src/apps/finder/hooks/useFileSystem.ts`
- `src/apps/finder/hooks/useFinderLogic.ts`
- `src/apps/textedit/hooks/useFileOperations.ts`
- `src/apps/applet-viewer/hooks/useAppletViewerLogic.ts`
- `src/sync/domains.ts`

**Problem**

Metadata, IndexedDB content, virtual folders, trash, aliases, cross-app save/load, Finder UI selection, and cloud-sync coupling are interleaved. `/Music` and `/Videos` virtual artist-folder construction are very similar. `FinderInitialData` is defined in three places.

**Consolidate**

- Create a VFS service boundary for `listPath`, `read`, `write`, `trash`, and virtual roots.
- Extract a shared virtual artist tree builder.
- Use one initial-data type for Finder.

**Target architecture**

- `src/services/vfs/FileMetadataStore`
- `src/services/vfs/FileContentRepository`
- `src/services/vfs/virtualTrees`
- Finder hooks consume the service instead of IndexedDB/store internals.

**Risk**

Medium. VFS changes affect Finder, TextEdit, Paint, Applet Viewer, Terminal, Chats tools, and cloud sync.

**Migration**

1. Extract pure virtual-tree helpers.
2. Consolidate Finder initial-data type.
3. Move content operations behind a service while preserving store APIs.
4. Update app file I/O one app at a time.

### 6. API YouTube and title-parsing paths repeat integration logic

**Representative paths**

- `api/youtube-search.ts`
- `api/tv/create-channel.ts`
- `api/chat/tools/executors.ts`
- `api/parse-title.ts`
- `api/songs/_utils.ts`

**Problem**

YouTube search key rotation, quota detection, URL construction, and response mapping are implemented multiple times. Title parsing also exists as an HTTP endpoint and in the songs pipeline with different prompts/models.

**Consolidate**

- Extract `api/_utils/youtube-client.ts`.
- Extract one `parseYouTubeTitle()` implementation and make the route a wrapper.

**Target architecture**

- Thin route handlers call shared integration clients.
- Shared clients normalize quota errors, response items, and fallback behavior.

**Risk**

Low-medium. The main risk is changing search result normalization or quota fallback order.

**Migration**

1. Add shared YouTube client with fixture tests.
2. Convert `/api/youtube-search`.
3. Convert TV channel creation.
4. Convert chat song search executor.
5. Unify title parser after search behavior is stable.

### 7. API auth and rate-limit helpers are inconsistent

**Representative paths**

- `api/_utils/api-handler.ts`
- `api/_utils/_rate-limit.ts`
- `api/chat.ts`
- `api/admin.ts`
- `api/share-applet.ts`
- `api/presence/heartbeat.ts`
- `api/listen/sessions/[id]/join.ts`
- `api/listen/sessions/[id]/leave.ts`
- `api/rooms/_helpers/_helpers.ts`

**Problem**

Most routes use `apiHandler`, but a few manually resolve auth after the wrapper or bypass expected modes. `api/chat.ts` has bespoke IP extraction and a hardcoded local-dev IP condition, while the canonical `getClientIp()` already handles trusted proxies. `api/rooms/_helpers/_helpers.ts` exports an unused naive `getClientIp()`.

**Consolidate**

- Extend `apiHandler` with stricter auth modes, including admin where needed.
- Use `getClientIp(req)` for chat rate limiting.
- Delete unused rooms IP helper after confirming no imports.

**Target architecture**

- `apiHandler` owns method routing, CORS, auth mode, request IP, logger, and analytics.
- Routes stay focused on domain behavior.

**Risk**

Medium for chat rate-limit behavior; low for unused helper deletion.

**Migration**

1. Add tests around auth modes and chat IP behavior.
2. Convert presence/listen/admin/share-applet to explicit auth modes.
3. Delete unused rooms helper exports.

### 8. API and frontend share code through the frontend tree

**Representative paths**

- `api/sync/_blob.ts`
- `api/sync/_state.ts`
- `api/sync/_physical.ts`
- `api/sync/_domains.ts`
- `api/_utils/contacts.ts`
- `api/_utils/song-library-state.ts`
- `api/chat/tools/types.ts`
- `api/chat/tools/executors.ts`
- `api/songs/_furigana.ts`

**Problem**

API code imports `../../src/utils/*`, `src/config/appIds`, and even a `Track` type from `src/stores/useIpodStore.js`. Runtime-neutral sharing is good, but importing through the frontend tree invites accidental React/Zustand/browser dependencies into API code.

**Consolidate**

- Move runtime-neutral modules to `src/shared` or a future package.
- Keep React/Zustand code out of modules imported by API.
- Replace store types in API with shared DTOs.

**Target architecture**

- `src/shared/contracts/*`
- `src/shared/domains/*`
- `src/shared/constants/*`
- `src/shared/validation.ts` and `src/shared/aiModels.ts` remain the model to extend.

**Risk**

Low-medium. Most work is import-path and type-boundary cleanup, but build resolution must be watched.

**Migration**

1. Move constants/contracts first.
2. Move domain normalizers.
3. Move API-imported utility modules.
4. Add lint/build guard to prevent new API imports from React/Zustand modules.

### 9. App/window/controller patterns vary by app

**Representative paths**

- `src/config/appRegistry.tsx`
- `src/config/appRegistryData.ts`
- `src/apps/base/types.ts`
- `src/apps/*/hooks/use*Logic.ts`
- `src/apps/*/hooks/use*AppController.ts`
- `src/apps/control-panels/hooks/useControlPanelsLogic.ts`
- `src/apps/applet-viewer/hooks/useAppletViewerLogic.ts`

**Problem**

Some apps use one `useXLogic` hook, others use a logic hook plus a controller, and several large hooks also own help/about dialog state, theme branching, menu wiring, and backup/restore behavior. Registry metadata and app ID unions are also spread across multiple files.

**Consolidate**

- Define `useAppController` as the app composition root.
- Move domain hooks under feature modules.
- Extract shared help/about dialog state.
- Keep registry data as the app ID source of truth.

**Target architecture**

- App component renders views.
- App controller wires menu/window/app chrome.
- Domain hooks manage feature behavior.
- Shared app chrome owns recurring help/about/theme glue.

**Risk**

Low-medium for small apps; medium for iPod, Chats, Finder, and Control Panels.

**Migration**

1. Extract shared help/about dialog hook.
2. Collapse trivial logic hooks such as Winamp if behavior remains identical.
3. Apply the pattern to one medium app.
4. Leave complex apps until their domain logic is split.

### 10. Runtime/config/docs drift creates obsolete paths

**Representative paths**

- `package.json`
- `README.md`
- `AGENTS.md`
- `docs/1.1-architecture.md`
- `public/docs/architecture.html`
- `src/stores/useChatsStore.ts`
- `api/_utils/auth/_validate.ts`

**Problem**

Docs reference `bun run dev:vercel`, but `package.json` has no such script. `test:chat-rooms` duplicates `test:new-api`. Legacy localStorage auth recovery remains in the chat store. `validateAdminAuth` is exported but appears unused.

**Consolidate**

- Remove or restore dead developer commands.
- Drop duplicate test aliases if not needed.
- Set a migration-removal policy for legacy chat auth recovery.
- Delete unused auth validators after confirming no external callers.

**Risk**

Very low for docs/aliases; medium for legacy auth removal because persisted users may still exist.

**Migration**

1. Fix docs/scripts drift.
2. Confirm legacy auth usage assumptions.
3. Remove unused validator and duplicate alias in a small cleanup PR.

## Quick wins

These can be handled as small PRs with limited blast radius:

- Replace local `formatKugouImageUrl` in `src/apps/admin/hooks/useAdminLogic.ts` with `@/utils/coverArt`.
- Replace `getYouTubeVideoId` iPod aliases with direct `parseYouTubeVideoId` imports, or keep only one compatibility export.
- Consolidate `FinderInitialData` into `src/types/appInitialData.ts` and add `viewType?` there.
- Delete unused `api/rooms/_helpers/_helpers.ts` `getClientIp()` after import checks.
- Re-export auth TTL constants from one source instead of duplicating them in rooms constants.
- Remove or restore the documented `bun run dev:vercel` path.
- Remove `test:chat-rooms` if `test:new-api` remains the canonical command.
- Generate `SERVER_EXECUTED_TOOL_NAMES` from chat tool registry metadata.
- Extract shared files-metadata normalization from `api/sync/_state.ts` and `src/sync/domains.ts`.
- Add a shared realtime channel sanitizer for chat and background notifications.

## Larger refactors

These should be split into behavior-preserving migrations:

1. Shared sync core plus client `SyncCoordinator`.
2. AI tool reducer/adapters for browser and Telegram.
3. Media library and playback kernel used by iPod, Karaoke, TV, Videos, listen sessions, and Finder virtual media folders.
4. VFS service boundary for metadata, IndexedDB content, virtual roots, trash, aliases, and cross-app file I/O.
5. Chats auth extraction and realtime service split.
6. API integration clients for YouTube, Apple JWT/private-key parsing, Cursor runs, and title parsing.
7. App controller convention and shared app chrome for recurring help/about/menu state.

## Proposed shared typed boundary

```text
src/shared/
  validation.ts
  aiModels.ts
  constants/
    calendar.ts
    languages.ts
    realtime.ts
    redisKeys.ts
    themes.ts
  contracts/
    auth.ts
    chat.ts
    irc.ts
    listen.ts
    songs.ts
    syncEnvelope.ts
  domains/
    calendar.ts
    contacts.ts
    filesMetadata.ts
    maps.ts
    settings.ts
    stickies.ts
  tools/
    calendarReducer.ts
    contactsReducer.ts
    stickiesReducer.ts
    types.ts
```

Rules:

- Shared modules must not import React, Zustand, browser globals, Redis, or Vercel request/response types.
- Frontend code imports shared modules through `@/shared/*`.
- API code imports shared modules through relative compiled paths, matching the existing shared validation and AI-model patterns.
- Store/Redis/IndexedDB adapters own I/O; shared reducers own state transitions.

## Suggested migration sequence

1. **Document and contract pass**
   - Add shared constants and contracts for auth, chat, listen, songs, languages, themes, calendar colors, and realtime channel names.
   - Keep compatibility re-exports during the first pass.

2. **Safe helper cleanup**
   - Remove local helper copies and unused helper exports.
   - Fix docs/scripts drift.
   - Add focused tests for the helpers before deleting copies.

3. **Shared sync normalizers**
   - Move files metadata, calendar, contacts, stickies, maps, and settings normalizers into shared domain modules.
   - Ensure fields such as `CalendarEvent.location` survive server and client round trips.

4. **API integration clients**
   - Extract YouTube search and title parsing clients.
   - Convert routes one at a time while preserving response shapes.

5. **AI tool reducers**
   - Convert contacts first, then calendar and stickies.
   - Keep web and Telegram adapters separate.

6. **VFS and media kernels**
   - Extract pure virtual tree builders and artwork/player helpers first.
   - Move app-specific code to shared services after tests cover current behavior.

7. **Store and hook decomposition**
   - Split large hooks after their dependencies are shared.
   - Keep public hook signatures stable during transitional phases.

## Tests and smoke checks

Run focused tests by area before and after each migration phase:

- `bun run test:unit` for wiring, shared utilities, iPod, cloud sync, runtime config, and self-host guardrails.
- `bun run test:api` with `bun run dev:api` for auth, rooms, media, AI, applet sharing, listen, and rate-limit behavior.
- `bun run test:new-api` after chat/auth contract changes.
- `bun run test:chat-regression` after chat store, Pusher, realtime, or notification changes.
- `bun run test:pusher-regression` after realtime config or channel-name changes.
- `bun run test:ai` after AI tool registry, server executor, or Ryo conversation changes.
- `bun run test:song` and `bun run test:media` after iPod, songs, YouTube, title parsing, or lyrics changes.
- `tests/test-cloud-sync-domains.test.ts`, `tests/test-cloud-sync-utils.test.ts`, and related cloud-sync suites after any sync normalizer, merge, or physical-domain change.
- `tests/test-finder-display-sort.test.ts` and `tests/test-finder-trash-store.test.ts` after VFS/Finder changes.
- `tests/test-tv-channels.test.ts` after TV YouTube client changes.
- Add parity tests for shared AI tool reducers so browser and server adapters produce the same result from the same input and state.

High-value manual smokes for larger refactors:

- iPod search/add/play, lyrics, Karaoke playback, TV MTV channel, and Videos playback.
- Finder `/Music` and `/Videos` virtual folders plus TextEdit save/load.
- Chat login/logout, room join/send, background notification, and one AI tool call.
- Control Panels sync tab, domain toggle, and cross-tab sync.
- Cursor agent start, poll, follow-up, and admin list.

## Dead or obsolete code candidates

These should be confirmed with import searches and persisted-data assumptions before deletion:

- `api/rooms/_helpers/_types.ts` request/response wrapper interfaces that have no call sites.
- `api/rooms/_helpers/_helpers.ts` `getClientIp()` in favor of `api/_utils/_rate-limit.ts`.
- `api/_utils/auth/_validate.ts` `validateAdminAuth` if no external callers exist.
- `src/stores/useChatsStore.ts` legacy localStorage auth recovery once the migration window is closed.
- `package.json` `test:chat-rooms` alias if `test:new-api` remains canonical.
- Documentation references to `bun run dev:vercel` unless the script is restored.
- `src/apps/pc/` as a standalone-looking app folder; it is currently Virtual PC internals.
- `usePcLogic` save/load state stubs if the current emulator cannot support them.
- `ReactScanDebug` production graph inclusion unless it is gated behind an explicit dev flag.

## Notes on intentional complexity

Do not simplify these without a specific design:

- Vercel plus standalone Bun server support.
- Upstash REST plus standard Redis support.
- Multiple file-asset backends for hosted and self-hosted deployments.
- Browser AI tool execution plus Telegram/server execution.
- Pusher plus local WebSocket realtime providers.
- Global song catalog versus per-user iPod library sync state.

