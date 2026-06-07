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

## Current test notes

- [x] `bun test tests/test-files-metadata-normalizer.test.ts`
- [x] `bun test tests/test-rate-limit-client-ip.test.ts`
- [x] `bun test tests/test-cloud-sync-utils.test.ts --test-name-pattern "file metadata|FilesMetadata"`
- [x] `bun run test:admin`
- [x] `bun test tests/test-new-api.test.ts --test-name-pattern "Presence"`
- [x] `bun test tests/test-new-api.test.ts --test-name-pattern "Admin login|Presence"`
- [x] `bun run build`
- [ ] `bun test tests/test-cloud-sync-utils.test.ts` full suite currently has an unrelated DOM mock gap in settings hydration.
- [ ] `bun run test:new-api` full suite currently has an unrelated login fixture failure returning 401 after registration.

## In progress

- [ ] Extract shared YouTube search client for API routes and server tools.

## Next implementation checklist

### Phase 1: API integration cleanup

- [ ] Add `api/_utils/youtube-client.ts`.
- [ ] Add `tests/test-youtube-client.test.ts`.
- [ ] Migrate `api/youtube-search.ts` to the shared client.
- [ ] Migrate `api/tv/create-channel.ts` to the shared client.
- [ ] Migrate `api/chat/tools/executors.ts` song search to the shared client.
- [ ] Run `bun test tests/test-youtube-client.test.ts`.
- [ ] Run `bun run test:media`.
- [ ] Run `bun test tests/test-chat-tools-songs.test.ts`.
- [ ] Run `bun run build`.

### Phase 2: Title parsing consolidation

- [ ] Add `api/_utils/parse-youtube-title.ts`.
- [ ] Move the shared regex and AI parsing logic out of `api/songs/_utils.ts`.
- [ ] Slim `api/parse-title.ts` into a route wrapper.
- [ ] Update `api/chat/tools/executors.ts` and `api/_utils/og-share.ts` to use the shared parser.
- [ ] Add unit fixtures for delimiter, channel-name, MV/audio stripping, malformed AI output, and fallback behavior.
- [ ] Run `bun run test:parse-title`, `bun run test:song`, `bun run test:media`, and `bun test tests/test-og-share.test.ts`.

### Phase 3: Shared contracts and constants

- [ ] Re-export auth TTL constants from one source.
- [ ] Add shared realtime channel helpers and sanitizer.
- [ ] Add `src/shared/contracts/auth.ts`.
- [ ] Add `src/shared/contracts/chat.ts` and a timestamp normalizer.
- [ ] Add `src/shared/contracts/listen.ts`.
- [ ] Add `src/shared/contracts/irc.ts`.
- [ ] Delete dead room request/response wrapper types after contract migration.

### Phase 4: Larger planned refactors

- [ ] Shared sync domain normalizers and merge logic beyond files metadata.
- [ ] AI tool pure reducers with browser and server adapters.
- [ ] Media library/playback kernel for iPod, Karaoke, TV, Videos, listen sessions, and Finder virtual media folders.
- [ ] VFS service boundary for metadata, IndexedDB content, virtual roots, trash, aliases, and cross-app file I/O.
- [ ] Chats auth extraction and realtime service split.

