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
import { ApiRequestError } from "@/api/core";
import {
  type CreateRoomPayload,
  createRoom as createRoomApi,
  deleteRoom as deleteRoomApi,
  getBulkMessages as getBulkMessagesApi,
  getRoomMessages as getRoomMessagesApi,
  listRooms as listRoomsApi,
  sendRoomMessage as sendRoomMessageApi,
  switchPresence as switchPresenceApi,
} from "@/api/rooms";

// Username recovery - plain text, username is public info
const USERNAME_RECOVERY_KEY = "_usr_recovery_key_";
// Legacy key kept only so we can clean it up during migration
const LEGACY_AUTH_TOKEN_RECOVERY_KEY = "_auth_recovery_key_";

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
    isAuthenticated: false,
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
  isAuthenticated: boolean;
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
  setAuthenticated: (authenticated: boolean) => void;
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
    type?: "public" | "private" | "irc",
    members?: string[],
    ircOptions?: {
      ircHost?: string;
      ircPort?: number;
      ircTls?: boolean;
      ircChannel?: string;
      ircServerLabel?: string;
    }
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
  | "setAuthenticated"
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

          // Re-filter rooms: drop private rooms the new identity cannot see.
          // IRC rooms remain visible to everyone.
          const lowerUser = username?.toLowerCase() ?? null;
          const currentRooms = get().rooms;
          if (currentRooms.length > 0) {
            const filtered = currentRooms.filter((room) => {
              if (!room.type || room.type === "public" || room.type === "irc")
                return true;
              if (!lowerUser) return false;
              return Array.isArray(room.members) && room.members.includes(lowerUser);
            });
            if (filtered.length !== currentRooms.length) {
              set({ rooms: filtered });
            }
          }

          if (username) {
            setTimeout(() => {
              get().checkHasPassword();
            }, 100);
          } else {
            set({ hasPassword: null });
          }
        },
        setAuthenticated: (authenticated) => {
          set({ isAuthenticated: authenticated });
        },
        setHasPassword: (hasPassword) => {
          set({ hasPassword });
        },
        checkHasPassword: async () => {
          const currentUsername = get().username;

          if (!currentUsername) {
            set({ hasPassword: null });
            return { ok: false, error: "Authentication required" };
          }

          try {
            const response = await abortableFetch(
              "/api/auth/password/check",
              {
                method: "GET",
                timeout: 15000,
                throwOnHttpError: false,
                retry: { maxAttempts: 1, initialDelayMs: 250 },
              }
            );

            if (response.ok) {
              const data = await response.json();
              set({ hasPassword: data.hasPassword });
              return { ok: true };
            } else {
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

          const currentUsername = get().username?.toLowerCase() ?? null;

          // Filter out private rooms where current user is not a member.
          // IRC rooms are visible to everyone.
          const filtered = newRooms.filter((room) => {
            if (!room.type || room.type === "public" || room.type === "irc")
              return true;
            if (!currentUsername) return false;
            return Array.isArray(room.members) && room.members.includes(currentUsername);
          });

          // Deep comparison to prevent unnecessary updates
          const currentRooms = get().rooms;
          // Apply stable sort to keep UI order consistent (public first, then name, then id)
          const sortedNewRooms = [...filtered].sort((a, b) => {
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

          if (currentUsername) {
            try {
              await abortableFetch(getApiUrl("/api/auth/logout"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
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

          localStorage.removeItem(USERNAME_RECOVERY_KEY);
          clearLegacyTokenRecovery();

          set((state) => ({
            ...state,
            aiMessages: [getInitialAiMessage()],
            username: null,
            isAuthenticated: false,
            hasPassword: null,
            currentRoomId: null,
            rooms: [],
            roomMessages: {},
            unreadCounts: {},
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

          try {
            const data = await listRoomsApi();
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
            const data = await getRoomMessagesApi(roomId);
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
            const data = await getBulkMessagesApi(roomIds);
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

          console.log(
            `[ChatsStore] Switching from ${currentRoomId} to ${newRoomId}`
          );

          set({ currentRoomId: newRoomId });

          if (newRoomId) {
            get().clearUnread(newRoomId);
          }

          if (username && get().isAuthenticated) {
            try {
              await switchPresenceApi({
                previousRoomId: currentRoomId,
                nextRoomId: newRoomId,
              });

              setTimeout(() => {
                get().fetchRooms();
              }, 50);
            } catch (error) {
              console.error(
                "[ChatsStore] Error switching rooms:",
                error
              );
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
          type: "public" | "private" | "irc" = "public",
          members: string[] = [],
          ircOptions: {
            ircHost?: string;
            ircPort?: number;
            ircTls?: boolean;
            ircChannel?: string;
            ircServerLabel?: string;
          } = {}
        ) => {
          const username = get().username;

          if (!username) {
            return { ok: false, error: "Username required" };
          }

          try {
            const payload: CreateRoomPayload = { type };
            if (type === "public") {
              payload.name = name.trim();
            } else if (type === "irc") {
              payload.name = name.trim();
              if (ircOptions.ircHost) payload.ircHost = ircOptions.ircHost;
              if (ircOptions.ircPort) payload.ircPort = ircOptions.ircPort;
              if (typeof ircOptions.ircTls === "boolean")
                payload.ircTls = ircOptions.ircTls;
              if (ircOptions.ircChannel)
                payload.ircChannel = ircOptions.ircChannel;
              if (ircOptions.ircServerLabel)
                payload.ircServerLabel = ircOptions.ircServerLabel;
            } else {
              payload.members = members;
            }

            const data = await createRoomApi(payload);
            if (data.room) {
              // Room will be added via Pusher update, so we don't need to manually add it
              return { ok: true, roomId: data.room.id };
            }

            return { ok: false, error: "Invalid response format" };
          } catch (error) {
            if (error instanceof ApiRequestError) {
              if (error.status === 401) {
                console.log("[ChatsStore] Received 401 — forcing logout");
                forceLogoutOnUnauthorized();
              }
              return { ok: false, error: error.message || "Failed to create room" };
            }
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
            await deleteRoomApi(roomId);
            // Room will be removed via Pusher update
            // If we're currently in this room, switch to @ryo
            const currentRoomId = get().currentRoomId;
            if (currentRoomId === roomId) {
              set({ currentRoomId: null });
            }

            return { ok: true };
          } catch (error) {
            if (error instanceof ApiRequestError) {
              if (error.status === 401) {
                console.log("[ChatsStore] Received 401 — forcing logout");
                forceLogoutOnUnauthorized();
              }
              return { ok: false, error: error.message || "Failed to delete room" };
            }
            console.error("[ChatsStore] Error deleting room:", error);
            return { ok: false, error: "Network error. Please try again." };
          }
        },
        sendMessage: async (roomId: string, content: string) => {
          const username = get().username;

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
            await sendRoomMessageApi(roomId, { content: content.trim() });
            // Real message will be added via Pusher, which will replace the optimistic one
            return { ok: true };
          } catch (error) {
            // Remove optimistic message on failure
            get().removeMessageFromRoom(roomId, tempId);
            if (error instanceof ApiRequestError) {
              if (error.status === 401) {
                console.log("[ChatsStore] Received 401 — forcing logout");
                forceLogoutOnUnauthorized();
              }
              return { ok: false, error: error.message || "Failed to send message" };
            }
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
              set({ username: data.user.username, isAuthenticated: true });

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
