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
- `tests/test-chat-notification-logic.ts`
  - active vs non-active room notification gating
- `tests/test-chat-broadcast-wiring.ts`
  - verifies critical REST routes still call expected broadcast functions
  - verifies leave-route private-room registry cleanup wiring

### 4) Chat store response guardrails

File: `src/stores/useChatsStore.ts`

- Added `readJsonBody(...)` helper with response `content-type` validation.
- Applied to:
  - `fetchRooms`
  - `fetchMessagesForRoom`
  - `fetchBulkMessages`
- This prevents noisy JSON parse exceptions when frontend-only dev mode returns
  non-JSON content for API paths; failures now degrade gracefully with warnings.

## Validation performed

- Automated:
  - `bun run test:chat-regression`
    - wraps `chat-notifications`, `pusher-client`, `chat-broadcast-wiring`
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
