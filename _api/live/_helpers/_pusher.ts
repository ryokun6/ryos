/**
 * Pusher broadcast helpers for Live Desktop sessions.
 */

import type {
  LiveDesktopSyncPayload,
  LiveDesktopUserPayload,
} from "./_types.js";
import {
  createRealtimeSessionPusherClient,
  triggerRealtimeSessionEvent,
} from "../../_utils/realtime-session-pusher.js";

export const pusher = createRealtimeSessionPusherClient();

export async function broadcastSync(
  sessionId: string,
  payload: LiveDesktopSyncPayload
): Promise<void> {
  await triggerRealtimeSessionEvent(
    pusher,
    "live",
    sessionId,
    "sync",
    payload
  );
}

export async function broadcastUserJoined(
  sessionId: string,
  payload: LiveDesktopUserPayload
): Promise<void> {
  await triggerRealtimeSessionEvent(
    pusher,
    "live",
    sessionId,
    "user-joined",
    payload
  );
}

export async function broadcastUserLeft(
  sessionId: string,
  payload: LiveDesktopUserPayload
): Promise<void> {
  await triggerRealtimeSessionEvent(
    pusher,
    "live",
    sessionId,
    "user-left",
    payload
  );
}

export async function broadcastSessionEnded(sessionId: string): Promise<void> {
  await triggerRealtimeSessionEvent(
    pusher,
    "live",
    sessionId,
    "session-ended",
    {}
  );
}
