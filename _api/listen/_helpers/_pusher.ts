/**
 * Pusher client and broadcast helpers for listen-together sessions
 */

import type {
  ListenDjChangedPayload,
  ListenReactionPayload,
  ListenSyncPayload,
  ListenUserPayload,
} from "./_types.js";
import {
  createRealtimeSessionPusherClient,
  triggerRealtimeSessionEvent,
} from "../../_utils/realtime-session-pusher.js";

// ============================================================================
// Pusher Client
// ============================================================================

export const pusher = createRealtimeSessionPusherClient();

// ============================================================================
// Broadcast Helpers
// ============================================================================

export async function broadcastSync(
  sessionId: string,
  payload: ListenSyncPayload
): Promise<void> {
  await triggerRealtimeSessionEvent(pusher, "listen", sessionId, "sync", payload);
}

export async function broadcastUserJoined(
  sessionId: string,
  payload: ListenUserPayload
): Promise<void> {
  await triggerRealtimeSessionEvent(
    pusher,
    "listen",
    sessionId,
    "user-joined",
    payload
  );
}

export async function broadcastUserLeft(
  sessionId: string,
  payload: ListenUserPayload
): Promise<void> {
  await triggerRealtimeSessionEvent(
    pusher,
    "listen",
    sessionId,
    "user-left",
    payload
  );
}

export async function broadcastDjChanged(
  sessionId: string,
  payload: ListenDjChangedPayload
): Promise<void> {
  await triggerRealtimeSessionEvent(
    pusher,
    "listen",
    sessionId,
    "dj-changed",
    payload
  );
}

export async function broadcastReaction(
  sessionId: string,
  payload: ListenReactionPayload
): Promise<void> {
  await triggerRealtimeSessionEvent(
    pusher,
    "listen",
    sessionId,
    "reaction",
    payload
  );
}

export async function broadcastSessionEnded(sessionId: string): Promise<void> {
  await triggerRealtimeSessionEvent(
    pusher,
    "listen",
    sessionId,
    "session-ended",
    {}
  );
}
