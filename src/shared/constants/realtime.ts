export const CHATS_PUBLIC_CHANNEL = "chats-public";
export const CHATS_USER_CHANNEL_PREFIX = "chats-";
export const CHAT_ROOM_CHANNEL_PREFIX = "room-";
export const SYNC_CHANNEL_PREFIX = "sync-";
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

export function getChatRoomChannelName(roomId: string): string {
  return `${CHAT_ROOM_CHANNEL_PREFIX}${roomId}`;
}

export function getSyncChannelName(username: string): string {
  return `${SYNC_CHANNEL_PREFIX}${sanitizeUsernameForRealtimeChannel(username)}`;
}

export function getListenSessionChannelName(sessionId: string): string {
  return `${LISTEN_SESSION_CHANNEL_PREFIX}${sessionId}`;
}
