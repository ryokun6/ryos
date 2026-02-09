import type { AIChatMessage, ChatMessage, ChatRoom } from "@/types/chat";
import { LEGACY_CHAT_STORAGE_KEYS, tryParseLegacyJson } from "./legacyStorage";
import {
  ensureRecoveryKeysAreSet,
  getAuthTokenFromRecovery,
  getUsernameFromRecovery,
  saveUsernameToRecovery,
} from "./recovery";

interface PersistLifecycleParams<State> {
  persistedState: unknown;
  version: number;
  storeVersion: number;
  getInitialState: () => State;
}

interface RehydratableChatsState {
  username: string | null;
  authToken: string | null;
  rooms?: unknown;
}

interface LegacyMigratedState {
  aiMessages?: AIChatMessage[];
  username?: string;
  currentRoomId?: string;
  isSidebarVisible?: boolean;
  rooms?: ChatRoom[];
  roomMessages?: Record<string, ChatMessage[]>;
}

const migrateLegacyChatStorageState = (): LegacyMigratedState => {
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

const applyIdentityRecoveryOnRehydrate = (
  state: RehydratableChatsState
): void => {
  if (state.username === null) {
    const recoveredUsername = getUsernameFromRecovery();
    if (recoveredUsername) {
      console.log(
        `[ChatsStore] Found encoded username '${recoveredUsername}' in recovery storage. Applying.`
      );
      state.username = recoveredUsername;
    } else {
      const oldUsernameKey = LEGACY_CHAT_STORAGE_KEYS.USERNAME;
      const oldUsername = localStorage.getItem(oldUsernameKey);
      if (oldUsername) {
        console.log(
          `[ChatsStore] Found old username '${oldUsername}' in localStorage during rehydration check. Applying.`
        );
        state.username = oldUsername;
        saveUsernameToRecovery(oldUsername);
        localStorage.removeItem(oldUsernameKey);
        console.log(
          `[ChatsStore] Removed old key '${oldUsernameKey}' after rehydration fix.`
        );
      } else {
        console.log(
          "[ChatsStore] Username is null, but no username found in recovery or old localStorage during rehydration check."
        );
      }
    }
  }

  if (state.authToken === null) {
    const recoveredAuthToken = getAuthTokenFromRecovery();
    if (recoveredAuthToken) {
      console.log(
        "[ChatsStore] Found encoded auth token in recovery storage. Applying."
      );
      state.authToken = recoveredAuthToken;
    }
  }

  ensureRecoveryKeysAreSet(state.username, state.authToken);
};

export const migrateChatsPersistedState = <State>({
  persistedState,
  version,
  storeVersion,
  getInitialState,
}: PersistLifecycleParams<State>): State => {
  console.log(
    "[ChatsStore] Migrate function started. Version:",
    version,
    "Persisted state exists:",
    !!persistedState
  );
  if (persistedState) {
    const state = persistedState as RehydratableChatsState;
    console.log(
      "[ChatsStore] Persisted state type for rooms:",
      typeof state.rooms,
      "Is Array:",
      Array.isArray(state.rooms)
    );
  }

  if (version < storeVersion && !persistedState) {
    console.log(
      `[ChatsStore] Migrating from old localStorage keys to version ${storeVersion}...`
    );
    try {
      const migratedState = migrateLegacyChatStorageState();

      console.log("[ChatsStore] Migration data:", migratedState);

      const finalMigratedState = {
        ...getInitialState(),
        ...migratedState,
      } as State;
      console.log("[ChatsStore] Final migrated state:", finalMigratedState);
      console.log(
        "[ChatsStore] Migrated rooms type:",
        typeof (finalMigratedState as RehydratableChatsState).rooms,
        "Is Array:",
        Array.isArray((finalMigratedState as RehydratableChatsState).rooms)
      );
      return finalMigratedState;
    } catch (error) {
      console.error("[ChatsStore] Migration failed:", error);
    }
  }

  if (persistedState) {
    console.log("[ChatsStore] Using persisted state.");
    const finalState = { ...(persistedState as object) } as RehydratableChatsState;

    if (finalState.username || finalState.authToken) {
      ensureRecoveryKeysAreSet(finalState.username, finalState.authToken);
    }

    console.log("[ChatsStore] Final state from persisted:", finalState);
    console.log(
      "[ChatsStore] Persisted state rooms type:",
      typeof finalState.rooms,
      "Is Array:",
      Array.isArray(finalState.rooms)
    );
    return finalState as State;
  }

  console.log("[ChatsStore] Falling back to initial state.");
  return { ...getInitialState() } as State;
};

export const createChatsOnRehydrateStorage = <
  State extends RehydratableChatsState,
>() => {
  console.log("[ChatsStore] Rehydrating storage...");
  return (
    state: State | undefined,
    error: unknown
  ): void => {
    if (error) {
      console.error("[ChatsStore] Error during rehydration:", error);
    } else if (state) {
      console.log(
        "[ChatsStore] Rehydration complete. Current state username:",
        state.username,
        "authToken:",
        state.authToken ? "present" : "null"
      );
      applyIdentityRecoveryOnRehydrate(state);
    }
  };
};
