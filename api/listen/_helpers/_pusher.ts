/**
 * Pusher client and broadcast helpers for listen-together sessions
 */

import { triggerRealtimeEvent } from "../../_utils/realtime.js";
import type {
  ListenDjChangedPayload,
  ListenReactionPayload,
  ListenSyncPayload,
  ListenUserPayload,
} from "./_types.js";

function getChannelName(sessionId: string): string {
  return `listen-${sessionId}`;
}

// ============================================================================
// Broadcast Helpers
// ============================================================================

export async function broadcastSync(
  sessionId: string,
  payload: ListenSyncPayload
): Promise<void> {
  await triggerRealtimeEvent(getChannelName(sessionId), "sync", payload);
}

export async function broadcastUserJoined(
  sessionId: string,
  payload: ListenUserPayload
): Promise<void> {
  await triggerRealtimeEvent(getChannelName(sessionId), "user-joined", payload);
}

export async function broadcastUserLeft(
  sessionId: string,
  payload: ListenUserPayload
): Promise<void> {
  await triggerRealtimeEvent(getChannelName(sessionId), "user-left", payload);
}

export async function broadcastDjChanged(
  sessionId: string,
  payload: ListenDjChangedPayload
): Promise<void> {
  await triggerRealtimeEvent(getChannelName(sessionId), "dj-changed", payload);
}

export async function broadcastReaction(
  sessionId: string,
  payload: ListenReactionPayload
): Promise<void> {
  await triggerRealtimeEvent(getChannelName(sessionId), "reaction", payload);
}

export async function broadcastSessionEnded(sessionId: string): Promise<void> {
  await triggerRealtimeEvent(getChannelName(sessionId), "session-ended", {});
}
