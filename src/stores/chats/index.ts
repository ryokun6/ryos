import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { abortableFetch } from "@/utils/abortableFetch";
import type { ChatsStoreState } from "./types";
import type { ChatsStoreDataSnapshot } from "./types";
import {
  capRoomMessages,
  clearLegacyTokenRecovery,
  consumeLegacyAuthToken,
  ensureUsernameRecovery,
  getUsernameFromRecovery,
  saveUsernameToRecovery,
} from "./shared";
import { createAiSlice, getInitialAiMessage } from "./aiSlice";
import {
  chatsStoreApiRef,
  createAuthSlice,
  forceLogoutOnUnauthorized,
} from "./authSlice";
import { createRoomsSlice } from "./roomsSlice";

const STORE_VERSION = 3;
const STORE_NAME = "ryos:chats";

function getInitialState(): ChatsStoreDataSnapshot {
  // Recover username from localStorage (auth token lives in httpOnly cookie)
  const recoveredUsername = getUsernameFromRecovery();

  return {
    aiMessages: [getInitialAiMessage()],
    username: recoveredUsername,
    isAuthenticated: false,
    hasPassword: null,
    rooms: [],
    currentRoomId: null,
    roomMessages: {},
    unreadCounts: {},
    hasEverUsedChats: false,
    isSidebarVisible: true,
    isChannelsOpen: true,
    isPrivateOpen: true,
    fontSize: 13, // Default font size
    messageRenderLimit: 50,
  };
}

/**
 * Verify the current session with the server.
 *
 * On repeat visits the httpOnly cookie authenticates the request
 * automatically.  On the **first** visit after the upgrade from
 * localStorage-based tokens, `legacyToken` is sent via the
 * Authorization header so the server can validate it and set the
 * httpOnly cookie for all future loads.
 */
async function restoreSessionFromCookie(
  expectedUsername: string,
  legacyToken?: string | null
) {
  try {
    const headers: Record<string, string> = {};
    if (legacyToken) {
      console.log(
        "[ChatsStore] Migrating legacy token to httpOnly cookie for",
        expectedUsername
      );
      headers["Authorization"] = `Bearer ${legacyToken}`;
      headers["X-Username"] = expectedUsername;
    }

    const response = await abortableFetch("/api/auth/session", {
      method: "GET",
      headers,
      timeout: 10000,
      throwOnHttpError: false,
      retry: { maxAttempts: 2, initialDelayMs: 500 },
    });

    if (!response.ok) {
      console.log("[ChatsStore] Session restore failed:", response.status);
      if (response.status === 401 || response.status === 403) {
        forceLogoutOnUnauthorized();
      }
      return;
    }

    const data = await response.json();
    if (data.authenticated && data.username) {
      console.log(
        "[ChatsStore] Session restored for",
        data.username,
        legacyToken ? "(migrated from localStorage)" : "(from cookie)"
      );
      const getState = chatsStoreApiRef.getState;
      if (!getState) return;
      const store = getState();

      if (store.username === expectedUsername) {
        store.setAuthenticated(true);
        store.checkHasPassword();
      }
    } else {
      console.log("[ChatsStore] No valid session — logging out.");
      forceLogoutOnUnauthorized();
    }
  } catch (err) {
    // Network error — keep state, don't force-logout.
    // The user may come back online and the cookie will still be valid.
    console.warn("[ChatsStore] Session restore request failed:", err);
  }
}

export const useChatsStore = create<ChatsStoreState>()(
  persist(
    (set, get) => {
      // Get initial state
      const initialState = getInitialState();
      // Ensure username recovery key is set; clean up legacy token storage
      ensureUsernameRecovery(initialState.username);

      return {
        ...initialState,

        // --- Actions ---
        ...createAiSlice(set),
        ...createAuthSlice(set, get, getInitialState),
        ...createRoomsSlice(set, get),
      };
    },
    {
      name: STORE_NAME,
      version: STORE_VERSION,
      storage: createJSONStorage(() => localStorage), // Use localStorage
      partialize: (state) => ({
        aiMessages: state.aiMessages,
        username: state.username,
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
      // --- Migration from old localStorage keys ---
      migrate: (persistedState, version) => {
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

            // Migrate AI Messages
            const oldAiMessagesRaw = localStorage.getItem("chats:messages");
            if (oldAiMessagesRaw) {
              try {
                migratedState.aiMessages = JSON.parse(oldAiMessagesRaw);
              } catch (e) {
                console.warn(
                  "Failed to parse old AI messages during migration",
                  e
                );
              }
            }

            // Migrate Username
            const oldUsernameKey = "chats:chatRoomUsername"; // Define old key
            const oldUsername = localStorage.getItem(oldUsernameKey);
            if (oldUsername) {
              migratedState.username = oldUsername;
              // Save to recovery mechanism as well
              saveUsernameToRecovery(oldUsername);
              localStorage.removeItem(oldUsernameKey); // Remove here during primary migration
              console.log(
                `[ChatsStore] Migrated and removed '${oldUsernameKey}' key during version upgrade.`
              );
            }

            // Migrate Last Opened Room ID
            const oldCurrentRoomId = localStorage.getItem(
              "chats:lastOpenedRoomId"
            );
            if (oldCurrentRoomId)
              migratedState.currentRoomId = oldCurrentRoomId;

            // Migrate Sidebar Visibility
            const oldSidebarVisibleRaw = localStorage.getItem(
              "chats:sidebarVisible"
            );
            if (oldSidebarVisibleRaw) {
              // Check if it's explicitly "false", otherwise default to true (initial state)
              migratedState.isSidebarVisible = oldSidebarVisibleRaw !== "false";
            }

            // Migrate Cached Rooms
            const oldCachedRoomsRaw = localStorage.getItem("chats:cachedRooms");
            if (oldCachedRoomsRaw) {
              try {
                migratedState.rooms = JSON.parse(oldCachedRoomsRaw);
              } catch (e) {
                console.warn(
                  "Failed to parse old cached rooms during migration",
                  e
                );
              }
            }

            // Migrate Cached Room Messages
            const oldCachedRoomMessagesRaw = localStorage.getItem(
              "chats:cachedRoomMessages"
            ); // Assuming this key
            if (oldCachedRoomMessagesRaw) {
              try {
                migratedState.roomMessages = JSON.parse(
                  oldCachedRoomMessagesRaw
                );
              } catch (e) {
                console.warn(
                  "Failed to parse old cached room messages during migration",
                  e
                );
              }
            }

            console.log("[ChatsStore] Migration data:", migratedState);

            // Clean up old keys (Optional - uncomment if desired after confirming migration)
            // localStorage.removeItem('chats:messages');
            // localStorage.removeItem('chats:lastOpenedRoomId');
            // localStorage.removeItem('chats:sidebarVisible');
            // localStorage.removeItem('chats:cachedRooms');
            // localStorage.removeItem('chats:cachedRoomMessages');
            // console.log("[ChatsStore] Old localStorage keys potentially removed.");

            const finalMigratedState = {
              ...getInitialState(),
              ...migratedState,
            } as ChatsStoreState;
            console.log(
              "[ChatsStore] Final migrated state:",
              finalMigratedState
            );
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

          // Auth lives in httpOnly cookies — no token in persisted state.

          ensureUsernameRecovery(finalState.username);

          // Filter out private rooms the current user is not a member of.
          // Persisted state may contain stale private rooms from a
          // previous session or a different user. IRC rooms are public-like.
          if (Array.isArray(finalState.rooms)) {
            const lowerUser = finalState.username?.toLowerCase() ?? null;
            finalState.rooms = finalState.rooms.filter((room) => {
              if (!room.type || room.type === "public" || room.type === "irc")
                return true;
              if (!lowerUser) return false;
              return Array.isArray(room.members) && room.members.includes(lowerUser);
            });
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
        return (state, error) => {
          chatsStoreApiRef.getState = useChatsStore.getState;
          chatsStoreApiRef.setState = useChatsStore.setState;
          if (error) {
            console.error("[ChatsStore] Error during rehydration:", error);
          } else if (state) {
            console.log(
              "[ChatsStore] Rehydration complete. Current state username:",
              state.username
            );

            // Recover username if missing
            if (state.username === null) {
              const recoveredUsername = getUsernameFromRecovery();
              if (recoveredUsername) {
                console.log(
                  `[ChatsStore] Recovered username '${recoveredUsername}' from recovery storage.`
                );
                state.username = recoveredUsername;
              } else {
                const oldUsernameKey = "chats:chatRoomUsername";
                const oldUsername = localStorage.getItem(oldUsernameKey);
                if (oldUsername) {
                  console.log(
                    `[ChatsStore] Recovered username '${oldUsername}' from legacy key.`
                  );
                  state.username = oldUsername;
                  saveUsernameToRecovery(oldUsername);
                  localStorage.removeItem(oldUsernameKey);
                }
              }
            }

            // Consume any legacy token from localStorage for one-time migration
            // to httpOnly cookie. Self-cleaning: key is removed after read.
            const legacyToken = consumeLegacyAuthToken() || null;
            clearLegacyTokenRecovery();
            ensureUsernameRecovery(state.username);

            // Restore session from httpOnly cookie — or, on the very first
            // load after the upgrade, use the legacy token one last time so
            // the server can set the cookie for future loads.
            if (state.username) {
              restoreSessionFromCookie(state.username, legacyToken);
            }
          }
        };
      },
    }
  )
);

chatsStoreApiRef.getState = useChatsStore.getState;
chatsStoreApiRef.setState = useChatsStore.setState;

export type { ChatsStoreState } from "./types";
