import { createJSONStorage } from "zustand/middleware";
import { capRoomMessages } from "./services/messages";
import {
  ensureRecoveryKeysAreSet,
  getAuthTokenFromRecovery,
  getUsernameFromRecovery,
  saveUsernameToRecovery,
} from "./repository/recovery";
import { getInitialState, STORE_NAME, STORE_VERSION } from "./state";
import type { ChatsStoreState } from "./types";

export const getChatsPersistConfig = () => ({
  name: STORE_NAME,
  version: STORE_VERSION,
  storage: createJSONStorage(() => localStorage),
  partialize: (state: ChatsStoreState) => ({
    aiMessages: state.aiMessages,
    username: state.username,
    authToken: state.authToken,
    hasPassword: state.hasPassword,
    currentRoomId: state.currentRoomId,
    isSidebarVisible: state.isSidebarVisible,
    isChannelsOpen: state.isChannelsOpen,
    isPrivateOpen: state.isPrivateOpen,
    rooms: state.rooms,
    roomMessages: Object.fromEntries(
      Object.entries(state.roomMessages).map(([roomId, messages]) => [
        roomId,
        capRoomMessages(messages),
      ])
    ),
    fontSize: state.fontSize,
    unreadCounts: state.unreadCounts,
    hasEverUsedChats: state.hasEverUsedChats,
  }),
  migrate: (persistedState: unknown, version: number) => {
    console.log(
      "[ChatsStore] Migrate function started. Version:",
      version,
      "Persisted state exists:",
      !!persistedState
    );
    if (persistedState) {
      console.log(
        "[ChatsStore] Persisted state type for rooms:",
        typeof (persistedState as ChatsStoreState).rooms,
        "Is Array:",
        Array.isArray((persistedState as ChatsStoreState).rooms)
      );
    }

    if (version < STORE_VERSION && !persistedState) {
      console.log(
        `[ChatsStore] Migrating from old localStorage keys to version ${STORE_VERSION}...`
      );
      try {
        const migratedState: Partial<ChatsStoreState> = {};

        const oldAiMessagesRaw = localStorage.getItem("chats:messages");
        if (oldAiMessagesRaw) {
          try {
            migratedState.aiMessages = JSON.parse(oldAiMessagesRaw);
          } catch (e) {
            console.warn("Failed to parse old AI messages during migration", e);
          }
        }

        const oldUsernameKey = "chats:chatRoomUsername";
        const oldUsername = localStorage.getItem(oldUsernameKey);
        if (oldUsername) {
          migratedState.username = oldUsername;
          saveUsernameToRecovery(oldUsername);
          localStorage.removeItem(oldUsernameKey);
          console.log(
            `[ChatsStore] Migrated and removed '${oldUsernameKey}' key during version upgrade.`
          );
        }

        const oldCurrentRoomId = localStorage.getItem("chats:lastOpenedRoomId");
        if (oldCurrentRoomId) {
          migratedState.currentRoomId = oldCurrentRoomId;
        }

        const oldSidebarVisibleRaw = localStorage.getItem("chats:sidebarVisible");
        if (oldSidebarVisibleRaw) {
          migratedState.isSidebarVisible = oldSidebarVisibleRaw !== "false";
        }

        const oldCachedRoomsRaw = localStorage.getItem("chats:cachedRooms");
        if (oldCachedRoomsRaw) {
          try {
            migratedState.rooms = JSON.parse(oldCachedRoomsRaw);
          } catch (e) {
            console.warn("Failed to parse old cached rooms during migration", e);
          }
        }

        const oldCachedRoomMessagesRaw = localStorage.getItem(
          "chats:cachedRoomMessages"
        );
        if (oldCachedRoomMessagesRaw) {
          try {
            migratedState.roomMessages = JSON.parse(oldCachedRoomMessagesRaw);
          } catch (e) {
            console.warn(
              "Failed to parse old cached room messages during migration",
              e
            );
          }
        }

        console.log("[ChatsStore] Migration data:", migratedState);

        const finalMigratedState = {
          ...getInitialState(),
          ...migratedState,
        } as ChatsStoreState;
        console.log("[ChatsStore] Final migrated state:", finalMigratedState);
        console.log(
          "[ChatsStore] Migrated rooms type:",
          typeof finalMigratedState.rooms,
          "Is Array:",
          Array.isArray(finalMigratedState.rooms)
        );
        return finalMigratedState;
      } catch (e) {
        console.error("[ChatsStore] Migration failed:", e);
      }
    }

    if (persistedState) {
      console.log("[ChatsStore] Using persisted state.");
      const state = persistedState as ChatsStoreState;
      const finalState = { ...state };

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
      return finalState;
    }

    console.log("[ChatsStore] Falling back to initial state.");
    return { ...getInitialState() } as ChatsStoreState;
  },
  onRehydrateStorage: () => {
    console.log("[ChatsStore] Rehydrating storage...");
    return (state?: ChatsStoreState, error?: unknown) => {
      if (error) {
        console.error("[ChatsStore] Error during rehydration:", error);
      } else if (state) {
        console.log(
          "[ChatsStore] Rehydration complete. Current state username:",
          state.username,
          "authToken:",
          state.authToken ? "present" : "null"
        );
        if (state.username === null) {
          const recoveredUsername = getUsernameFromRecovery();
          if (recoveredUsername) {
            console.log(
              `[ChatsStore] Found encoded username '${recoveredUsername}' in recovery storage. Applying.`
            );
            state.username = recoveredUsername;
          } else {
            const oldUsernameKey = "chats:chatRoomUsername";
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
      }
    };
  },
});
