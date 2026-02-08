export const LEGACY_CHAT_STORAGE_KEYS = {
  AI_MESSAGES: "chats:messages",
  USERNAME: "chats:chatRoomUsername",
  LAST_OPENED_ROOM_ID: "chats:lastOpenedRoomId",
  SIDEBAR_VISIBLE: "chats:sidebarVisible",
  CACHED_ROOMS: "chats:cachedRooms",
  CACHED_ROOM_MESSAGES: "chats:cachedRoomMessages",
} as const;

export const tryParseLegacyJson = <T>(value: string): T | null => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};
