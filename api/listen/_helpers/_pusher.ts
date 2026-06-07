/**
 * Pusher client and broadcast helpers for listen-together sessions
 */

import { triggerRealtimeEvent } from "../../_utils/realtime.js";
import { getListenSessionChannelName } from "../../../src/shared/constants/realtime.js";
import type {
  ListenDjChangedPayload,
  ListenHostChangedPayload,
  ListenReactionPayload,
  ListenRemoteCommandPayload,
  ListenSyncPayload,
  ListenUserPayload,
} from "./_types.js";

// ============================================================================
// Broadcast Helpers
// ============================================================================

export async function broadcastSync(
  sessionId: string,
  payload: ListenSyncPayload
): Promise<void> {
  await triggerRealtimeEvent(getListenSessionChannelName(sessionId), "sync", payload);
}

export async function broadcastUserJoined(
  sessionId: string,
  payload: ListenUserPayload
): Promise<void> {
  await triggerRealtimeEvent(getListenSessionChannelName(sessionId), "user-joined", payload);
}

export async function broadcastUserLeft(
  sessionId: string,
  payload: ListenUserPayload
): Promise<void> {
  await triggerRealtimeEvent(getListenSessionChannelName(sessionId), "user-left", payload);
}

export async function broadcastDjChanged(
  sessionId: string,
  payload: ListenDjChangedPayload
): Promise<void> {
  await triggerRealtimeEvent(getListenSessionChannelName(sessionId), "dj-changed", payload);
}

export async function broadcastHostChanged(
  sessionId: string,
  payload: ListenHostChangedPayload
): Promise<void> {
  await triggerRealtimeEvent(getListenSessionChannelName(sessionId), "host-changed", payload);
}

export async function broadcastRemoteCommand(
  sessionId: string,
  payload: ListenRemoteCommandPayload
): Promise<void> {
  await triggerRealtimeEvent(getListenSessionChannelName(sessionId), "remote-command", payload);
}

export async function broadcastReaction(
  sessionId: string,
  payload: ListenReactionPayload
): Promise<void> {
  await triggerRealtimeEvent(getListenSessionChannelName(sessionId), "reaction", payload);
}

export async function broadcastSessionEnded(sessionId: string): Promise<void> {
  await triggerRealtimeEvent(getListenSessionChannelName(sessionId), "session-ended", {});
}

export async function broadcastDjDisconnected(
  sessionId: string,
  payload: { djUsername: string; lastSyncAt: number }
): Promise<void> {
  await triggerRealtimeEvent(getListenSessionChannelName(sessionId), "dj-disconnected", payload);
}
