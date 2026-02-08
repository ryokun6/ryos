import type { AIChatMessage, ChatMessage, ChatRoom } from "@/types/chat";
import { LEGACY_CHAT_STORAGE_KEYS, tryParseLegacyJson } from "./legacyStorage";
import { saveUsernameToRecovery } from "./recovery";

export interface LegacyMigratedState {
  aiMessages?: AIChatMessage[];
  username?: string;
  currentRoomId?: string;
  isSidebarVisible?: boolean;
  rooms?: ChatRoom[];
  roomMessages?: Record<string, ChatMessage[]>;
}

export const migrateLegacyChatStorageState = (): LegacyMigratedState => {
  const migratedState: LegacyMigratedState = {};

  const oldAiMessagesRaw = localStorage.getItem(LEGACY_CHAT_STORAGE_KEYS.AI_MESSAGES);
  if (oldAiMessagesRaw) {
    const parsedAiMessages = tryParseLegacyJson<AIChatMessage[]>(oldAiMessagesRaw);
    if (parsedAiMessages) {
      migratedState.aiMessages = parsedAiMessages;
    } else {
      console.warn(
        "Failed to parse old AI messages during migration",
        oldAiMessagesRaw
      );
    }
  }

  const oldUsernameKey = LEGACY_CHAT_STORAGE_KEYS.USERNAME;
  const oldUsername = localStorage.getItem(oldUsernameKey);
  if (oldUsername) {
    migratedState.username = oldUsername;
    saveUsernameToRecovery(oldUsername);
    localStorage.removeItem(oldUsernameKey);
    console.log(
      `[ChatsStore] Migrated and removed '${oldUsernameKey}' key during version upgrade.`
    );
  }

  const oldCurrentRoomId = localStorage.getItem(
    LEGACY_CHAT_STORAGE_KEYS.LAST_OPENED_ROOM_ID
  );
  if (oldCurrentRoomId) {
    migratedState.currentRoomId = oldCurrentRoomId;
  }

  const oldSidebarVisibleRaw = localStorage.getItem(
    LEGACY_CHAT_STORAGE_KEYS.SIDEBAR_VISIBLE
  );
  if (oldSidebarVisibleRaw) {
    migratedState.isSidebarVisible = oldSidebarVisibleRaw !== "false";
  }

  const oldCachedRoomsRaw = localStorage.getItem(
    LEGACY_CHAT_STORAGE_KEYS.CACHED_ROOMS
  );
  if (oldCachedRoomsRaw) {
    const parsedRooms = tryParseLegacyJson<ChatRoom[]>(oldCachedRoomsRaw);
    if (parsedRooms) {
      migratedState.rooms = parsedRooms;
    } else {
      console.warn(
        "Failed to parse old cached rooms during migration",
        oldCachedRoomsRaw
      );
    }
  }

  const oldCachedRoomMessagesRaw = localStorage.getItem(
    LEGACY_CHAT_STORAGE_KEYS.CACHED_ROOM_MESSAGES
  );
  if (oldCachedRoomMessagesRaw) {
    const parsedRoomMessages = tryParseLegacyJson<Record<string, ChatMessage[]>>(
      oldCachedRoomMessagesRaw
    );
    if (parsedRoomMessages) {
      migratedState.roomMessages = parsedRoomMessages;
    } else {
      console.warn(
        "Failed to parse old cached room messages during migration",
        oldCachedRoomMessagesRaw
      );
    }
  }

  return migratedState;
};
