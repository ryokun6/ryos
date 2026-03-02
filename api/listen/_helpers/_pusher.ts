/**
 * Pusher client and broadcast helpers for listen-together sessions
 */

import Pusher from "pusher";
import type {
  ListenDjChangedPayload,
  ListenReactionPayload,
  ListenSyncPayload,
  ListenUserPayload,
} from "./_types.js";

// ============================================================================
// Pusher Client
// ============================================================================

export const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.PUSHER_CLUSTER!,
  useTLS: true,
});

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
  await pusher.trigger(getChannelName(sessionId), "sync", payload);
}

export async function broadcastUserJoined(
  sessionId: string,
  payload: ListenUserPayload
): Promise<void> {
  await pusher.trigger(getChannelName(sessionId), "user-joined", payload);
}

export async function broadcastUserLeft(
  sessionId: string,
  payload: ListenUserPayload
): Promise<void> {
  await pusher.trigger(getChannelName(sessionId), "user-left", payload);
}

export async function broadcastDjChanged(
  sessionId: string,
  payload: ListenDjChangedPayload
): Promise<void> {
  await pusher.trigger(getChannelName(sessionId), "dj-changed", payload);
}

export async function broadcastReaction(
  sessionId: string,
  payload: ListenReactionPayload
): Promise<void> {
  await pusher.trigger(getChannelName(sessionId), "reaction", payload);
}

export async function broadcastSessionEnded(sessionId: string): Promise<void> {
  await pusher.trigger(getChannelName(sessionId), "session-ended", {});
}
