import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { type Message } from "ai/react";
import { type ChatRoom, type ChatMessage } from "@/types/chat";

// Recovery mechanism - uses different prefix to avoid reset
const USERNAME_RECOVERY_KEY = "_usr_recovery_key_";
const AUTH_TOKEN_RECOVERY_KEY = "_auth_recovery_key_";

// Simple encoding/decoding functions
const encode = (value: string): string => {
  return btoa(value.split("").reverse().join(""));
};

const decode = (encoded: string): string | null => {
  try {
    return atob(encoded).split("").reverse().join("");
  } catch (e) {
    console.error("[ChatsStore] Failed to decode value:", e);
    return null;
  }
};

// Username recovery functions
const encodeUsername = (username: string): string => encode(username);
const decodeUsername = (encoded: string): string | null => decode(encoded);

const saveUsernameToRecovery = (username: string | null) => {
  if (username) {
    localStorage.setItem(USERNAME_RECOVERY_KEY, encodeUsername(username));
  } else {
    // Remove key when username is cleared to avoid stale recovery data
    localStorage.removeItem(USERNAME_RECOVERY_KEY);
  }
};

const getUsernameFromRecovery = (): string | null => {
  const encoded = localStorage.getItem(USERNAME_RECOVERY_KEY);
  if (encoded) {
    return decodeUsername(encoded);
  }
  return null;
};

// Auth token recovery functions
const saveAuthTokenToRecovery = (token: string | null) => {
  if (token) {
    localStorage.setItem(AUTH_TOKEN_RECOVERY_KEY, encode(token));
  } else {
    localStorage.removeItem(AUTH_TOKEN_RECOVERY_KEY);
  }
};

const getAuthTokenFromRecovery = (): string | null => {
  const encoded = localStorage.getItem(AUTH_TOKEN_RECOVERY_KEY);
  if (encoded) {
    return decode(encoded);
  }
  return null;
};

// Ensure recovery keys are set if values exist in store but not in recovery
const ensureRecoveryKeysAreSet = (
  username: string | null,
  authToken: string | null
) => {
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

// Define the state structure
export interface ChatsStoreState {
  // AI Chat State
  aiMessages: Message[];
  // Room State
  username: string | null;
  authToken: string | null; // Authentication token
  rooms: ChatRoom[];
  currentRoomId: string | null; // ID of the currently selected room, null for AI chat (@ryo)
  roomMessages: Record<string, ChatMessage[]>; // roomId -> messages map
  // UI State
  isSidebarVisible: boolean;
  fontSize: number; // Add font size state

  // Actions
  setAiMessages: (messages: Message[]) => void;
  setUsername: (username: string | null) => void;
  setAuthToken: (token: string | null) => void; // Set auth token
  setRooms: (rooms: ChatRoom[]) => void;
  setCurrentRoomId: (roomId: string | null) => void;
  setRoomMessagesForCurrentRoom: (messages: ChatMessage[]) => void; // Sets messages for the *current* room
  addMessageToRoom: (roomId: string, message: ChatMessage) => void;
  removeMessageFromRoom: (roomId: string, messageId: string) => void;
  clearRoomMessages: (roomId: string) => void; // Clears messages for a specific room
  toggleSidebarVisibility: () => void;
  setFontSize: (size: number | ((prevSize: number) => number)) => void; // Add font size action
  ensureAuthToken: () => Promise<{ ok: boolean; error?: string }>; // Add auth token generation
  reset: () => void; // Reset store to initial state
}

const initialAiMessage: Message = {
  id: "1",
  role: "assistant",
  content: "👋 hey! i'm ryo. ask me anything!",
  createdAt: new Date(),
};

const getInitialState = (): Omit<
  ChatsStoreState,
  | "reset"
  | "setAiMessages"
  | "setUsername"
  | "setAuthToken"
  | "setRooms"
  | "setCurrentRoomId"
  | "setRoomMessagesForCurrentRoom"
  | "addMessageToRoom"
  | "removeMessageFromRoom"
  | "clearRoomMessages"
  | "toggleSidebarVisibility"
  | "setFontSize"
  | "ensureAuthToken"
> => {
  // Try to recover username and auth token if available
  const recoveredUsername = getUsernameFromRecovery();
  const recoveredAuthToken = getAuthTokenFromRecovery();

  return {
    aiMessages: [initialAiMessage],
    username: recoveredUsername,
    authToken: recoveredAuthToken,
    rooms: [],
    currentRoomId: null,
    roomMessages: {},
    isSidebarVisible: true,
    fontSize: 13, // Default font size
  };
};

const STORE_VERSION = 2;
const STORE_NAME = "ryos:chats";

export const useChatsStore = create<ChatsStoreState>()(
  persist(
    (set, get) => {
      // Get initial state
      const initialState = getInitialState();
      // Ensure recovery keys are set if values exist
      ensureRecoveryKeysAreSet(initialState.username, initialState.authToken);

      return {
        ...initialState,

        // --- Actions ---
        setAiMessages: (messages) => set({ aiMessages: messages }),
        setUsername: (username) => {
          // Persist or clear username in recovery storage
          saveUsernameToRecovery(username);

          if (username === null) {
            // Clear auth token when username is removed to prevent leakage
            saveAuthTokenToRecovery(null);
            set({ username: null, authToken: null });
          } else {
            set({ username });
          }
        },
        setAuthToken: (token) => {
          // Save auth token to recovery storage when it's set
          saveAuthTokenToRecovery(token);
          set({ authToken: token });
        },
        setRooms: (newRooms) => {
          // Ensure incoming data is an array
          if (!Array.isArray(newRooms)) {
            console.warn(
              "[ChatsStore] Attempted to set rooms with a non-array value:",
              newRooms
            );
            return; // Ignore non-array updates
          }

          // Deep comparison to prevent unnecessary updates
          const currentRooms = get().rooms;
          if (JSON.stringify(currentRooms) === JSON.stringify(newRooms)) {
            console.log(
              "[ChatsStore] setRooms skipped: newRooms are identical to current rooms."
            );
            return; // Skip update if rooms haven't actually changed
          }

          console.log("[ChatsStore] setRooms called. Updating rooms.");
          set({ rooms: newRooms });
        },
        setCurrentRoomId: (roomId) => set({ currentRoomId: roomId }),
        setRoomMessagesForCurrentRoom: (messages) => {
          const currentRoomId = get().currentRoomId;
          if (currentRoomId) {
            set((state) => ({
              roomMessages: {
                ...state.roomMessages,
                [currentRoomId]: messages.sort(
                  (a, b) => a.timestamp - b.timestamp
                ),
              },
            }));
          }
        },
        addMessageToRoom: (roomId, message) => {
          set((state) => {
            const existingMessages = state.roomMessages[roomId] || [];
            // Avoid duplicates from Pusher echos or optimistic updates
            if (existingMessages.some((m) => m.id === message.id)) {
              return {}; // No change needed
            }
            // Handle potential replacement of temp message ID if server ID matches
            const tempIdPattern = /^temp_/; // Or use the actual temp ID if passed
            const messagesWithoutTemp = existingMessages.filter(
              (m) =>
                !(
                  tempIdPattern.test(m.id) &&
                  m.content === message.content &&
                  m.username === message.username
                )
            );

            return {
              roomMessages: {
                ...state.roomMessages,
                [roomId]: [...messagesWithoutTemp, message].sort(
                  (a, b) => a.timestamp - b.timestamp
                ),
              },
            };
          });
        },
        removeMessageFromRoom: (roomId, messageId) => {
          set((state) => {
            const existingMessages = state.roomMessages[roomId] || [];
            const updatedMessages = existingMessages.filter(
              (m) => m.id !== messageId
            );
            // Only update if a message was actually removed
            if (updatedMessages.length < existingMessages.length) {
              return {
                roomMessages: {
                  ...state.roomMessages,
                  [roomId]: updatedMessages,
                },
              };
            }
            return {}; // No change needed
          });
        },
        clearRoomMessages: (roomId) => {
          set((state) => ({
            roomMessages: {
              ...state.roomMessages,
              [roomId]: [],
            },
          }));
        },
        toggleSidebarVisibility: () =>
          set((state) => ({
            isSidebarVisible: !state.isSidebarVisible,
          })),
        setFontSize: (sizeOrFn) =>
          set((state) => ({
            fontSize:
              typeof sizeOrFn === "function"
                ? sizeOrFn(state.fontSize)
                : sizeOrFn,
          })),
        ensureAuthToken: async () => {
          const currentUsername = get().username;
          const currentToken = get().authToken;

          // If no username, nothing to do
          if (!currentUsername) {
            console.log(
              "[ChatsStore] No username set, skipping token generation"
            );
            return { ok: true };
          }

          // If token already exists, nothing to do
          if (currentToken) {
            console.log(
              "[ChatsStore] Auth token already exists for user:",
              currentUsername
            );
            return { ok: true };
          }

          // Username exists but no token, generate one
          console.log(
            "[ChatsStore] Generating auth token for existing user:",
            currentUsername
          );

          try {
            const response = await fetch(
              "/api/chat-rooms?action=generateToken",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ username: currentUsername }),
              }
            );

            const data = await response.json();

            if (response.ok && data.token) {
              console.log("[ChatsStore] Auth token generated successfully");
              set({ authToken: data.token });
              saveAuthTokenToRecovery(data.token);
              return { ok: true };
            } else if (response.status === 409) {
              // Token already exists on server, this shouldn't happen but handle it
              console.warn(
                "[ChatsStore] Token already exists on server for user:",
                currentUsername
              );
              return { ok: false, error: "Token already exists on server" };
            } else {
              console.error(
                "[ChatsStore] Failed to generate auth token:",
                data.error
              );
              return {
                ok: false,
                error: data.error || "Failed to generate auth token",
              };
            }
          } catch (error) {
            console.error("[ChatsStore] Error generating auth token:", error);
            return {
              ok: false,
              error: "Network error while generating auth token",
            };
          }
        },
        reset: () => {
          // Before resetting, ensure we have the username and auth token saved
          const currentUsername = get().username;
          const currentAuthToken = get().authToken;
          if (currentUsername) {
            saveUsernameToRecovery(currentUsername);
          }
          if (currentAuthToken) {
            saveAuthTokenToRecovery(currentAuthToken);
          }

          // Reset the store to initial state (which already tries to recover username and auth token)
          set(getInitialState());
        },
      };
    },
    {
      name: STORE_NAME,
      version: STORE_VERSION,
      storage: createJSONStorage(() => localStorage), // Use localStorage
      partialize: (state) => ({
        // Select properties to persist
        aiMessages: state.aiMessages,
        username: state.username,
        authToken: state.authToken, // Persist auth token
        currentRoomId: state.currentRoomId,
        isSidebarVisible: state.isSidebarVisible,
        rooms: state.rooms, // Persist rooms list
        roomMessages: state.roomMessages, // Persist room messages cache
        fontSize: state.fontSize, // Persist font size
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

        // Run legacy-data migration whenever the stored version is outdated,
        // even if a persistedState object already exists.
        if (version < STORE_VERSION) {
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
        // If persistedState exists, use it (already in new format or newer version)
        if (persistedState) {
          console.log("[ChatsStore] Using persisted state.");
          const state = persistedState as ChatsStoreState;
          const finalState = { ...state };

          // If there's a username or auth token, save them to the recovery mechanism
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
        // Fallback to initial state if migration fails or no persisted state
        console.log("[ChatsStore] Falling back to initial state.");
        return { ...getInitialState() } as ChatsStoreState;
      },
      // --- Rehydration Check for Null Username ---
      onRehydrateStorage: () => {
        console.log("[ChatsStore] Rehydrating storage...");
        return (state, error) => {
          if (error) {
            console.error("[ChatsStore] Error during rehydration:", error);
          } else if (state) {
            console.log(
              "[ChatsStore] Rehydration complete. Current state username:",
              state.username,
              "authToken:",
              state.authToken ? "present" : "null"
            );
            // Check if username is null AFTER rehydration
            if (state.username === null) {
              // First check the recovery key
              const recoveredUsername = getUsernameFromRecovery();
              if (recoveredUsername) {
                console.log(
                  `[ChatsStore] Found encoded username '${recoveredUsername}' in recovery storage. Applying.`
                );
                state.username = recoveredUsername;
              } else {
                // Fallback to checking old key
                const oldUsernameKey = "chats:chatRoomUsername";
                const oldUsername = localStorage.getItem(oldUsernameKey);
                if (oldUsername) {
                  console.log(
                    `[ChatsStore] Found old username '${oldUsername}' in localStorage during rehydration check. Applying.`
                  );
                  state.username = oldUsername;
                  // Save to recovery mechanism as well
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

            // Check if auth token is null AFTER rehydration
            if (state.authToken === null) {
              const recoveredAuthToken = getAuthTokenFromRecovery();
              if (recoveredAuthToken) {
                console.log(
                  "[ChatsStore] Found encoded auth token in recovery storage. Applying."
                );
                state.authToken = recoveredAuthToken;
              }
            }

            // Ensure both are saved to recovery
            ensureRecoveryKeysAreSet(state.username, state.authToken);
          }
        };
      },
    }
  )
);
