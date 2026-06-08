# Duplication and Complexity Cleanup Progress

Date: 2026-06-07

This file tracks implementation progress for `plans/10-duplication-complexity-audit.md`.

## Completed on this branch

- [x] Added the audit plan in `plans/10-duplication-complexity-audit.md`.
- [x] Added `src/shared/domains/filesMetadata.ts`.
- [x] Replaced duplicate files-metadata normalizers in `api/sync/_state.ts` and `src/sync/domains.ts`.
- [x] Added `tests/test-files-metadata-normalizer.test.ts`.
- [x] Changed `/api/chat` anonymous rate limiting to use canonical `getClientIp()`.
- [x] Removed the unused rooms `getClientIp()` helper from `api/rooms/_helpers/_helpers.ts`.
- [x] Added `auth: "admin"` support to `apiHandler`.
- [x] Moved `/api/admin` and `/api/presence/heartbeat` onto wrapper-level auth.
- [x] Added `api/_utils/youtube-client.ts`.
- [x] Replaced duplicated YouTube search/key-rotation logic in `api/youtube-search.ts`, `api/tv/create-channel.ts`, and `api/chat/tools/executors.ts`.
- [x] Added `tests/test-youtube-client.test.ts`.
- [x] Added `api/_utils/parse-youtube-title.ts`.
- [x] Moved title parsing from `api/parse-title.ts`, `api/songs/_utils.ts`, `api/chat/tools/executors.ts`, and `api/_utils/og-share.ts` onto the shared parser.
- [x] Added `tests/test-parse-youtube-title.test.ts`.
- [x] Re-exported rooms auth TTL constants from `api/_utils/auth/_constants.ts`.
- [x] Added `src/shared/contracts/auth.ts` and re-exported auth response DTOs from API/frontend legacy paths.
- [x] Added `src/shared/constants/realtime.ts` and migrated chat, sync, listen, and presence channel builders.
- [x] Added `src/shared/contracts/chat.ts` with shared chat room/message/user types and timestamp normalization.
- [x] Added `src/shared/contracts/listen.ts` and migrated listen API/store/UI type paths.
- [x] Added `src/shared/contracts/irc.ts` and migrated IRC server/channel DTOs plus create-room IRC options.
- [x] Deleted obsolete room request/response wrapper types from `api/rooms/_helpers/_types.ts`.

## Current test notes

- [x] `bun test tests/test-files-metadata-normalizer.test.ts`
- [x] `bun test tests/test-rate-limit-client-ip.test.ts`
- [x] `bun test tests/test-cloud-sync-utils.test.ts --test-name-pattern "file metadata|FilesMetadata"`
- [x] `bun run test:admin`
- [x] `bun test tests/test-new-api.test.ts --test-name-pattern "Presence"`
- [x] `bun test tests/test-new-api.test.ts --test-name-pattern "Admin login|Presence"`
- [x] `bun test tests/test-youtube-client.test.ts`
- [x] `bun test tests/test-chat-tools-songs.test.ts`
- [x] `bun run test:media`
- [x] `bun test tests/test-tv-channels.test.ts tests/test-tv-utils.test.ts tests/test-tv-control-schema.test.ts tests/test-tv-store-default-channel-removal.test.ts`
- [x] `bun test tests/test-parse-youtube-title.test.ts`
- [x] `bun run test:parse-title`
- [x] `bun run test:song`
- [x] `bun test tests/test-song-lyrics-match.test.ts`
- [x] `bun test tests/test-og-share.test.ts`
- [x] `bun run test:ai`
- [x] `bun test tests/test-auth-extra.test.ts`
- [x] `bun test tests/test-rooms-extra.test.ts`
- [x] `bun test tests/test-new-api.test.ts --test-name-pattern "Auth|Rooms|Messages"` reached the known unrelated login fixture failure; rooms/messages covered paths passed.
- [x] `bun test tests/test-realtime-channels.test.ts`
- [x] `bun run test:pusher-regression`
- [x] `bun test tests/test-chat-notification-logic.test.ts tests/test-chat-notification-integration-wiring.test.ts tests/test-chat-broadcast-wiring.test.ts tests/test-chat-hook-channel-lifecycle-wiring.test.ts tests/test-chat-store-guards-wiring.test.ts tests/test-pusher-client-refcount.test.ts tests/test-pusher-client-constructor-wiring.test.ts`
- [x] `bun run test:listen-security`
- [x] `bun test tests/test-chat-contracts.test.ts`
- [x] `bun test tests/test-chat-notification-logic.test.ts tests/test-chat-notification-integration-wiring.test.ts tests/test-chat-broadcast-wiring.test.ts tests/test-chat-hook-channel-lifecycle-wiring.test.ts tests/test-chat-store-guards-wiring.test.ts`
- [x] `bun test tests/test-listen-contracts.test.ts`
- [x] `bun test tests/test-irc-contracts.test.ts`
- [x] `bun test tests/test-irc-bridge.test.ts`
- [x] `bun test tests/test-stickies-sync-domain.test.ts`
- [x] `bun test tests/test-cloud-sync-utils.test.ts --test-name-pattern "deletion|filters deleted|stickies"`
- [x] `bun test tests/test-server-app-state-tools.test.ts tests/test-chat-tools-songs.test.ts`
- [x] `bun test tests/test-contacts-tool-reducer.test.ts`
- [x] `bun test tests/test-calendar-tool-reducer.test.ts`
- [x] `bun test tests/test-stickies-tool-reducer.test.ts`
- [x] `bun test tests/test-cover-art.test.ts`
- [x] `bun test tests/test-media-library-store-facade.test.ts`
- [x] `bun test tests/test-listen-sync-adapter.test.ts`
- [x] `bun test tests/test-lyrics-playback-input.test.ts`
- [x] `bun test tests/test-vfs-virtual-trees.test.ts`
- [x] `bun test tests/test-legacy-auth-token-migration.test.ts`
- [x] `bun test tests/test-chat-auth-api-wiring.test.ts`
- [x] `bun test tests/test-youtube-url-utils.test.ts tests/test-ipod-apple-music.test.ts tests/test-ipod-track-metadata-sync.test.ts tests/test-finder-display-sort.test.ts tests/test-finder-trash-store.test.ts`
- [x] `bun test tests/test-server-app-state-tools.test.ts tests/test-chat-tools-contacts.test.ts`
- [x] `bun test tests/test-maps-sync-domain.test.ts`
- [x] `bun test tests/test-contacts-sync-domain.test.ts`
- [x] `bun test tests/test-calendar-sync-domain.test.ts`
- [x] `bun test tests/test-settings-sync-domain.test.ts`
- [x] `bun test tests/test-cloud-sync-domains.test.ts`
- [x] `bun test tests/test-cloud-sync-tv-upload-apply.test.ts`
- [x] `bun test tests/test-contacts-tool-reducer.test.ts`
- [x] `bun test tests/test-chat-tools-contacts.test.ts tests/test-server-app-state-tools.test.ts`
- [x] `bun run build`
- [ ] `bun test tests/test-cloud-sync-utils.test.ts` full suite currently has an unrelated DOM mock gap in settings hydration.
- [ ] `bun run test:new-api` full suite currently has an unrelated login fixture failure returning 401 after registration.

## Phase status

- [x] Phase 1: API integration cleanup.
- [x] Phase 2: Title parsing consolidation.
- [x] Phase 3: Shared contracts and constants.
- [ ] Phase 4: Larger planned refactors (4A complete; 4B next).

## Next implementation checklist

### Phase 1: API integration cleanup

- [x] Add `api/_utils/youtube-client.ts`.
- [x] Add `tests/test-youtube-client.test.ts`.
- [x] Migrate `api/youtube-search.ts` to the shared client.
- [x] Migrate `api/tv/create-channel.ts` to the shared client.
- [x] Migrate `api/chat/tools/executors.ts` song search to the shared client.
- [x] Run `bun test tests/test-youtube-client.test.ts`.
- [x] Run `bun run test:media`.
- [x] Run `bun test tests/test-chat-tools-songs.test.ts`.
- [x] Run `bun run build`.

### Phase 2: Title parsing consolidation

- [x] Add `api/_utils/parse-youtube-title.ts`.
- [x] Move the shared regex and AI parsing logic out of `api/songs/_utils.ts`.
- [x] Slim `api/parse-title.ts` into a route wrapper.
- [x] Update `api/chat/tools/executors.ts` and `api/_utils/og-share.ts` to use the shared parser.
- [x] Add unit fixtures for delimiter, channel-name, MV/audio stripping, malformed AI output, and fallback behavior.
- [x] Run `bun run test:parse-title`, `bun run test:song`, `bun run test:media`, and `bun test tests/test-og-share.test.ts`.

### Phase 3: Shared contracts and constants

- [x] Re-export auth TTL constants from one source.
- [x] Add shared realtime channel helpers and sanitizer.
- [x] Add `src/shared/contracts/auth.ts`.
- [x] Add `src/shared/contracts/chat.ts` and a timestamp normalizer.
- [x] Add `src/shared/contracts/listen.ts`.
- [x] Add `src/shared/contracts/irc.ts`.
- [x] Delete dead room request/response wrapper types after contract migration.

### Phase 4: Larger planned refactors

Phase 4 should continue the same pattern: extract pure shared logic first, keep adapter boundaries thin, preserve public app/store APIs during migration, and land each subsection behind focused tests.

#### 4A. Shared sync domain core

Goal: reduce `src/sync/domains.ts`, `src/hooks/useAutoCloudSync.ts`, and `api/sync/*` coupling by moving pure domain contracts, normalizers, and merge helpers into shared modules.

Primary files:

- `src/sync/domains.ts`
- `src/hooks/useAutoCloudSync.ts`
- `api/sync/_state.ts`
- `api/sync/_physical.ts`
- `api/sync/_domains.ts`
- `src/utils/cloudSyncShared.ts`
- `src/utils/cloudSyncSettingsMerge.ts`
- `src/utils/cloudSyncFileMerge.ts`
- `src/utils/contacts.ts`
- `src/stores/useCalendarStore.ts`
- `src/stores/useStickiesStore.ts`
- `src/stores/useMapsStore.ts`

Implementation checklist:

- [x] Add `src/shared/domains/calendar.ts` with `CalendarSnapshotData`, event/todo/group DTOs, normalizer, and merge helper.
- [x] Add `src/shared/domains/stickies.ts` with `StickiesSnapshotData`, normalizer, and merge helper.
- [x] Add `src/shared/domains/contacts.ts` that reuses the existing contact DTOs and exports a snapshot normalizer.
- [x] Add `src/shared/domains/maps.ts` with saved-place snapshot normalization.
- [x] Move settings snapshot types/normalizer behind a shared domain export while preserving `src/utils/cloudSyncSettingsMerge.ts` compatibility exports.
- [x] Add shared `src/shared/sync/itemMerge.ts` helper and use it from `src/sync/domains.ts`.
- [x] Preserve compatibility re-exports where existing modules already exposed moved helpers (`cloudSyncSettingsMerge`, `cloudSyncFileMerge`).
- [x] Replace server-side partial validators in `api/sync/_state.ts` with shared guards.
- [x] Replace local merge functions in `src/sync/domains.ts` for stickies, calendar, contacts, and maps.
- [x] Keep file/blob transport and Redis writes in adapters; shared modules stay IO-free.

Risks:

- High: merge mistakes can cause data loss, stale tombstones, or cross-device overwrite bugs.
- Calendar `location` and contacts `myContactId` must survive round trips.
- Settings apply still has DOM-sensitive tests; avoid coupling shared normalizers to browser APIs.

Test gates:

- `bun test tests/test-files-metadata-normalizer.test.ts`
- `bun test tests/test-cloud-sync-utils.test.ts --test-name-pattern "settings|file metadata|deletion|merge"`
- `bun test tests/test-cloud-sync-domains.test.ts` with `bun run dev:api`
- `bun test tests/test-cloud-sync-tv-upload-apply.test.ts`
- `bun test tests/test-contacts-vcard.test.ts`
- `bun run build`

#### 4B. AI tool pure reducers and adapters

Goal: dedupe browser chat handlers and server/Telegram executors by extracting pure state-transition reducers with browser and Redis adapters.

Primary files:

- `api/chat/tools/executors.ts`
- `api/chat/tools/types.ts`
- `api/chat/tools/schemas.ts`
- `src/apps/chats/hooks/useAiChat.ts`
- `src/apps/chats/tools/calendarHandler.ts`
- `src/apps/chats/tools/contactsHandler.ts`
- `src/apps/chats/tools/stickiesHandler.ts`
- `src/apps/chats/tools/settingsHandler.ts`
- `api/_utils/contacts.ts`

Implementation checklist:

- [x] Add shared tool type exports for contacts, calendar, and stickies.
- [x] Add shared contacts tool reducer/helper module and migrate `contactsHandler.ts` plus `executeContactsControl`.
- [x] Add contacts reducer tests for list/create/update/delete and tombstones.
- [x] Add shared calendar tool reducer and migrate `executeCalendarControl`.
- [x] Add shared stickies tool reducer and migrate `executeStickiesControl`.
- [x] Add reducer tests for calendar and stickies actions.
- [x] Split app-state executors out of `api/chat/tools/executors.ts` into `api/chat/tools/app-state-executors.ts`.
- [x] Derive server-executed tool names from shared execution metadata instead of owning a local set in `useAiChat`.

Risks:

- Medium-high: AI tool outputs are user-visible and Telegram/web behavior must remain aligned.
- Tool reducers must not import React, Zustand, Redis, IndexedDB, or Vercel types.
- Error message changes can alter model follow-up behavior.

Test gates:

- `bun test tests/test-server-app-state-tools.test.ts`
- `bun test tests/test-chat-tools-contacts.test.ts`
- `bun test tests/test-chat-tools-songs.test.ts`
- `bun run test:ai`
- New `tests/test-tool-reducer-parity.test.ts`
- Manual smoke: one Chats tool call for contacts/calendar/stickies.

#### 4C. Media library and playback kernel

Goal: reduce duplicated media behavior across iPod, Karaoke, TV, Videos, listen sessions, Finder virtual media folders, and chat tools.

Primary files:

- `src/apps/ipod/hooks/useIpodLogic.ts`
- `src/stores/useIpodStore.ts`
- `src/apps/karaoke/hooks/useKaraokeLogic.ts`
- `src/apps/tv/hooks/useTvLogic.ts`
- `src/apps/videos/hooks/useVideosLogic.ts`
- `src/components/shared/YouTubePlayer.tsx`
- `src/hooks/useListenSync.ts`
- `src/apps/finder/hooks/useFileSystem.ts`
- `api/_utils/_song-service.ts`
- `api/_utils/song-library-state.ts`

Implementation checklist:

- [x] Add shared media artwork helper for Kugou, Apple Music, and YouTube thumbnail resolution.
- [x] Route Karaoke players through `YouTubePlayer` where behavior matches current ReactPlayer props.
- [x] Extract `useIpodPlayback` from `useIpodLogic` without changing its public return shape.
- [x] Extract shared lyrics playback input props for iPod/Karaoke/TV overlays.
- [x] Wrap `useIpodStore` media-library parts behind `useMediaLibraryStore` compatibility exports.
- [x] Add shared playback/listen adapter used by Karaoke.
- [x] Keep listen-session synchronization as an adapter over shared playback state, not as a core dependency.

Risks:

- High: playback regressions are user-visible and hard to catch with unit tests alone.
- ReactPlayer prop differences can change autoplay, mute, fullscreen, or mobile behavior.
- Store migrations must preserve persisted library data.

Test gates:

- `bun test tests/test-ipod-apple-music.test.ts`
- `bun test tests/test-ipod-track-metadata-sync.test.ts`
- `bun run test:song`
- `bun run test:media`
- `bun test tests/test-tv-channels.test.ts tests/test-tv-utils.test.ts`
- Manual smoke: iPod search/add/play, Karaoke playback, TV MTV channel, Videos playback, listen-session join/sync.

#### 4D. VFS service boundary

Goal: separate file metadata, content persistence, virtual trees, trash/aliases, and Finder UI behavior.

Primary files:

- `src/stores/useFilesStore.ts`
- `src/apps/finder/hooks/useFileSystem.ts`
- `src/apps/finder/hooks/useFinderLogic.ts`
- `src/apps/textedit/hooks/useFileOperations.ts`
- `src/apps/paint/hooks/usePaintLogic.ts`
- `src/apps/applet-viewer/hooks/useAppletViewerLogic.ts`
- `src/apps/chats/hooks/useAiChat.ts`
- `src/utils/indexedDBOperations.ts`
- `src/utils/indexedDB.ts`
- `src/sync/domains.ts`

Implementation checklist:

- [x] Add `src/services/vfs/virtualTrees.ts` and extract shared `/Music` and `/Videos` artist-folder builders.
- [x] Add tests for virtual music/video trees and artist grouping.
- [ ] Add `src/services/vfs/FileContentRepository` wrapper for IndexedDB document/image reads and writes.
- [ ] Add `src/services/vfs/FileMetadataService` wrapper over `useFilesStore` actions.
- [ ] Move TextEdit save/load onto the service first.
- [ ] Move Paint and Applet Viewer file I/O next.
- [ ] Keep Finder UI hooks consuming compatibility methods until service coverage is complete.

Risks:

- High: VFS touches persisted user content, cloud sync, aliases, trash, applets, TextEdit, Paint, Finder, Terminal, and AI tools.
- Do not change IndexedDB store names or file UUID semantics.
- Virtual media folders must stay compatible with iPod/video store data.

Test gates:

- `bun test tests/test-finder-display-sort.test.ts`
- `bun test tests/test-finder-trash-store.test.ts`
- `bun test tests/test-cloud-sync-utils.test.ts --test-name-pattern "file metadata|document"`
- `bun test tests/test-cloud-sync-domains.test.ts` with `bun run dev:api`
- Manual smoke: Finder `/Music`, Finder `/Videos`, TextEdit save/load, Paint save/load, Applet Viewer open/share.

#### 4E. Chats auth extraction and realtime service split

Goal: reduce `useChatsStore` and `useChatRoom` coupling by moving auth/session ownership and realtime subscription lifecycle into smaller modules.

Primary files:

- `src/stores/useChatsStore.ts`
- `src/hooks/useAuth.ts`
- `src/api/auth.ts`
- `src/api/rooms.ts`
- `src/apps/chats/hooks/useChatRoom.ts`
- `src/hooks/useBackgroundChatNotifications.ts`
- `src/lib/pusherClient.ts`

Implementation checklist:

- [ ] Add `src/stores/useAuthStore.ts` or extend `useAuth.ts` so cookie/session restore, logout, and password checks do not live in `useChatsStore`.
- [x] Move legacy auth-token migration helpers out of `useChatsStore` into a pure utility.
- [x] Route chat-store auth HTTP calls through `src/api/auth.ts`.
- [ ] Add `src/services/chat/ChatRealtimeService.ts` for global channel and room channel subscription lifecycles.
- [ ] Make foreground and background chat hooks consume the same realtime service.
- [ ] Keep store API compatibility for current components during migration.

Risks:

- Medium-high: login/logout, private room ACL, notifications, and Pusher refcount behavior can regress.
- Existing `test:new-api` has an unrelated login fixture issue; rely on focused auth/rooms subsets until fixed.
- Background notification behavior differs by active room and IRC room type; preserve current gating.

Test gates:

- `bun test tests/test-auth-extra.test.ts`
- `bun test tests/test-rooms-extra.test.ts`
- `bun test tests/test-new-api.test.ts --test-name-pattern "Auth|Rooms|Messages|Presence"`
- `bun test tests/test-chat-notification-logic.test.ts`
- `bun test tests/test-chat-notification-integration-wiring.test.ts`
- `bun test tests/test-chat-hook-channel-lifecycle-wiring.test.ts`
- `bun test tests/test-pusher-client-refcount.test.ts`
- Manual smoke: login/logout, room create/join/send, private room visibility, background notification.

