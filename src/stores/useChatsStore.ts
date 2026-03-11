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
import { getApiUrl } from "@/utils/platform";
import { abortableFetch } from "@/utils/abortableFetch";
import { COOKIE_SESSION_MARKER, isRealToken } from "@/api/core";
import {
  getBulkMessages as getBulkMessagesApi,
  getRoomMessages as getRoomMessagesApi,
  listRooms as listRoomsApi,
  switchPresence as switchPresenceApi,
} from "@/api/rooms";

// Username recovery - plain text, username is public info
const USERNAME_RECOVERY_KEY = "_usr_recovery_key_";
// Legacy key kept only so we can clean it up during migration
const LEGACY_AUTH_TOKEN_RECOVERY_KEY = "_auth_recovery_key_";

// Token constants
const TOKEN_REFRESH_THRESHOLD = 83 * 24 * 60 * 60 * 1000; // 83 days in ms (refresh 7 days before 90-day expiry)
const TOKEN_LAST_REFRESH_KEY = "_token_refresh_time_";
const MESSAGE_HISTORY_CAP = 500;

const capRoomMessages = (messages: ChatMessage[]): ChatMessage[] =>
  messages.slice(-MESSAGE_HISTORY_CAP);

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

// Username recovery: plain-text localStorage (username is not secret)
const saveUsernameToRecovery = (username: string | null) => {
  if (username) {
    localStorage.setItem(USERNAME_RECOVERY_KEY, username);
  }
};

const getUsernameFromRecovery = (): string | null => {
  const raw = localStorage.getItem(USERNAME_RECOVERY_KEY);
  if (!raw) return null;
  // Attempt to decode legacy btoa-encoded values
  try {
    const maybeDecoded = atob(raw).split("").reverse().join("");
    if (/^[a-z0-9_-]+$/i.test(maybeDecoded)) return maybeDecoded;
  } catch {
    // Not base64 — treat as plain-text
  }
  return raw;
};

/**
 * Remove any legacy auth-token recovery data from localStorage.
 * Auth tokens are now stored exclusively in httpOnly cookies.
 */
const clearLegacyTokenRecovery = () => {
  localStorage.removeItem(LEGACY_AUTH_TOKEN_RECOVERY_KEY);
};

/**
 * Read (and consume) a legacy btoa-encoded auth token from localStorage.
 * Returns the plain-text token if one existed, or null.
 */
const consumeLegacyAuthToken = (): string | null => {
  const encoded = localStorage.getItem(LEGACY_AUTH_TOKEN_RECOVERY_KEY);
  if (!encoded) return null;
  localStorage.removeItem(LEGACY_AUTH_TOKEN_RECOVERY_KEY);
  try {
    return atob(encoded).split("").reverse().join("");
  } catch {
    return null;
  }
};

/**
 * Build auth headers when an in-memory token is available.
 * When token is null or the cookie-session marker, the caller relies
 * on the httpOnly cookie (sent automatically via `credentials: "include"`).
 */
const buildOptionalAuthHeaders = (
  username: string | null,
  token: string | null
): Record<string, string> => {
  const headers: Record<string, string> = {};
  if (isRealToken(token) && username) {
    headers["Authorization"] = `Bearer ${token}`;
    headers["X-Username"] = username;
  }
  return headers;
};

// Basic HTML entity decoder to normalize server-escaped message content
const decodeHtmlEntities = (str: string): string =>
  str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");

const API_UNAVAILABLE_COOLDOWN_MS = 10_000;
const apiUnavailableUntil: Record<string, number> = {};

const isApiTemporarilyUnavailable = (key: string): boolean =>
  Date.now() < (apiUnavailableUntil[key] || 0);

const markApiTemporarilyUnavailable = (key: string): void => {
  apiUnavailableUntil[key] = Date.now() + API_UNAVAILABLE_COOLDOWN_MS;
};

const clearApiUnavailable = (key: string): void => {
  delete apiUnavailableUntil[key];
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

// API request wrapper with automatic token refresh.
// Works with Authorization header (in-memory token) or httpOnly cookie.
const makeAuthenticatedRequest = async (
  url: string,
  options: RequestInit,
  refreshToken: () => Promise<{ ok: boolean; error?: string; token?: string }>
): Promise<Response> => {
  const initialResponse = await abortableFetch(url, {
    ...options,
    timeout: 15000,
    throwOnHttpError: false,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });

  if (initialResponse.status !== 401) {
    return initialResponse;
  }

  console.log("[ChatsStore] Received 401, attempting token refresh...");

  const refreshResult = await refreshToken();

  if (!refreshResult.ok) {
    console.log(
      "[ChatsStore] Token refresh failed — forcing logout"
    );
    forceLogoutOnUnauthorized();
    return initialResponse;
  }

  // Build new headers — if we got a token back, send it explicitly;
  // otherwise rely on the updated httpOnly cookie set by the refresh endpoint.
  const newHeaders: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (refreshResult.token) {
    newHeaders["Authorization"] = `Bearer ${refreshResult.token}`;
  }

  console.log("[ChatsStore] Retrying request with refreshed token");
  return abortableFetch(url, {
    ...options,
    headers: newHeaders,
    timeout: 15000,
    throwOnHttpError: false,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });
};

/**
 * Clear auth state without making API calls (which could 401 again).
 * Used when an authenticated request + refresh both fail with 401,
 * indicating the session is definitively invalid.
 */
function forceLogoutOnUnauthorized() {
  const store = useChatsStore.getState();
  if (!store.username) return;
  console.log("[ChatsStore] Unauthorized — clearing auth state for", store.username);
  localStorage.removeItem(USERNAME_RECOVERY_KEY);
  clearLegacyTokenRecovery();
  useChatsStore.setState({
    username: null,
    authToken: null,
    hasPassword: null,
    currentRoomId: null,
  });
}

// Ensure username recovery key is set if username exists but recovery key doesn't.
// NOTE: Do NOT call clearLegacyTokenRecovery() here — this runs during store
// initialization (before rehydration) and would destroy the legacy token before
// onRehydrateStorage can consume it for migration.
const ensureUsernameRecovery = (username: string | null) => {
  if (username && !localStorage.getItem(USERNAME_RECOVERY_KEY)) {
    console.log(
      "[ChatsStore] Setting recovery key for existing username:",
      username
    );
    saveUsernameToRecovery(username);
  }
};

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

const GREETING_FALLBACK = "👋 hey! i'm ryo. ask me anything!";

const getInitialAiMessage = (): AIChatMessage => ({
  id: "1",
  role: "assistant",
  parts: [{ type: "text" as const, text: i18n.t("apps.chats.messages.greeting") || GREETING_FALLBACK }],
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
  // Recover username from localStorage (auth token lives in httpOnly cookie)
  const recoveredUsername = getUsernameFromRecovery();

  return {
    aiMessages: [getInitialAiMessage()],
    username: recoveredUsername,
    authToken: null,
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

const STORE_VERSION = 3;
const STORE_NAME = "ryos:chats";

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
        setAiMessages: (messages) => set({ aiMessages: messages }),
        setUsername: (username) => {
          saveUsernameToRecovery(username);
          set({ username });

          // Check password status when username changes (if we have auth — either token or cookie)
          if (username) {
            setTimeout(() => {
              get().checkHasPassword();
            }, 100);
          } else {
            set({ hasPassword: null });
          }
        },
        setAuthToken: (token) => {
          // Token is kept in memory only (httpOnly cookie handles persistence)
          set({ authToken: token });
        },
        setHasPassword: (hasPassword) => {
          set({ hasPassword });
        },
        checkHasPassword: async () => {
          const currentUsername = get().username;
          const currentToken = get().authToken;

          if (!currentUsername) {
            console.log(
              "[ChatsStore] checkHasPassword: No username, setting null"
            );
            set({ hasPassword: null });
            return { ok: false, error: "Authentication required" };
          }

          console.log(
            "[ChatsStore] checkHasPassword: Checking for user",
            currentUsername
          );
          try {
            const response = await abortableFetch(
              "/api/auth/password/check",
              {
                method: "GET",
                headers: buildOptionalAuthHeaders(currentUsername, currentToken),
                timeout: 15000,
                throwOnHttpError: false,
                retry: { maxAttempts: 1, initialDelayMs: 250 },
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

          if (!currentUsername) {
            return { ok: false, error: "Authentication required" };
          }

          try {
            const response = await abortableFetch(
              getApiUrl("/api/auth/password/set"),
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  ...buildOptionalAuthHeaders(currentUsername, currentToken),
                },
                body: JSON.stringify({ password }),
                timeout: 15000,
                throwOnHttpError: false,
                retry: { maxAttempts: 1, initialDelayMs: 250 },
              }
            );

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
          // Apply stable sort to keep UI order consistent (public first, then name, then id)
          const sortedNewRooms = [...newRooms].sort((a, b) => {
            const ao = a.type === "private" ? 1 : 0;
            const bo = b.type === "private" ? 1 : 0;
            if (ao !== bo) return ao - bo;
            const an = (a.name || "").toLowerCase();
            const bn = (b.name || "").toLowerCase();
            if (an !== bn) return an.localeCompare(bn);
            return a.id.localeCompare(b.id);
          });

          if (JSON.stringify(currentRooms) === JSON.stringify(sortedNewRooms)) {
            console.log(
              "[ChatsStore] setRooms skipped: newRooms are identical to current rooms."
            );
            return; // Skip update if rooms haven't actually changed
          }

          console.log("[ChatsStore] setRooms called. Updating rooms.");
          set({ rooms: sortedNewRooms });
        },
        setCurrentRoomId: (roomId) => set({ currentRoomId: roomId }),
        setRoomMessagesForCurrentRoom: (messages) => {
          const currentRoomId = get().currentRoomId;
          if (currentRoomId) {
            const sorted = [...messages].sort(
              (a, b) => a.timestamp - b.timestamp
            );
            set((state) => ({
              roomMessages: {
                ...state.roomMessages,
                [currentRoomId]: capRoomMessages(sorted),
              },
            }));
          }
        },
        addMessageToRoom: (roomId, message) => {
          set((state) => {
            const existingMessages = state.roomMessages[roomId] || [];
            const sortAndCap = (messages: ChatMessage[]) =>
              capRoomMessages(
                [...messages].sort((a, b) => a.timestamp - b.timestamp)
              );

            // Normalize incoming content to match optimistic content
            const incomingContent = decodeHtmlEntities(
              String((message as unknown as { content?: string }).content || "")
            );
            const incoming: ChatMessage = {
              ...(message as ChatMessage),
              content: incomingContent,
            };

            // If this exact server message already exists, skip
            if (existingMessages.some((m) => m.id === incoming.id)) {
              return {};
            }

            // Prefer replacing by clientId when provided by the server
            const incomingClientId = (incoming as Partial<ChatMessage>)
              .clientId as string | undefined;
            if (incomingClientId) {
              const idxByClientId = existingMessages.findIndex(
                (m) =>
                  m.id === incomingClientId || m.clientId === incomingClientId
              );
              if (idxByClientId !== -1) {
                const tempMsg = existingMessages[idxByClientId];
                const replaced = {
                  ...incoming,
                  clientId: tempMsg.clientId || tempMsg.id,
                } as ChatMessage;
                const updated = [...existingMessages];
                updated[idxByClientId] = replaced;
                return {
                  roomMessages: {
                    ...state.roomMessages,
                    [roomId]: sortAndCap(updated),
                  },
                };
              }
            }

            // Fallback: replace a temp message by matching username + content (decoded)
            const tempIndex = existingMessages.findIndex(
              (m) =>
                m.id.startsWith("temp_") &&
                m.username === incoming.username &&
                m.content === incoming.content
            );

            if (tempIndex !== -1) {
              const tempMsg = existingMessages[tempIndex];
              const replaced = {
                ...incoming,
                clientId: tempMsg.clientId || tempMsg.id, // preserve stable client key
              } as ChatMessage;
              const updated = [...existingMessages];
              updated[tempIndex] = replaced; // replace in place to minimise list churn
              return {
                roomMessages: {
                  ...state.roomMessages,
                  [roomId]: sortAndCap(updated),
                },
              };
            }

            // Second fallback: replace the most recent temp message from same user within time window
            // This handles cases where server sanitizes content (e.g., profanity filter) so content differs
            const WINDOW_MS = 5000; // 5s safety window
            const incomingTs = Number(
              (incoming as unknown as { timestamp: number }).timestamp
            );
            const candidateIndexes: number[] = [];
            existingMessages.forEach((m, idx) => {
              if (
                m.id.startsWith("temp_") &&
                m.username === incoming.username
              ) {
                const dt = Math.abs(Number(m.timestamp) - incomingTs);
                if (Number.isFinite(dt) && dt <= WINDOW_MS)
                  candidateIndexes.push(idx);
              }
            });
            if (candidateIndexes.length > 0) {
              // Choose the closest in time
              let bestIdx = candidateIndexes[0];
              let bestDt = Math.abs(
                Number(existingMessages[bestIdx].timestamp) - incomingTs
              );
              for (let i = 1; i < candidateIndexes.length; i++) {
                const idx = candidateIndexes[i];
                const dt = Math.abs(
                  Number(existingMessages[idx].timestamp) - incomingTs
                );
                if (dt < bestDt) {
                  bestIdx = idx;
                  bestDt = dt;
                }
              }
              const tempMsg = existingMessages[bestIdx];
              const replaced = {
                ...incoming,
                clientId: tempMsg.clientId || tempMsg.id,
              } as ChatMessage;
              const updated = [...existingMessages];
              updated[bestIdx] = replaced;
              return {
                roomMessages: {
                  ...state.roomMessages,
                  [roomId]: sortAndCap(updated),
                },
              };
            }

            // No optimistic message to replace – append normally
            return {
              roomMessages: {
                ...state.roomMessages,
                [roomId]: sortAndCap([...existingMessages, incoming]),
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

          if (!currentUsername) {
            console.log(
              "[ChatsStore] No username set, skipping token generation"
            );
            return { ok: true };
          }

          if (currentToken) {
            return { ok: true };
          }

          // No in-memory token but we have a username — the httpOnly cookie
          // may be providing auth. Allow the request to proceed; the server
          // will read the cookie via `credentials: "include"`.
          console.log(
            "[ChatsStore] No in-memory token; relying on httpOnly cookie for user:",
            currentUsername
          );
          return { ok: true };
        },
        refreshAuthToken: async () => {
          const currentUsername = get().username;
          const currentToken = get().authToken;

          if (!currentUsername) {
            console.log("[ChatsStore] No username set, skipping token refresh");
            return { ok: false, error: "Username required" };
          }

          console.log(
            "[ChatsStore] Refreshing auth token for existing user:",
            currentUsername
          );

          try {
            // When we have a real in-memory token, send it in the body.
            // Otherwise, the httpOnly cookie provides the old token.
            const body: Record<string, string> = { username: currentUsername };
            if (isRealToken(currentToken)) {
              body.oldToken = currentToken;
            }

            const response = await abortableFetch(
              "/api/auth/token/refresh",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
                timeout: 15000,
                throwOnHttpError: false,
                retry: { maxAttempts: 1, initialDelayMs: 250 },
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
              "[ChatsStore] No username or auth state, skipping token check"
            );
            return { refreshed: false };
          }

          // Cookie-only sessions rely on the server refreshing the cookie
          // during /api/auth/session. No client-side refresh needed.
          if (!isRealToken(currentToken)) {
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
          const currentUsername = get().username;
          if (currentUsername) {
            saveUsernameToRecovery(currentUsername);
          }
          set(getInitialState());
        },
        logout: async () => {
          console.log("[ChatsStore] Logging out user...");

          const currentUsername = get().username;
          const currentToken = get().authToken;

          // Inform server to invalidate token (and clear httpOnly cookie).
          // Works via Authorization header or cookie.
          if (currentUsername) {
            try {
              await abortableFetch(getApiUrl("/api/auth/logout"), {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  ...buildOptionalAuthHeaders(currentUsername, currentToken),
                },
                timeout: 15000,
                throwOnHttpError: false,
                retry: { maxAttempts: 1, initialDelayMs: 250 },
              });
            } catch (err) {
              console.warn(
                "[ChatsStore] Failed to notify server during logout:",
                err
              );
            }
          }

          if (currentUsername) {
            track(APP_ANALYTICS.USER_LOGOUT, { username: currentUsername });
          }

          // Clear recovery keys from localStorage
          localStorage.removeItem(USERNAME_RECOVERY_KEY);
          clearLegacyTokenRecovery();

          if (currentUsername) {
            const tokenRefreshKey = `${TOKEN_LAST_REFRESH_KEY}${currentUsername}`;
            localStorage.removeItem(tokenRefreshKey);
          }

          set((state) => ({
            ...state,
            aiMessages: [getInitialAiMessage()],
            username: null,
            authToken: null,
            hasPassword: null,
            currentRoomId: null,
          }));

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
          if (isApiTemporarilyUnavailable("rooms")) {
            return { ok: false, error: "Rooms API temporarily unavailable" };
          }
          const currentUsername = get().username;
          const currentToken = get().authToken;

          try {
            const data = await listRoomsApi(
              currentUsername && currentToken
                ? {
                    username: currentUsername,
                    token: currentToken,
                  }
                : undefined
            );
            if (data.rooms && Array.isArray(data.rooms)) {
              clearApiUnavailable("rooms");
              // Normalize ordering via setRooms to enforce alphabetical sections
              get().setRooms(data.rooms);
              return { ok: true };
            }

            return { ok: false, error: "Invalid response format" };
          } catch (error) {
            console.error("[ChatsStore] Error fetching rooms:", error);
            markApiTemporarilyUnavailable("rooms");
            return {
              ok: false,
              error:
                error instanceof Error
                  ? error.message
                  : "Network error. Please try again.",
            };
          }
        },
        fetchMessagesForRoom: async (roomId: string) => {
          if (!roomId) return { ok: false, error: "Room ID required" };

          console.log(`[ChatsStore] Fetching messages for room ${roomId}...`);
          if (isApiTemporarilyUnavailable("room-messages")) {
            return { ok: false, error: "Messages API temporarily unavailable" };
          }

          try {
            const username = get().username;
            const authToken = get().authToken;
            const data = await getRoomMessagesApi(
              roomId,
              username && authToken
                ? {
                    username,
                    token: authToken,
                  }
                : undefined
            );
            if (data.messages) {
              clearApiUnavailable("room-messages");
              const fetchedMessages: ChatMessage[] = (data.messages || [])
                .map((msg: ApiMessage) => ({
                  ...msg,
                  content: decodeHtmlEntities(String(msg.content || "")),
                  timestamp:
                    typeof msg.timestamp === "string" ||
                    typeof msg.timestamp === "number"
                      ? new Date(msg.timestamp).getTime()
                      : msg.timestamp,
                }))
                .sort(
                  (a: ChatMessage, b: ChatMessage) => a.timestamp - b.timestamp
                );

              // Merge with any existing messages to avoid race conditions with realtime pushes
              set((state) => {
                const existing = state.roomMessages[roomId] || [];
                const byId = new Map<string, ChatMessage>();
                
                // Collect temp (optimistic) messages separately for deduplication
                // Only messages with temp_ prefix IDs are considered optimistic
                const tempMessages: ChatMessage[] = [];
                for (const m of existing) {
                  if (m.id.startsWith("temp_")) {
                    tempMessages.push(m);
                  } else {
                    byId.set(m.id, m);
                  }
                }
                
                // Overlay fetched server messages
                for (const m of fetchedMessages) {
                  const prev = byId.get(m.id);
                  if (prev && prev.clientId) {
                    byId.set(m.id, { ...m, clientId: prev.clientId });
                  } else {
                    byId.set(m.id, m);
                  }
                }
                
                // Auto-delete temp messages that match server messages by clientId, or by username + content + time window
                const MATCH_WINDOW_MS = 10000; // 10 second window
                const usedTempIds = new Set<string>();
                
                for (const temp of tempMessages) {
                  const tempClientId = temp.clientId || temp.id;
                  let matched = false;
                  
                  // Check if any server message matches this temp message
                  for (const serverMsg of fetchedMessages) {
                    // Match by clientId if the server echoes it back
                    const serverClientId = (serverMsg as ChatMessage & { clientId?: string }).clientId;
                    if (serverClientId && serverClientId === tempClientId) {
                      // Server message has matching clientId - associate and skip temp
                      byId.set(serverMsg.id, { ...byId.get(serverMsg.id)!, clientId: tempClientId });
                      matched = true;
                      break;
                    }
                    
                    // Match by username + content + time window
                    if (
                      serverMsg.username === temp.username &&
                      serverMsg.content === temp.content &&
                      Math.abs(serverMsg.timestamp - temp.timestamp) <= MATCH_WINDOW_MS
                    ) {
                      // Found matching server message - preserve clientId on it
                      byId.set(serverMsg.id, { ...byId.get(serverMsg.id)!, clientId: tempClientId });
                      matched = true;
                      break;
                    }
                  }
                  
                  // If no match found, keep the temp message (might still be in flight)
                  if (!matched && !usedTempIds.has(temp.id)) {
                    byId.set(temp.id, temp);
                    usedTempIds.add(temp.id);
                  }
                }
                
                const merged = capRoomMessages(
                  Array.from(byId.values()).sort(
                    (a, b) => a.timestamp - b.timestamp
                  )
                );
                return {
                  roomMessages: {
                    ...state.roomMessages,
                    [roomId]: merged,
                  },
                };
              });

              return { ok: true };
            }

            return { ok: false, error: "Invalid response format" };
          } catch (error) {
            console.error(
              `[ChatsStore] Error fetching messages for room ${roomId}:`,
              error
            );
            markApiTemporarilyUnavailable("room-messages");
            return {
              ok: false,
              error:
                error instanceof Error
                  ? error.message
                  : "Network error. Please try again.",
            };
          }
        },
        fetchBulkMessages: async (roomIds: string[]) => {
          if (roomIds.length === 0)
            return { ok: false, error: "Room IDs required" };

          console.log(
            `[ChatsStore] Fetching messages for rooms: ${roomIds.join(", ")}...`
          );
          if (isApiTemporarilyUnavailable("bulk-messages")) {
            return { ok: false, error: "Bulk messages API temporarily unavailable" };
          }

          try {
            const username = get().username;
            const authToken = get().authToken;
            const data = await getBulkMessagesApi(
              roomIds,
              username && authToken
                ? {
                    username,
                    token: authToken,
                  }
                : undefined
            );
            const messagesMap = data.messagesMap;
            if (messagesMap) {
              clearApiUnavailable("bulk-messages");
              // Process and sort messages for each room like fetchMessagesForRoom does
              set((state) => {
                const nextRoomMessages = { ...state.roomMessages };

                Object.entries(messagesMap).forEach(
                  ([roomId, messages]) => {
                    const processed: ChatMessage[] = (messages as ApiMessage[])
                      .map((msg) => ({
                        ...msg,
                        content: decodeHtmlEntities(String(msg.content || "")),
                        timestamp:
                          typeof msg.timestamp === "string" ||
                          typeof msg.timestamp === "number"
                            ? new Date(msg.timestamp).getTime()
                            : msg.timestamp,
                      }))
                      .sort((a, b) => a.timestamp - b.timestamp);

                    const existing = nextRoomMessages[roomId] || [];
                    const byId = new Map<string, ChatMessage>();
                    
                    // Collect temp (optimistic) messages separately for deduplication
                    // Only messages with temp_ prefix IDs are considered optimistic
                    const tempMessages: ChatMessage[] = [];
                    for (const m of existing) {
                      if (m.id.startsWith("temp_")) {
                        tempMessages.push(m);
                      } else {
                        byId.set(m.id, m);
                      }
                    }
                    
                    // Overlay fetched server messages
                    for (const m of processed) {
                      const prev = byId.get(m.id);
                      if (prev && prev.clientId) {
                        byId.set(m.id, { ...m, clientId: prev.clientId });
                      } else {
                        byId.set(m.id, m);
                      }
                    }
                    
                    // Auto-delete temp messages that match server messages
                    const MATCH_WINDOW_MS = 10000;
                    const usedTempIds = new Set<string>();
                    
                    for (const temp of tempMessages) {
                      const tempClientId = temp.clientId || temp.id;
                      let matched = false;
                      
                      for (const serverMsg of processed) {
                        const serverClientId = (serverMsg as ChatMessage & { clientId?: string }).clientId;
                        if (serverClientId && serverClientId === tempClientId) {
                          byId.set(serverMsg.id, { ...byId.get(serverMsg.id)!, clientId: tempClientId });
                          matched = true;
                          break;
                        }
                        
                        if (
                          serverMsg.username === temp.username &&
                          serverMsg.content === temp.content &&
                          Math.abs(serverMsg.timestamp - temp.timestamp) <= MATCH_WINDOW_MS
                        ) {
                          byId.set(serverMsg.id, { ...byId.get(serverMsg.id)!, clientId: tempClientId });
                          matched = true;
                          break;
                        }
                      }
                      
                      if (!matched && !usedTempIds.has(temp.id)) {
                        byId.set(temp.id, temp);
                        usedTempIds.add(temp.id);
                      }
                    }
                    
                    nextRoomMessages[roomId] = capRoomMessages(
                      Array.from(byId.values()).sort(
                        (a, b) => a.timestamp - b.timestamp
                      )
                    );
                  }
                );

                return { roomMessages: nextRoomMessages };
              });

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
            markApiTemporarilyUnavailable("bulk-messages");
            return {
              ok: false,
              error:
                error instanceof Error
                  ? error.message
                  : "Network error. Please try again.",
            };
          }
        },
        switchRoom: async (newRoomId: string | null) => {
          const currentRoomId = get().currentRoomId;
          const username = get().username;
          const authToken = get().authToken;

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
          if (username && authToken) {
            try {
              await switchPresenceApi(
                {
                  previousRoomId: currentRoomId,
                  nextRoomId: newRoomId,
                },
                {
                  username,
                  token: authToken,
                }
              );

              console.log("[ChatsStore] Room switch API call successful");
              // Immediately refresh rooms to show updated presence counts
              // This ensures the UI reflects the change immediately rather than waiting for Pusher
              setTimeout(() => {
                console.log("[ChatsStore] Refreshing rooms after switch");
                get().fetchRooms();
              }, 50); // Small delay to let the server finish processing
            } catch (error) {
              console.error(
                "[ChatsStore] Error switching rooms:",
                error
              );
              // Don't revert the room change on network error, just log it
            }
          } else if (username && !authToken) {
            console.warn(
              "[ChatsStore] Skipping presence switch API call due to missing auth token"
            );
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

          if (!username) {
            return { ok: false, error: "Username required" };
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
              ...buildOptionalAuthHeaders(username, get().authToken),
            };

            const response = await makeAuthenticatedRequest(
              "/api/rooms",
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

          if (!username) {
            return { ok: false, error: "Authentication required" };
          }

          try {
            const headers: HeadersInit = {
              "Content-Type": "application/json",
              ...buildOptionalAuthHeaders(username, get().authToken),
            };

            const response = await makeAuthenticatedRequest(
              `/api/rooms/${encodeURIComponent(roomId)}`,
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
              ...buildOptionalAuthHeaders(username, authToken),
            };

            const messageUrl = `/api/rooms/${encodeURIComponent(roomId)}/messages`;
            const messageBody = JSON.stringify({
              content: content.trim(),
            });

            const response = await makeAuthenticatedRequest(
              messageUrl,
              {
                method: "POST",
                headers,
                body: messageBody,
              },
              get().refreshAuthToken
            );

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
        createUser: async (username: string, password: string) => {
          const trimmedUsername = username.trim();
          if (!trimmedUsername) {
            return { ok: false, error: "Username cannot be empty" };
          }

          // Client-side validation mirroring server rules to provide instant feedback
          const isValid = /^[a-z](?:[a-z0-9]|[-_](?=[a-z0-9])){2,29}$/i.test(
            trimmedUsername
          );
          if (!isValid) {
            return {
              ok: false,
              error:
                "Invalid username: use 3-30 letters/numbers; '-' or '_' allowed between characters; no spaces or symbols",
            };
          }

          // Require password client-side and enforce minimum length consistent with server
          if (!password || password.trim().length === 0) {
            return { ok: false, error: "Password is required" };
          }
          const PASSWORD_MIN_LENGTH = 8; // Keep in sync with server
          if (password.length < PASSWORD_MIN_LENGTH) {
            return {
              ok: false,
              error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
            };
          }

          try {
            const response = await abortableFetch(
              getApiUrl("/api/auth/register"),
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: trimmedUsername, password }),
                timeout: 15000,
                throwOnHttpError: false,
                retry: { maxAttempts: 1, initialDelayMs: 250 },
              }
            );

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
                // Keep token in memory only; httpOnly cookie handles persistence
                set({ authToken: data.token });
                saveTokenRefreshTime(data.user.username);
              }

              setTimeout(() => {
                get().checkHasPassword();
              }, 100);

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
        aiMessages: state.aiMessages,
        username: state.username,
        // NOTE: authToken is intentionally NOT persisted to localStorage.
        // Auth tokens are stored exclusively in httpOnly cookies to
        // prevent exposure via XSS. See: cookie-based auth flow.
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

          // Keep any old authToken in memory so that onRehydrateStorage can
          // use it one last time to call the session endpoint and set the
          // httpOnly cookie. partialize no longer includes authToken, so it
          // will NOT be re-persisted to localStorage.

          ensureUsernameRecovery(finalState.username);

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

            // Collect any legacy token that survived in state (from v2 persist)
            // or in the recovery key, so we can migrate it to a httpOnly cookie.
            const legacyToken =
              state.authToken || consumeLegacyAuthToken() || null;
            state.authToken = null;
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
      const store = useChatsStore.getState();

      if (store.username === expectedUsername) {
        // Mark as authenticated — the httpOnly cookie provides the actual token.
        store.setAuthToken(COOKIE_SESSION_MARKER);
        store.checkHasPassword();
        store.checkAndRefreshTokenIfNeeded();
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
