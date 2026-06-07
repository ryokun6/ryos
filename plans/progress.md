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
- [x] `bun run build`
- [ ] `bun test tests/test-cloud-sync-utils.test.ts` full suite currently has an unrelated DOM mock gap in settings hydration.
- [ ] `bun run test:new-api` full suite currently has an unrelated login fixture failure returning 401 after registration.

## In progress

- [ ] Shared contracts and constants.

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
- [ ] Add `src/shared/contracts/listen.ts`.
- [ ] Add `src/shared/contracts/irc.ts`.
- [ ] Delete dead room request/response wrapper types after contract migration.

### Phase 4: Larger planned refactors

- [ ] Shared sync domain normalizers and merge logic beyond files metadata.
- [ ] AI tool pure reducers with browser and server adapters.
- [ ] Media library/playback kernel for iPod, Karaoke, TV, Videos, listen sessions, and Finder virtual media folders.
- [ ] VFS service boundary for metadata, IndexedDB content, virtual roots, trash, aliases, and cross-app file I/O.
- [ ] Chats auth extraction and realtime service split.

