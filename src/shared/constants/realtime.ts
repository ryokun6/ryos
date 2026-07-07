export const CHATS_PUBLIC_CHANNEL = "chats-public";
// Per-user fan-out channel. Carries private-room messages, room metadata and
// notifications for a single user, so it MUST be an authorized channel.
export const CHATS_USER_CHANNEL_PREFIX = "private-chats-";
// Public chat-room channel (public + IRC rooms only).
export const CHAT_ROOM_CHANNEL_PREFIX = "room-";
// Authorized chat-room channel (private rooms only — membership required).
export const PRIVATE_CHAT_ROOM_CHANNEL_PREFIX = "private-room-";
// Per-user cross-device sync channel. Carries the user's documents/state, so it
// MUST be an authorized channel.
export const SYNC_CHANNEL_PREFIX = "private-sync-";
// Per-user AI conversation channel. Carries `ai-conversation-updated` events
// for the user's server-owned Ryo/assistant threads, so it MUST be an
// authorized channel.
export const AI_CONVERSATION_CHANNEL_PREFIX = "private-ai-";
export const LISTEN_SESSION_CHANNEL_PREFIX = "listen-";
export const GLOBAL_PRESENCE_CHANNEL = "presence-global";

export const REALTIME_CHANNEL_SEGMENT_PATTERN = /[^a-zA-Z0-9_\-.]/g;
export const REALTIME_CHANNEL_SEGMENT_REPLACEMENT = "_";

export function sanitizeRealtimeChannelSegment(segment: string): string {
  return segment.replace(
    REALTIME_CHANNEL_SEGMENT_PATTERN,
    REALTIME_CHANNEL_SEGMENT_REPLACEMENT
  );
}

export function sanitizeUsernameForRealtimeChannel(username: string): string {
  return sanitizeRealtimeChannelSegment(username.toLowerCase());
}

export function getChatsUserChannelName(username: string): string {
  return `${CHATS_USER_CHANNEL_PREFIX}${sanitizeUsernameForRealtimeChannel(username)}`;
}

export function getChatsGlobalChannelName(
  username?: string | null
): string {
  return username ? getChatsUserChannelName(username) : CHATS_PUBLIC_CHANNEL;
}

/**
 * Resolve the realtime channel for a chat room.
 *
 * Private rooms use an authorized (`private-room-…`) channel so only members
 * can subscribe; public and IRC rooms use the open (`room-…`) channel.
 */
export function getChatRoomChannelName(
  roomId: string,
  roomType?: string | null
): string {
  const prefix =
    roomType === "private"
      ? PRIVATE_CHAT_ROOM_CHANNEL_PREFIX
      : CHAT_ROOM_CHANNEL_PREFIX;
  return `${prefix}${roomId}`;
}

export function getSyncChannelName(username: string): string {
  return `${SYNC_CHANNEL_PREFIX}${sanitizeUsernameForRealtimeChannel(username)}`;
}

export function getAIConversationRealtimeChannelName(
  username: string
): string {
  return `${AI_CONVERSATION_CHANNEL_PREFIX}${sanitizeUsernameForRealtimeChannel(username)}`;
}

export function getListenSessionChannelName(sessionId: string): string {
  return `${LISTEN_SESSION_CHANNEL_PREFIX}${sessionId}`;
}

/**
 * Classification of a realtime channel for authorization purposes.
 *
 * - `public`: anyone may subscribe (public chat list, public/IRC rooms, listen
 *   sessions, airdrop lobby, etc.).
 * - `user`: per-user channel — only the owning user may subscribe. `target` is
 *   the sanitized username embedded in the channel name.
 * - `room`: private chat-room channel — only members may subscribe. `target`
 *   is the room id.
 * - `presence-global`: global presence — any authenticated user may subscribe.
 * - `deny`: an authorization-requiring channel that doesn't match a known
 *   pattern; never authorize it.
 */
export type RealtimeChannelClassification =
  | { kind: "public" }
  | { kind: "user"; target: string }
  | { kind: "room"; target: string }
  | { kind: "presence-global" }
  | { kind: "deny" };

export function classifyRealtimeChannel(
  channel: string
): RealtimeChannelClassification {
  const name = channel.trim();
  if (!name) return { kind: "deny" };

  if (name === GLOBAL_PRESENCE_CHANNEL) {
    return { kind: "presence-global" };
  }

  if (name.startsWith(CHATS_USER_CHANNEL_PREFIX)) {
    return {
      kind: "user",
      target: name.slice(CHATS_USER_CHANNEL_PREFIX.length),
    };
  }

  if (name.startsWith(SYNC_CHANNEL_PREFIX)) {
    return { kind: "user", target: name.slice(SYNC_CHANNEL_PREFIX.length) };
  }

  if (name.startsWith(AI_CONVERSATION_CHANNEL_PREFIX)) {
    return {
      kind: "user",
      target: name.slice(AI_CONVERSATION_CHANNEL_PREFIX.length),
    };
  }

  if (name.startsWith(PRIVATE_CHAT_ROOM_CHANNEL_PREFIX)) {
    return {
      kind: "room",
      target: name.slice(PRIVATE_CHAT_ROOM_CHANNEL_PREFIX.length),
    };
  }

  // Any other `private-`/`presence-` channel requires authorization but is not
  // a recognized pattern — deny by default. Everything else is public.
  if (name.startsWith("private-") || name.startsWith("presence-")) {
    return { kind: "deny" };
  }

  return { kind: "public" };
}

/**
 * Whether subscribing to a channel requires server-side authorization. Mirrors
 * pusher-js semantics (only `private-`/`presence-` channels are authorized).
 */
export function realtimeChannelRequiresAuth(channel: string): boolean {
  const name = channel.trim();
  return name.startsWith("private-") || name.startsWith("presence-");
}
