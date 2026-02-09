import type { AIChatMessage, ChatMessage, ChatRoom } from "@/types/chat";

export const USERNAME_RECOVERY_KEY = "_usr_recovery_key_";
export const AUTH_TOKEN_RECOVERY_KEY = "_auth_recovery_key_";
export const TOKEN_REFRESH_THRESHOLD = 83 * 24 * 60 * 60 * 1000;
export const TOKEN_LAST_REFRESH_KEY = "_token_refresh_time_";

const encode = (value: string): string => {
  return btoa(value.split("").reverse().join(""));
};

const decode = (encoded: string): string | null => {
  try {
    return atob(encoded).split("").reverse().join("");
  } catch (error) {
    console.error("[ChatsStore] Failed to decode value:", error);
    return null;
  }
};

const encodeUsername = (username: string): string => encode(username);
const decodeUsername = (encoded: string): string | null => decode(encoded);

export const saveUsernameToRecovery = (username: string | null): void => {
  if (username) {
    localStorage.setItem(USERNAME_RECOVERY_KEY, encodeUsername(username));
  }
};

export const getUsernameFromRecovery = (): string | null => {
  const encoded = localStorage.getItem(USERNAME_RECOVERY_KEY);
  if (encoded) {
    return decodeUsername(encoded);
  }
  return null;
};

export const saveAuthTokenToRecovery = (token: string | null): void => {
  if (token) {
    localStorage.setItem(AUTH_TOKEN_RECOVERY_KEY, encode(token));
  } else {
    localStorage.removeItem(AUTH_TOKEN_RECOVERY_KEY);
  }
};

export const getAuthTokenFromRecovery = (): string | null => {
  const encoded = localStorage.getItem(AUTH_TOKEN_RECOVERY_KEY);
  if (encoded) {
    return decode(encoded);
  }
  return null;
};

export const saveTokenRefreshTime = (username: string): void => {
  const key = `${TOKEN_LAST_REFRESH_KEY}${username}`;
  localStorage.setItem(key, Date.now().toString());
};

export const getTokenRefreshTime = (username: string): number | null => {
  const key = `${TOKEN_LAST_REFRESH_KEY}${username}`;
  const time = localStorage.getItem(key);
  return time ? parseInt(time, 10) : null;
};

export const ensureRecoveryKeysAreSet = (
  username: string | null,
  authToken: string | null
): void => {
  if (username && !localStorage.getItem(USERNAME_RECOVERY_KEY)) {
    console.log(
      "[ChatsStore] Setting recovery key for existing username:",
      username
    );
    saveUsernameToRecovery(username);
  }
  if (authToken && !localStorage.getItem(AUTH_TOKEN_RECOVERY_KEY)) {
    console.log("[ChatsStore] Setting recovery key for existing auth token");
    saveAuthTokenToRecovery(authToken);
  }
};

const LEGACY_CHAT_STORAGE_KEYS = {
  AI_MESSAGES: "chats:messages",
  USERNAME: "chats:chatRoomUsername",
  LAST_OPENED_ROOM_ID: "chats:lastOpenedRoomId",
  SIDEBAR_VISIBLE: "chats:sidebarVisible",
  CACHED_ROOMS: "chats:cachedRooms",
  CACHED_ROOM_MESSAGES: "chats:cachedRoomMessages",
} as const;

const tryParseLegacyJson = <T>(value: string): T | null => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

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
