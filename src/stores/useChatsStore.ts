import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  type ChatRoom,
  type ChatMessage,
  type AIChatMessage,
} from "@/types/chat";
import { track } from "@vercel/analytics";
import { APP_ANALYTICS } from "@/utils/analytics";
import i18n from "@/lib/i18n";
import {
  TOKEN_REFRESH_THRESHOLD,
  ensureRecoveryKeysAreSet,
  getAuthTokenFromRecovery,
  getTokenRefreshTime,
  getUsernameFromRecovery,
  saveAuthTokenToRecovery,
  saveTokenRefreshTime,
  saveUsernameToRecovery,
} from "./chats/recovery";
import {
  mergeServerMessagesWithOptimistic,
} from "./chats/roomMessages";
import {
  type ApiChatMessagePayload as ApiMessage,
  normalizeApiMessages,
} from "./chats/messageNormalization";
import {
  createOptimisticChatMessage,
  sendRoomMessageRequest,
} from "./chats/sendMessage";
import { createRoomRequest, deleteRoomRequest } from "./chats/roomRequests";
import { switchPresenceRoomRequest } from "./chats/presenceRequests";
import { validateCreateUserInput } from "./chats/userValidation";
import {
  logoutRequest,
  refreshAuthTokenRequest,
  registerUserRequest,
} from "./chats/authApi";
import { readErrorResponseBody } from "./chats/httpErrors";
import {
  getDaysUntilTokenRefresh,
  getTokenAgeDays,
  isTokenRefreshDue,
} from "./chats/tokenLifecycle";
import { clearChatRecoveryStorage } from "./chats/logoutCleanup";
import {
  checkPasswordStatusRequest,
  setPasswordRequest,
} from "./chats/passwordApi";
import { buildPersistedRoomMessages } from "./chats/persistence";
import {
  createChatsOnRehydrateStorage,
  migrateChatsPersistedState,
} from "./chats/persistLifecycle";
import {
  clearRoomMessagesInMap,
  mergeIncomingRoomMessageInMap,
  prepareRoomsForSet,
  removeRoomMessageFromMap,
  setCurrentRoomMessagesInMap,
} from "./chats/roomState";
import {
  fetchBulkMessagesPayload,
  fetchRoomMessagesPayload,
  fetchRoomsPayload,
} from "./chats/messagePayloads";

// Define the state structure
export interface ChatsStoreState {
  // AI Chat State
  aiMessages: AIChatMessage[];
  // Room State
  username: string | null;
  authToken: string | null; // Authentication token
  hasPassword: boolean | null; // Whether user has password set (null = unknown/not checked)
  rooms: ChatRoom[];
  currentRoomId: string | null; // ID of the currently selected room, null for AI chat (@ryo)
  roomMessages: Record<string, ChatMessage[]>; // roomId -> messages map
  unreadCounts: Record<string, number>; // roomId -> unread message count
  hasEverUsedChats: boolean; // Track if user has ever used chat before
  // UI State
  isSidebarVisible: boolean;
  isChannelsOpen: boolean; // Persisted collapse state for Channels section
  isPrivateOpen: boolean; // Persisted collapse state for Private section
  fontSize: number; // Add font size state
  // Rendering limits
  messageRenderLimit: number; // Max messages to render per room initially

  // Actions
  setAiMessages: (messages: AIChatMessage[]) => void;
  setUsername: (username: string | null) => void;
  setAuthToken: (token: string | null) => void; // Set auth token
  setHasPassword: (hasPassword: boolean | null) => void; // Set password status
  checkHasPassword: () => Promise<{ ok: boolean; error?: string }>; // Check if user has password
  setPassword: (password: string) => Promise<{ ok: boolean; error?: string }>; // Set password for user
  setRooms: (rooms: ChatRoom[]) => void;
  setCurrentRoomId: (roomId: string | null) => void;
  setRoomMessagesForCurrentRoom: (messages: ChatMessage[]) => void; // Sets messages for the *current* room
  addMessageToRoom: (roomId: string, message: ChatMessage) => void;
  removeMessageFromRoom: (roomId: string, messageId: string) => void;
  clearRoomMessages: (roomId: string) => void; // Clears messages for a specific room
  toggleSidebarVisibility: () => void;
  toggleChannelsOpen: () => void; // Toggle Channels collapsed state
  togglePrivateOpen: () => void; // Toggle Private collapsed state
  setFontSize: (size: number | ((prevSize: number) => number)) => void; // Add font size action
  setMessageRenderLimit: (limit: number) => void; // Set render limit
  ensureAuthToken: () => Promise<{ ok: boolean; error?: string }>; // Add auth token generation
  refreshAuthToken: () => Promise<{
    ok: boolean;
    error?: string;
    token?: string;
  }>; // Add token refresh
  checkAndRefreshTokenIfNeeded: () => Promise<{ refreshed: boolean }>; // Proactive token refresh

  // Room Management Actions
  fetchRooms: () => Promise<{ ok: boolean; error?: string }>;
  fetchMessagesForRoom: (
    roomId: string
  ) => Promise<{ ok: boolean; error?: string }>;
  fetchBulkMessages: (roomIds: string[]) => Promise<{
    ok: boolean;
    error?: string;
    messagesMap?: Record<string, ChatMessage[]>;
  }>;
  switchRoom: (
    roomId: string | null
  ) => Promise<{ ok: boolean; error?: string }>;
  createRoom: (
    name: string,
    type?: "public" | "private",
    members?: string[]
  ) => Promise<{ ok: boolean; error?: string; roomId?: string }>;
  deleteRoom: (roomId: string) => Promise<{ ok: boolean; error?: string }>;
  sendMessage: (
    roomId: string,
    content: string
  ) => Promise<{ ok: boolean; error?: string }>;
  createUser: (
    username: string,
    password: string
  ) => Promise<{ ok: boolean; error?: string }>;

  incrementUnread: (roomId: string) => void;
  clearUnread: (roomId: string) => void;
  setHasEverUsedChats: (value: boolean) => void;

  reset: () => void; // Reset store to initial state
  logout: () => Promise<void>; // Logout and clear all user data
}

const getInitialAiMessage = (): AIChatMessage => ({
  id: "1",
  role: "assistant",
  parts: [{ type: "text" as const, text: i18n.t("apps.chats.messages.greeting") }],
  metadata: {
    createdAt: new Date(),
  },
});

const getInitialState = (): Omit<
  ChatsStoreState,
  | "isAdmin"
  | "reset"
  | "logout"
  | "setAiMessages"
  | "setUsername"
  | "setAuthToken"
  | "setHasPassword"
  | "checkHasPassword"
  | "setPassword"
  | "setRooms"
  | "setCurrentRoomId"
  | "setRoomMessagesForCurrentRoom"
  | "addMessageToRoom"
  | "removeMessageFromRoom"
  | "clearRoomMessages"
  | "toggleSidebarVisibility"
  | "toggleChannelsOpen"
  | "togglePrivateOpen"
  | "setFontSize"
  | "setMessageRenderLimit"
  | "ensureAuthToken"
  | "refreshAuthToken"
  | "checkAndRefreshTokenIfNeeded"
  | "fetchRooms"
  | "fetchMessagesForRoom"
  | "fetchBulkMessages"
  | "switchRoom"
  | "createRoom"
  | "deleteRoom"
  | "sendMessage"
  | "createUser"
  | "incrementUnread"
  | "clearUnread"
  | "setHasEverUsedChats"
> => {
  // Try to recover username and auth token if available
  const recoveredUsername = getUsernameFromRecovery();
  const recoveredAuthToken = getAuthTokenFromRecovery();

  return {
    aiMessages: [getInitialAiMessage()],
    username: recoveredUsername,
    authToken: recoveredAuthToken,
    hasPassword: null, // Unknown until checked
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
          // Save username to recovery storage when it's set
          saveUsernameToRecovery(username);
          set({ username });

          // Check password status when username changes (if we have a token)
          const currentToken = get().authToken;
          if (username && currentToken) {
            setTimeout(() => {
              get().checkHasPassword();
            }, 100);
          } else if (!username) {
            // Clear password status when username is cleared
            set({ hasPassword: null });
          }
        },
        setAuthToken: (token) => {
          // Save auth token to recovery storage when it's set
          saveAuthTokenToRecovery(token);
          set({ authToken: token });

          // Check password status when token changes (if we have a username)
          const currentUsername = get().username;
          if (token && currentUsername) {
            setTimeout(() => {
              get().checkHasPassword();
            }, 100);
          } else if (!token) {
            // Clear password status when token is cleared
            set({ hasPassword: null });
          }
        },
        setHasPassword: (hasPassword) => {
          set({ hasPassword });
        },
        checkHasPassword: async () => {
          const currentUsername = get().username;
          const currentToken = get().authToken;

          if (!currentUsername || !currentToken) {
            console.log(
              "[ChatsStore] checkHasPassword: No username or token, setting null"
            );
            set({ hasPassword: null });
            return { ok: false, error: "Authentication required" };
          }

          console.log(
            "[ChatsStore] checkHasPassword: Checking for user",
            currentUsername
          );
          try {
            const response = await checkPasswordStatusRequest({
              username: currentUsername,
              authToken: currentToken,
            });

            console.log(
              "[ChatsStore] checkHasPassword: Response status",
              response.status
            );
            if (response.ok) {
              const data = await response.json();
              console.log("[ChatsStore] checkHasPassword: Result", data);
              set({ hasPassword: data.hasPassword });
              return { ok: true };
            } else {
              console.log(
                "[ChatsStore] checkHasPassword: Failed with status",
                response.status
              );
              set({ hasPassword: null });
              return { ok: false, error: "Failed to check password status" };
            }
          } catch (error) {
            console.error(
              "[ChatsStore] Error checking password status:",
              error
            );
            set({ hasPassword: null });
            return {
              ok: false,
              error: "Network error while checking password",
            };
          }
        },
        setPassword: async (password) => {
          const currentUsername = get().username;
          const currentToken = get().authToken;

          if (!currentUsername || !currentToken) {
            return { ok: false, error: "Authentication required" };
          }

          try {
            const response = await setPasswordRequest({
              username: currentUsername,
              authToken: currentToken,
              password,
            });

            if (!response.ok) {
              const data = await response.json();
              return {
                ok: false,
                error: data.error || "Failed to set password",
              };
            }

            // Update local state to reflect password has been set
            set({ hasPassword: true });
            return { ok: true };
          } catch (error) {
            console.error("[ChatsStore] Error setting password:", error);
            return { ok: false, error: "Network error while setting password" };
          }
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

          const { changed, rooms } = prepareRoomsForSet(get().rooms, newRooms);
          if (!changed) {
            console.log(
              "[ChatsStore] setRooms skipped: newRooms are identical to current rooms."
            );
            return; // Skip update if rooms haven't actually changed
          }

          console.log("[ChatsStore] setRooms called. Updating rooms.");
          set({ rooms });
        },
        setCurrentRoomId: (roomId) => set({ currentRoomId: roomId }),
        setRoomMessagesForCurrentRoom: (messages) => {
          const currentRoomId = get().currentRoomId;
          if (currentRoomId) {
            set((state) => ({
              roomMessages: setCurrentRoomMessagesInMap(
                state.roomMessages,
                currentRoomId,
                messages
              ),
            }));
          }
        },
        addMessageToRoom: (roomId, message) => {
          set((state) => {
            const nextRoomMessages = mergeIncomingRoomMessageInMap(
              state.roomMessages,
              roomId,
              message
            );
            if (!nextRoomMessages) {
              return {};
            }
            return {
              roomMessages: nextRoomMessages,
            };
          });
        },
        removeMessageFromRoom: (roomId, messageId) => {
          set((state) => {
            const result = removeRoomMessageFromMap(
              state.roomMessages,
              roomId,
              messageId
            );
            if (result.changed) {
              return { roomMessages: result.roomMessages };
            }
            return {}; // No change needed
          });
        },
        clearRoomMessages: (roomId) => {
          set((state) => ({
            roomMessages: clearRoomMessagesInMap(state.roomMessages, roomId),
          }));
        },
        toggleSidebarVisibility: () =>
          set((state) => ({
            isSidebarVisible: !state.isSidebarVisible,
          })),
        toggleChannelsOpen: () =>
          set((state) => ({ isChannelsOpen: !state.isChannelsOpen })),
        togglePrivateOpen: () =>
          set((state) => ({ isPrivateOpen: !state.isPrivateOpen })),
        setFontSize: (sizeOrFn) =>
          set((state) => ({
            fontSize:
              typeof sizeOrFn === "function"
                ? sizeOrFn(state.fontSize)
                : sizeOrFn,
          })),
        setMessageRenderLimit: (limit: number) =>
          set(() => ({ messageRenderLimit: Math.max(20, Math.floor(limit)) })),
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

          // Username exists but no token - this is a legacy scenario.
          // Modern auth flows (createUser, authenticateWithPassword) return tokens directly.
          // This fallback exists for users who somehow have a username but no token.
          console.log(
            "[ChatsStore] Generating auth token for existing user:",
            currentUsername
          );

          // Legacy scenario: user has username but no token. 
          // This is rare - modern auth flows (register, login) return tokens directly.
          // For now, return error and require re-authentication
          console.warn(
            "[ChatsStore] User has username but no token - requires re-authentication:",
            currentUsername
          );
          return { ok: false, error: "Please log in again to continue" };
        },
        refreshAuthToken: async () => {
          const currentUsername = get().username;
          const currentToken = get().authToken;

          if (!currentUsername) {
            console.log("[ChatsStore] No username set, skipping token refresh");
            return { ok: false, error: "Username required" };
          }

          if (!currentToken) {
            console.log(
              "[ChatsStore] No auth token set, skipping token refresh"
            );
            return { ok: false, error: "Auth token required" };
          }

          console.log(
            "[ChatsStore] Refreshing auth token for existing user:",
            currentUsername
          );

          try {
            const response = await refreshAuthTokenRequest({
              username: currentUsername,
              oldToken: currentToken,
            });

            if (!response.ok) {
              const errorData = await readErrorResponseBody(response);
              console.error("[ChatsStore] Error refreshing token:", errorData);
              return {
                ok: false,
                error: errorData.error || "Failed to refresh token",
              };
            }

            const data = await response.json();
            if (data.token) {
              console.log("[ChatsStore] Auth token refreshed successfully");
              set({ authToken: data.token });
              saveAuthTokenToRecovery(data.token);
              // Save token refresh time
              saveTokenRefreshTime(currentUsername);
              return { ok: true, token: data.token };
            } else {
              console.error(
                "[ChatsStore] Invalid response format for token refresh"
              );
              return {
                ok: false,
                error: "Invalid response format for token refresh",
              };
            }
          } catch (error) {
            console.error("[ChatsStore] Error refreshing token:", error);
            return { ok: false, error: "Network error while refreshing token" };
          }
        },
        checkAndRefreshTokenIfNeeded: async () => {
          const currentUsername = get().username;
          const currentToken = get().authToken;

          if (!currentUsername || !currentToken) {
            console.log(
              "[ChatsStore] No username or auth token set, skipping token check"
            );
            return { refreshed: false };
          }

          // Get last refresh time
          const lastRefreshTime = getTokenRefreshTime(currentUsername);

          if (!lastRefreshTime) {
            // No refresh time recorded, save current time (assume token is fresh)
            console.log(
              "[ChatsStore] No refresh time found, recording current time"
            );
            saveTokenRefreshTime(currentUsername);
            return { refreshed: false };
          }

          const tokenAgeDays = getTokenAgeDays(lastRefreshTime);

          console.log(`[ChatsStore] Token age: ${tokenAgeDays} days`);

          // If token is older than threshold, refresh it
          if (isTokenRefreshDue(lastRefreshTime, TOKEN_REFRESH_THRESHOLD)) {
            console.log(
              `[ChatsStore] Token is ${tokenAgeDays} days old (refresh due - 7 days before 90-day expiry), refreshing...`
            );

            const refreshResult = await get().refreshAuthToken();

            if (refreshResult.ok) {
              // Update refresh time on successful refresh
              saveTokenRefreshTime(currentUsername);
              console.log(
                "[ChatsStore] Token refreshed automatically (7 days before expiry)"
              );
              return { refreshed: true };
            } else {
              console.error(
                "[ChatsStore] Failed to refresh token (will retry next hour):",
                refreshResult.error
              );
              return { refreshed: false };
            }
          } else {
            const daysUntilRefresh = getDaysUntilTokenRefresh(
              lastRefreshTime,
              TOKEN_REFRESH_THRESHOLD
            );
            console.log(
              `[ChatsStore] Token is ${tokenAgeDays} days old, next refresh in ${daysUntilRefresh} days`
            );
            return { refreshed: false };
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
        logout: async () => {
          console.log("[ChatsStore] Logging out user...");

          const currentUsername = get().username;
          const currentToken = get().authToken;

          // Inform server to invalidate current token if we have auth
          if (currentUsername && currentToken) {
            try {
              await logoutRequest({
                username: currentUsername,
                token: currentToken,
              });
            } catch (err) {
              console.warn(
                "[ChatsStore] Failed to notify server during logout:",
                err
              );
            }
          }

          // Track user logout analytics before clearing data
          if (currentUsername) {
            track(APP_ANALYTICS.USER_LOGOUT, { username: currentUsername });
          }

          // Clear recovery keys and refresh timestamp from localStorage
          clearChatRecoveryStorage(currentUsername);

          // Reset only user-specific data, preserve rooms and messages
          set((state) => ({
            ...state,
            aiMessages: [getInitialAiMessage()],
            username: null,
            authToken: null,
            hasPassword: null,
            currentRoomId: null,
          }));

          // Re-fetch rooms to show only public rooms visible to anonymous users
          try {
            await get().fetchRooms();
          } catch (error) {
            console.error(
              "[ChatsStore] Error refreshing rooms after logout:",
              error
            );
          }

          console.log("[ChatsStore] User logged out successfully");
        },
        fetchRooms: async () => {
          console.log("[ChatsStore] Fetching rooms...");
          const result = await fetchRoomsPayload(get().username);
          if (!result.ok) {
            if (result.error === "Network error. Please try again.") {
              console.error("[ChatsStore] Error fetching rooms");
            }
            return { ok: false, error: result.error };
          }

          // Normalize ordering via setRooms to enforce alphabetical sections
          get().setRooms(result.rooms);
          return { ok: true };
        },
        fetchMessagesForRoom: async (roomId: string) => {
          if (!roomId) return { ok: false, error: "Room ID required" };

          console.log(`[ChatsStore] Fetching messages for room ${roomId}...`);
          const result = await fetchRoomMessagesPayload(roomId);
          if (!result.ok) {
            if (result.error === "Network error. Please try again.") {
              console.error(
                `[ChatsStore] Error fetching messages for room ${roomId}`
              );
            }
            return { ok: false, error: result.error };
          }

          const fetchedMessages = normalizeApiMessages(result.messages || []);

          // Merge with any existing messages to avoid race conditions with realtime pushes
          set((state) => {
            const existing = state.roomMessages[roomId] || [];
            const merged = mergeServerMessagesWithOptimistic(
              existing,
              fetchedMessages
            );
            return {
              roomMessages: {
                ...state.roomMessages,
                [roomId]: merged,
              },
            };
          });

          return { ok: true };
        },
        fetchBulkMessages: async (roomIds: string[]) => {
          if (roomIds.length === 0)
            return { ok: false, error: "Room IDs required" };

          console.log(
            `[ChatsStore] Fetching messages for rooms: ${roomIds.join(", ")}...`
          );
          const result = await fetchBulkMessagesPayload(roomIds);
          if (!result.ok) {
            if (result.error === "Network error. Please try again.") {
              console.error(
                `[ChatsStore] Error fetching messages for rooms ${roomIds.join(
                  ", "
                )}`
              );
            }
            return { ok: false, error: result.error };
          }

          // Process and sort messages for each room like fetchMessagesForRoom does
          set((state) => {
            const nextRoomMessages = { ...state.roomMessages };

            Object.entries(result.messagesMap).forEach(([roomId, messages]) => {
              const processed = normalizeApiMessages(messages as ApiMessage[]);

              const existing = nextRoomMessages[roomId] || [];
              nextRoomMessages[roomId] = mergeServerMessagesWithOptimistic(
                existing,
                processed
              );
            });

            return { roomMessages: nextRoomMessages };
          });

          return { ok: true };
        },
        switchRoom: async (newRoomId: string | null) => {
          const currentRoomId = get().currentRoomId;
          const username = get().username;

          console.log(
            `[ChatsStore] Switching from ${currentRoomId} to ${newRoomId}`
          );

          // Update current room immediately
          set({ currentRoomId: newRoomId });

          // Clear unread count for the room we're entering
          if (newRoomId) {
            get().clearUnread(newRoomId);
          }

          // If switching to a real room and we have a username, handle the API call
          if (username) {
            try {
              const response = await switchPresenceRoomRequest({
                previousRoomId: currentRoomId,
                nextRoomId: newRoomId,
                username,
              });

              if (!response.ok) {
                const errorData = await readErrorResponseBody(response);
                console.error("[ChatsStore] Error switching rooms:", errorData);
                // Don't revert the room change on API error, just log it
              } else {
                console.log("[ChatsStore] Room switch API call successful");
                // Immediately refresh rooms to show updated presence counts
                // This ensures the UI reflects the change immediately rather than waiting for Pusher
                setTimeout(() => {
                  console.log("[ChatsStore] Refreshing rooms after switch");
                  get().fetchRooms();
                }, 50); // Small delay to let the server finish processing
              }
            } catch (error) {
              console.error(
                "[ChatsStore] Network error switching rooms:",
                error
              );
              // Don't revert the room change on network error, just log it
            }
          }

          // Always fetch messages for the new room to ensure latest content
          if (newRoomId) {
            console.log(
              `[ChatsStore] Fetching latest messages for room ${newRoomId}`
            );
            await get().fetchMessagesForRoom(newRoomId);
          }

          return { ok: true };
        },
        createRoom: async (
          name: string,
          type: "public" | "private" = "public",
          members: string[] = []
        ) => {
          const username = get().username;
          const authToken = get().authToken;

          if (!username) {
            return { ok: false, error: "Username required" };
          }

          if (!authToken) {
            // Try to ensure auth token exists
            const tokenResult = await get().ensureAuthToken();
            if (!tokenResult.ok) {
              return { ok: false, error: "Authentication required" };
            }
          }

          try {
            const response = await createRoomRequest({
              name,
              type,
              members,
              authToken: get().authToken!,
              username,
              refreshAuthToken: get().refreshAuthToken,
            });

            if (!response.ok) {
              const errorData = await readErrorResponseBody(response);
              return {
                ok: false,
                error: errorData.error || "Failed to create room",
              };
            }

            const data = await response.json();
            if (data.room) {
              // Room will be added via Pusher update, so we don't need to manually add it
              return { ok: true, roomId: data.room.id };
            }

            return { ok: false, error: "Invalid response format" };
          } catch (error) {
            console.error("[ChatsStore] Error creating room:", error);
            return { ok: false, error: "Network error. Please try again." };
          }
        },
        deleteRoom: async (roomId: string) => {
          const username = get().username;
          const authToken = get().authToken;

          if (!username || !authToken) {
            return { ok: false, error: "Authentication required" };
          }

          try {
            const response = await deleteRoomRequest({
              roomId,
              authToken,
              username,
              refreshAuthToken: get().refreshAuthToken,
            });

            if (!response.ok) {
              const errorData = await readErrorResponseBody(response);
              return {
                ok: false,
                error: errorData.error || "Failed to delete room",
              };
            }

            // Room will be removed via Pusher update
            // If we're currently in this room, switch to @ryo
            const currentRoomId = get().currentRoomId;
            if (currentRoomId === roomId) {
              set({ currentRoomId: null });
            }

            return { ok: true };
          } catch (error) {
            console.error("[ChatsStore] Error deleting room:", error);
            return { ok: false, error: "Network error. Please try again." };
          }
        },
        sendMessage: async (roomId: string, content: string) => {
          const username = get().username;
          const authToken = get().authToken;
          const trimmedContent = content.trim();

          if (!username || !trimmedContent) {
            return { ok: false, error: "Username and content required" };
          }

          // Create optimistic message
          const optimisticMessage = createOptimisticChatMessage(
            roomId,
            username,
            trimmedContent
          );

          // Add optimistic message immediately
          get().addMessageToRoom(roomId, optimisticMessage);

          try {
            const response = await sendRoomMessageRequest({
              roomId,
              content: trimmedContent,
              username,
              authToken,
              refreshAuthToken: get().refreshAuthToken,
            });

            if (!response.ok) {
              // Remove optimistic message on failure
              get().removeMessageFromRoom(roomId, optimisticMessage.id);
              const errorData = await readErrorResponseBody(response);
              return {
                ok: false,
                error: errorData.error || "Failed to send message",
              };
            }

            // Real message will be added via Pusher, which will replace the optimistic one
            return { ok: true };
          } catch (error) {
            // Remove optimistic message on failure
            get().removeMessageFromRoom(roomId, optimisticMessage.id);
            console.error("[ChatsStore] Error sending message:", error);
            return { ok: false, error: "Network error. Please try again." };
          }
        },
        createUser: async (username: string, password: string) => {
          const trimmedUsername = username.trim();
          const validationError = validateCreateUserInput({
            username: trimmedUsername,
            password,
          });
          if (validationError) {
            return {
              ok: false,
              error: validationError,
            };
          }

          try {
            const response = await registerUserRequest({
              username: trimmedUsername,
              password,
            });

            if (!response.ok) {
              const errorData = await readErrorResponseBody(response);
              return {
                ok: false,
                error: errorData.error || "Failed to create user",
              };
            }

            const data = await response.json();
            if (data.user) {
              set({ username: data.user.username });

              if (data.token) {
                set({ authToken: data.token });
                saveAuthTokenToRecovery(data.token);
                // Save initial token creation time
                saveTokenRefreshTime(data.user.username);
              }

              // Check password status after user creation
              if (data.token) {
                setTimeout(() => {
                  get().checkHasPassword();
                }, 100); // Small delay to ensure token is set
              }

              // Track user creation analytics
              track(APP_ANALYTICS.USER_CREATE, { username: data.user.username });

              return { ok: true };
            }

            return { ok: false, error: "Invalid response format" };
          } catch (error) {
            console.error("[ChatsStore] Error creating user:", error);
            return { ok: false, error: "Network error. Please try again." };
          }
        },
        incrementUnread: (roomId) => {
          set((state) => ({
            unreadCounts: {
              ...state.unreadCounts,
              [roomId]: (state.unreadCounts[roomId] || 0) + 1,
            },
          }));
        },
        clearUnread: (roomId) => {
          set((state) => {
            const { [roomId]: _removed, ...rest } = state.unreadCounts;
            return { unreadCounts: rest };
          });
        },
        setHasEverUsedChats: (value: boolean) => {
          set({ hasEverUsedChats: value });
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
        hasPassword: state.hasPassword, // Persist password status
        currentRoomId: state.currentRoomId,
        isSidebarVisible: state.isSidebarVisible,
        isChannelsOpen: state.isChannelsOpen,
        isPrivateOpen: state.isPrivateOpen,
        rooms: state.rooms, // Persist rooms list
        roomMessages: buildPersistedRoomMessages(state.roomMessages), // Persist room messages cache (capped)
        fontSize: state.fontSize, // Persist font size
        unreadCounts: state.unreadCounts,
        hasEverUsedChats: state.hasEverUsedChats,
      }),
      migrate: (persistedState, version) =>
        migrateChatsPersistedState<ChatsStoreState>({
          persistedState,
          version,
          storeVersion: STORE_VERSION,
          getInitialState: () => getInitialState() as ChatsStoreState,
        }),
      onRehydrateStorage: createChatsOnRehydrateStorage<ChatsStoreState>,
    }
  )
);
