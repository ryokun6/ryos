# Chat Notifications Regression Fix (Pusher)

## Summary

This note records the fix for a regression where chat notifications stopped
appearing reliably for non-active channels after the recent merge.

Two root causes were addressed:

1. **Client-side Pusher bootstrap brittleness**
   - Constructor resolution differed between dev/runtime module shapes.
2. **Missing backend Pusher emissions in REST routes**
   - Several room/message REST endpoints updated data but did not emit matching
     realtime events, so subscribed clients had nothing to receive.

## What changed

### 1) Pusher client robustness

File: `src/lib/pusherClient.ts`

- Added resilient constructor resolution:
  - module default constructor when available
  - fallback to global UMD constructor when dependency is served differently
- Added shared channel reference counting helpers:
  - `subscribePusherChannel`
  - `unsubscribePusherChannel`
- Hardened edge cases:
  - extra release calls are ignored safely
  - stale refcount + missing channel object is recovered via resubscribe
  - first local holder always performs `subscribe(...)` to guarantee active
    subscription state
  - channel names are normalized via `trim()` across subscribe/unsubscribe
  - undefined/null/blank channel names are treated safely during normalization
  - blank channel subscriptions throw fast with a clear error
- Added one-time recovery warnings for:
  - missing-channel refcount recovery
  - unsubscribe underflow no-op
  - warnings are de-duplicated to avoid console noise.

### 2) Frontend listener lifecycle hardening

Files:
- `src/apps/chats/hooks/useChatRoom.ts`
- `src/hooks/useBackgroundChatNotifications.ts`

- Migrated to shared channel helpers to avoid cross-hook unsubscribe collisions.
- Kept handler-scoped bind/unbind cleanup.
- Centralized notification gating logic:
  - `src/utils/chatNotifications.ts`
  - `shouldNotifyForRoomMessage(...)`

### 3) Backend REST → Pusher wiring restored

Routes now emit matching realtime events:

- `_api/rooms/index.ts` → `broadcastRoomCreated`
- `_api/rooms/[id]/messages.ts` → `broadcastNewMessage`
- `_api/rooms/[id]/messages/[msgId].ts` → `broadcastMessageDeleted`
- `_api/rooms/[id].ts` → room update/delete broadcasts for leave/delete flows
- `_api/rooms/[id]/leave.ts` → room update/delete broadcasts
- `_api/rooms/[id]/join.ts` → `broadcastRoomUpdated`
- `_api/presence/switch.ts` → `broadcastRoomUpdated` for previous/next rooms
- `_api/rooms/[id]/leave.ts` additionally removes deleted private rooms from
  `CHAT_ROOMS_SET` and clears room presence zset, preventing stale room registry
  entries during leave-driven private room deletion

## Regression tests added

- `tests/test-pusher-client-refcount.ts`
  - shared subscribe lifecycle
  - over-release guard
  - stale channel recovery
  - warning dedupe behavior
  - channel-name normalization and blank-input guards
- `tests/test-pusher-client-constructor-wiring.ts`
  - verifies module-default constructor lookup remains wired
  - verifies global fallback remains wired
  - verifies explicit error path for missing constructor remains wired
  - verifies `getPusherClient` still instantiates via constructor resolver
- `tests/test-chat-notification-logic.ts`
  - active vs non-active room notification gating
  - missing/empty/whitespace room-id input guards
  - trimmed room-id equivalence handling
  - undefined active-room fallback behavior
- `tests/test-chat-hook-channel-lifecycle-wiring.ts`
  - verifies both chat hooks keep using shared ref-counted subscribe/unsubscribe
    helpers
  - verifies both hooks keep scoped handler unbinds (no broad event unbinds)
- `tests/test-chat-broadcast-wiring.ts`
  - verifies critical REST routes still call expected broadcast functions
  - verifies presence-switch broadcasts both previous and next room updates
  - verifies room-delete route registry/presence cleanup wiring
  - verifies leave-route private-room registry cleanup wiring
- `tests/test-chat-store-guards-wiring.ts`
  - verifies chat store JSON response guard contexts stay wired
  - verifies per-endpoint warning dedupe keys remain wired
  - verifies cooldown gates/marking/clear paths and positive cooldown constant
    remain wired for rooms/message fetchers

### 4) Chat store response guardrails

File: `src/stores/useChatsStore.ts`

- Added `readJsonBody(...)` helper with response `content-type` validation.
  - accepts JSON media type variants (checks for `json` in content type)
- Applied to:
  - `fetchRooms`
  - `fetchMessagesForRoom`
  - `fetchBulkMessages`
- This prevents noisy JSON parse exceptions when frontend-only dev mode returns
  non-JSON content for API paths; failures now degrade gracefully with warnings.
- Added per-session warning dedupe (`warnChatsStoreOnce`) so repeated fetch
  retries do not spam identical warnings during local frontend-only runs.
- Added short per-endpoint cooldowns for known-unavailable API paths in
  frontend-only mode to reduce repeated failing requests while still retrying
  after cooldown expiry.
- Network-level fetch failures now also mark the same short cooldown windows,
  reducing repeated failing requests during transient backend outages.

## Validation performed

- Automated:
  - `bun run test:chat-regression`
    - wraps `chat-notifications`, `pusher-client`, `chat-broadcast-wiring`
  - `bun run test:chat-hook-lifecycle`
  - `bun run test:pusher-regression`
    - runs all `pusher*` suites via the unified test runner
  - `bun run test:pusher-constructor-wiring`
  - `bun run test:chat-store-guards`
  - `bun run tests/run-all-tests.ts chat-`
  - `bun run tests/run-all-tests.ts pusher`
  - `bun run build`
- Manual browser sanity:
  - repeated Chats close/reopen cycles
  - no pusher import/constructor errors
  - stable subscription lifecycle logs

## Notes

- Full API-backed end-to-end notification proof via `vercel dev` was blocked in
  this environment due missing/invalid Vercel credentials.
- Frontend + route wiring + regression tests now enforce the expected behavior
  and guard against the same class of breakage.
