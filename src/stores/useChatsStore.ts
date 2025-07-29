import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { type Message } from "ai/react";
import { type ChatRoom, type ChatMessage } from "@/types/chat";

// Recovery mechanism - uses different prefix to avoid reset
const USERNAME_RECOVERY_KEY = "_usr_recovery_key_";
const AUTH_TOKEN_RECOVERY_KEY = "_auth_recovery_key_";

// Token constants
const TOKEN_REFRESH_THRESHOLD = 83 * 24 * 60 * 60 * 1000; // 83 days in ms (refresh 7 days before 90-day expiry)
const TOKEN_LAST_REFRESH_KEY = "_token_refresh_time_";

// API Response Types
interface ApiMessage {
  id: string;
  roomId: string;
  username: string;
  content: string;
  timestamp: string | number;
}

interface CreateRoomPayload {
  type: "public" | "private";
  name?: string;
  members?: string[];
}

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

// Save token refresh time
const saveTokenRefreshTime = (username: string) => {
  const key = `${TOKEN_LAST_REFRESH_KEY}${username}`;
  localStorage.setItem(key, Date.now().toString());
};

// Get token refresh time
const getTokenRefreshTime = (username: string): number | null => {
  const key = `${TOKEN_LAST_REFRESH_KEY}${username}`;
  const time = localStorage.getItem(key);
  return time ? parseInt(time, 10) : null;
};

// API request wrapper with automatic token refresh
const makeAuthenticatedRequest = async (
  url: string,
  options: RequestInit,
  refreshToken: () => Promise<{ ok: boolean; error?: string; token?: string }>
): Promise<Response> => {
  const initialResponse = await fetch(url, options);

  // If not 401 or no auth header, return as-is
  if (
    initialResponse.status !== 401 ||
    !options.headers ||
    !("Authorization" in options.headers)
  ) {
    return initialResponse;
  }

  console.log("[ChatsStore] Received 401, attempting token refresh...");

  // Attempt to refresh the token
  const refreshResult = await refreshToken();

  if (!refreshResult.ok || !refreshResult.token) {
    console.log(
      "[ChatsStore] Token refresh failed, returning original 401 response"
    );
    return initialResponse;
  }

  // Retry the request with the new token
  const newHeaders = {
    ...options.headers,
    Authorization: `Bearer ${refreshResult.token}`,
  };

  console.log("[ChatsStore] Retrying request with refreshed token");
  return fetch(url, { ...options, headers: newHeaders });
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
  hasPassword: boolean | null; // Whether user has password set (null = unknown/not checked)
  rooms: ChatRoom[];
  currentRoomId: string | null; // ID of the currently selected room, null for AI chat (@ryo)
  roomMessages: Record<string, ChatMessage[]>; // roomId -> messages map
  unreadCounts: Record<string, number>; // roomId -> unread message count
  hasEverUsedChats: boolean; // Track if user has ever used chat before
  // UI State
  isSidebarVisible: boolean;
  fontSize: number; // Add font size state

  // Actions
  setAiMessages: (messages: Message[]) => void;
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
  setFontSize: (size: number | ((prevSize: number) => number)) => void; // Add font size action
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
    password?: string
  ) => Promise<{ ok: boolean; error?: string }>;

  incrementUnread: (roomId: string) => void;
  clearUnread: (roomId: string) => void;
  setHasEverUsedChats: (value: boolean) => void;

  reset: () => void; // Reset store to initial state
  logout: () => Promise<void>; // Logout and clear all user data
}

const initialAiMessage: Message = {
  id: "1",
  role: "assistant",
  content: "👋 hey! i'm ryo. ask me anything!",
  createdAt: new Date(),
};

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
  | "setFontSize"
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
    aiMessages: [initialAiMessage],
    username: recoveredUsername,
    authToken: recoveredAuthToken,
    hasPassword: null, // Unknown until checked
    rooms: [],
    currentRoomId: null,
    roomMessages: {},
    unreadCounts: {},
    hasEverUsedChats: false,
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
            const response = await fetch(
              "/api/chat-rooms?action=checkPassword",
              {
                method: "GET",
                headers: {
                  Authorization: `Bearer ${currentToken}`,
                  "X-Username": currentUsername,
                },
              }
            );

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
            const response = await fetch("/api/chat-rooms?action=setPassword", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${currentToken}`,
                "X-Username": currentUsername,
              },
              body: JSON.stringify({ password }),
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

            // If this exact server message already exists, skip
            if (existingMessages.some((m) => m.id === message.id)) {
              return {};
            }

            // Look for a matching optimistic (temp) message to replace
            // Use multiple criteria for better matching robustness
            const tempIndex = existingMessages.findIndex(
              (m) => {
                // Must be a temporary message
                if (!m.id.startsWith("temp_")) return false;
                
                // Must be from the same user
                if (m.username !== message.username) return false;
                
                // Check if timestamps are close (within 10 seconds)
                const timeDiff = Math.abs(m.timestamp - message.timestamp);
                if (timeDiff > 10000) return false; // 10 seconds tolerance
                
                // For additional safety, check if content is similar
                // (allows for server-side processing differences)
                const clientContent = m.content.trim().toLowerCase();
                const serverContent = message.content.trim().toLowerCase();
                
                // Either exact match or similar length and shared substring
                if (clientContent === serverContent) return true;
                
                // If lengths are similar and there's significant overlap
                const lengthDiff = Math.abs(clientContent.length - serverContent.length);
                if (lengthDiff <= 10 && clientContent.length > 5) {
                  // Check if one contains most of the other (handles HTML escaping, etc.)
                  const shorterContent = clientContent.length < serverContent.length ? clientContent : serverContent;
                  const longerContent = clientContent.length >= serverContent.length ? clientContent : serverContent;
                  
                  // Remove common HTML entities and spaces for comparison
                  const normalizeForComparison = (str) => str.replace(/[&<>"'\s]/g, '').toLowerCase();
                  const normalizedShorter = normalizeForComparison(shorterContent);
                  const normalizedLonger = normalizeForComparison(longerContent);
                  
                  return normalizedLonger.includes(normalizedShorter) && normalizedShorter.length > 3;
                }
                
                return false;
              }
            );

            if (tempIndex !== -1) {
              const tempMsg = existingMessages[tempIndex];
              const replaced = {
                ...message,
                clientId: tempMsg.clientId || tempMsg.id, // preserve stable client key
              };
              const updated = [...existingMessages];
              updated[tempIndex] = replaced; // replace in place to minimise list churn
              return {
                roomMessages: {
                  ...state.roomMessages,
                  [roomId]: updated.sort((a, b) => a.timestamp - b.timestamp),
                },
              };
            }

            // No optimistic message to replace – append normally
            return {
              roomMessages: {
                ...state.roomMessages,
                [roomId]: [...existingMessages, message].sort(
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
                  ...(currentToken
                    ? {
                        Authorization: `Bearer ${currentToken}`,
                        "X-Username": currentUsername,
                      }
                    : {}),
                },
                body: JSON.stringify({ username: currentUsername }),
              }
            );

            const data = await response.json();

            if (response.ok && data.token) {
              console.log("[ChatsStore] Auth token generated successfully");
              set({ authToken: data.token });
              saveAuthTokenToRecovery(data.token);
              // Save token creation time
              saveTokenRefreshTime(currentUsername);
              return { ok: true };
            } else if (response.status === 401) {
              return { ok: false, error: "Authentication required" };
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
            const response = await fetch(
              "/api/chat-rooms?action=refreshToken",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  username: currentUsername,
                  oldToken: currentToken,
                }),
              }
            );

            if (!response.ok) {
              const errorData = await response.json().catch(() => ({
                error: `HTTP error! status: ${response.status}`,
              }));
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

          const tokenAge = Date.now() - lastRefreshTime;
          const tokenAgeDays = Math.floor(tokenAge / (24 * 60 * 60 * 1000));

          console.log(`[ChatsStore] Token age: ${tokenAgeDays} days`);

          // If token is older than threshold, refresh it
          if (tokenAge > TOKEN_REFRESH_THRESHOLD) {
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
            console.log(
              `[ChatsStore] Token is ${tokenAgeDays} days old, next refresh in ${
                83 - tokenAgeDays
              } days`
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
              await fetch("/api/chat-rooms?action=logoutCurrent", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${currentToken}`,
                  "X-Username": currentUsername,
                },
                body: JSON.stringify({}),
              });
            } catch (err) {
              console.warn(
                "[ChatsStore] Failed to notify server during logout:",
                err
              );
            }
          }

          // Clear recovery keys from localStorage
          localStorage.removeItem(USERNAME_RECOVERY_KEY);
          localStorage.removeItem(AUTH_TOKEN_RECOVERY_KEY);

          // Clear token refresh time for current user
          if (currentUsername) {
            const tokenRefreshKey = `${TOKEN_LAST_REFRESH_KEY}${currentUsername}`;
            localStorage.removeItem(tokenRefreshKey);
          }

          // Reset only user-specific data, preserve rooms and messages
          set((state) => ({
            ...state,
            aiMessages: [initialAiMessage],
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
          const currentUsername = get().username;

          try {
            const queryParams = new URLSearchParams({ action: "getRooms" });
            if (currentUsername) {
              queryParams.append("username", currentUsername);
            }

            const response = await fetch(
              `/api/chat-rooms?${queryParams.toString()}`
            );
            if (!response.ok) {
              const errorData = await response.json().catch(() => ({
                error: `HTTP error! status: ${response.status}`,
              }));
              return {
                ok: false,
                error: errorData.error || "Failed to fetch rooms",
              };
            }

            const data = await response.json();
            if (data.rooms && Array.isArray(data.rooms)) {
              set({ rooms: data.rooms });
              return { ok: true };
            }

            return { ok: false, error: "Invalid response format" };
          } catch (error) {
            console.error("[ChatsStore] Error fetching rooms:", error);
            return { ok: false, error: "Network error. Please try again." };
          }
        },
        fetchMessagesForRoom: async (roomId: string) => {
          if (!roomId) return { ok: false, error: "Room ID required" };

          console.log(`[ChatsStore] Fetching messages for room ${roomId}...`);

          try {
            const queryParams = new URLSearchParams({
              action: "getMessages",
              roomId,
            });

            const response = await fetch(
              `/api/chat-rooms?${queryParams.toString()}`
            );
            if (!response.ok) {
              const errorData = await response.json().catch(() => ({
                error: `HTTP error! status: ${response.status}`,
              }));
              return {
                ok: false,
                error: errorData.error || "Failed to fetch messages",
              };
            }

            const data = await response.json();
            if (data.messages) {
              const fetchedMessages: ChatMessage[] = (data.messages || [])
                .map((msg: ApiMessage) => ({
                  ...msg,
                  timestamp:
                    typeof msg.timestamp === "string" ||
                    typeof msg.timestamp === "number"
                      ? new Date(msg.timestamp).getTime()
                      : msg.timestamp,
                }))
                .sort(
                  (a: ChatMessage, b: ChatMessage) => a.timestamp - b.timestamp
                );

              set((state) => ({
                roomMessages: {
                  ...state.roomMessages,
                  [roomId]: fetchedMessages,
                },
              }));

              return { ok: true };
            }

            return { ok: false, error: "Invalid response format" };
          } catch (error) {
            console.error(
              `[ChatsStore] Error fetching messages for room ${roomId}:`,
              error
            );
            return { ok: false, error: "Network error. Please try again." };
          }
        },
        fetchBulkMessages: async (roomIds: string[]) => {
          if (roomIds.length === 0)
            return { ok: false, error: "Room IDs required" };

          console.log(
            `[ChatsStore] Fetching messages for rooms: ${roomIds.join(", ")}...`
          );

          try {
            const queryParams = new URLSearchParams({
              action: "getBulkMessages",
              roomIds: roomIds.join(","),
            });

            const response = await fetch(
              `/api/chat-rooms?${queryParams.toString()}`
            );
            if (!response.ok) {
              const errorData = await response.json().catch(() => ({
                error: `HTTP error! status: ${response.status}`,
              }));
              return {
                ok: false,
                error: errorData.error || "Failed to fetch messages",
              };
            }

            const data = await response.json();
            if (data.messagesMap) {
              // Process and sort messages for each room like fetchMessagesForRoom does
              const processedMessagesMap: Record<string, ChatMessage[]> = {};

              Object.entries(data.messagesMap).forEach(([roomId, messages]) => {
                const processedMessages: ChatMessage[] = (
                  messages as ApiMessage[]
                )
                  .map((msg: ApiMessage) => ({
                    ...msg,
                    timestamp:
                      typeof msg.timestamp === "string" ||
                      typeof msg.timestamp === "number"
                        ? new Date(msg.timestamp).getTime()
                        : msg.timestamp,
                  }))
                  .sort(
                    (a: ChatMessage, b: ChatMessage) =>
                      a.timestamp - b.timestamp
                  );

                processedMessagesMap[roomId] = processedMessages;
              });

              set((state) => ({
                roomMessages: {
                  ...state.roomMessages,
                  ...processedMessagesMap,
                },
              }));

              return { ok: true };
            }

            return { ok: false, error: "Invalid response format" };
          } catch (error) {
            console.error(
              `[ChatsStore] Error fetching messages for rooms ${roomIds.join(
                ", "
              )}:`,
              error
            );
            return { ok: false, error: "Network error. Please try again." };
          }
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
              const response = await fetch(
                "/api/chat-rooms?action=switchRoom",
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    previousRoomId: currentRoomId,
                    nextRoomId: newRoomId,
                    username,
                  }),
                }
              );

              if (!response.ok) {
                const errorData = await response.json().catch(() => ({
                  error: `HTTP error! status: ${response.status}`,
                }));
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
            const payload: CreateRoomPayload = { type };
            if (type === "public") {
              payload.name = name.trim();
            } else {
              payload.members = members;
            }

            const headers: HeadersInit = {
              "Content-Type": "application/json",
              Authorization: `Bearer ${get().authToken}`,
              "X-Username": username,
            };

            const response = await makeAuthenticatedRequest(
              "/api/chat-rooms?action=createRoom",
              {
                method: "POST",
                headers,
                body: JSON.stringify(payload),
              },
              get().refreshAuthToken
            );

            if (!response.ok) {
              const errorData = await response.json().catch(() => ({
                error: `HTTP error! status: ${response.status}`,
              }));
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
            const headers: HeadersInit = {
              "Content-Type": "application/json",
              Authorization: `Bearer ${authToken}`,
              "X-Username": username,
            };

            const response = await makeAuthenticatedRequest(
              `/api/chat-rooms?action=deleteRoom&roomId=${roomId}`,
              {
                method: "DELETE",
                headers,
              },
              get().refreshAuthToken
            );

            if (!response.ok) {
              const errorData = await response.json().catch(() => ({
                error: `HTTP error! status: ${response.status}`,
              }));
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

          if (!username || !content.trim()) {
            return { ok: false, error: "Username and content required" };
          }

          // Create optimistic message
          const tempId = `temp_${Math.random().toString(36).substring(2, 9)}`;
          const optimisticMessage: ChatMessage = {
            id: tempId,
            clientId: tempId,
            roomId,
            username,
            content: content.trim(),
            timestamp: Date.now(),
          };

          // Add optimistic message immediately
          get().addMessageToRoom(roomId, optimisticMessage);

          try {
            const headers: HeadersInit = {
              "Content-Type": "application/json",
            };

            if (authToken) {
              headers["Authorization"] = `Bearer ${authToken}`;
              headers["X-Username"] = username;
            }

            const response = authToken
              ? await makeAuthenticatedRequest(
                  "/api/chat-rooms?action=sendMessage",
                  {
                    method: "POST",
                    headers,
                    body: JSON.stringify({
                      roomId,
                      username,
                      content: content.trim(),
                    }),
                  },
                  get().refreshAuthToken
                )
              : await fetch("/api/chat-rooms?action=sendMessage", {
                  method: "POST",
                  headers,
                  body: JSON.stringify({
                    roomId,
                    username,
                    content: content.trim(),
                  }),
                });

            if (!response.ok) {
              // Remove optimistic message on failure
              get().removeMessageFromRoom(roomId, tempId);
              const errorData = await response.json().catch(() => ({
                error: `HTTP error! status: ${response.status}`,
              }));
              return {
                ok: false,
                error: errorData.error || "Failed to send message",
              };
            }

            // Real message will be added via Pusher, which will replace the optimistic one
            return { ok: true };
          } catch (error) {
            // Remove optimistic message on failure
            get().removeMessageFromRoom(roomId, tempId);
            console.error("[ChatsStore] Error sending message:", error);
            return { ok: false, error: "Network error. Please try again." };
          }
        },
        createUser: async (username: string, password?: string) => {
          const trimmedUsername = username.trim();
          if (!trimmedUsername) {
            return { ok: false, error: "Username cannot be empty" };
          }

          try {
            const response = await fetch("/api/chat-rooms?action=createUser", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ username: trimmedUsername, password }),
            });

            if (!response.ok) {
              const errorData = await response.json().catch(() => ({
                error: `HTTP error! status: ${response.status}`,
              }));
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
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
        rooms: state.rooms, // Persist rooms list
        roomMessages: state.roomMessages, // Persist room messages cache
        fontSize: state.fontSize, // Persist font size
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
