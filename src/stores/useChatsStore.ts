import { create } from "zustand";
import { createClientLogger } from "@/utils/logger";
import { useStoreShallow } from "./helpers";
import { persist } from "zustand/middleware";
import { createDebouncedPersistStorage } from "@/utils/debouncedPersistStorage";
import {
  type ChatRoom,
  type ChatMessage,
  type AIChatMessage,
} from "@/types/chat";
import { APP_ANALYTICS, CHAT_ANALYTICS, getTextAnalytics, track } from "@/utils/analytics";
import { decodeHtmlEntities } from "@/utils/decodeHtmlEntities";
import i18n from "@/lib/i18n";
import { ApiRequestError } from "@/api/core";
import { USERNAME_REGEX, PASSWORD_MIN_LENGTH } from "@/shared/validation";
import { normalizeChatTimestamp } from "@/shared/contracts/chat";
import {
  checkUserPassword,
  deleteAccount as deleteAccountApi,
  getAuthSession,
  logoutUserSafe,
  registerUser,
  setUserPassword,
} from "@/api/auth";
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
import type { CreateRoomIrcOptions } from "@/shared/contracts/chat";

const debug = createClientLogger("ChatsStore").debug;

// Username recovery - plain text, username is public info
const USERNAME_RECOVERY_KEY = "_usr_recovery_key_";

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

/**
 * Merge messages fetched from the API into a room's existing message list.
 *
 * Decodes HTML entities, normalizes timestamps and sorts chronologically,
 * then reconciles optimistic temp_ messages against the fetched server
 * messages (by clientId, or by username + content within a time window) and
 * caps the result to the history limit. Shared by fetchMessagesForRoom and
 * fetchBulkMessages.
 */
const mergeFetchedRoomMessages = (
  existing: ChatMessage[],
  fetched: ApiMessage[]
): ChatMessage[] => {
  const fetchedMessages: ChatMessage[] = fetched
    .map((msg) => ({
      ...msg,
      content: decodeHtmlEntities(String(msg.content || "")),
      timestamp: normalizeChatTimestamp(msg.timestamp),
    }))
    .sort((a, b) => a.timestamp - b.timestamp);

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
      const serverClientId = (serverMsg as ChatMessage & { clientId?: string })
        .clientId;
      if (serverClientId && serverClientId === tempClientId) {
        // Server message has matching clientId - associate and skip temp
        byId.set(serverMsg.id, {
          ...byId.get(serverMsg.id)!,
          clientId: tempClientId,
        });
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
        byId.set(serverMsg.id, {
          ...byId.get(serverMsg.id)!,
          clientId: tempClientId,
        });
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

  return capRoomMessages(
    Array.from(byId.values()).sort((a, b) => a.timestamp - b.timestamp)
  );
};

// Username recovery: plain-text localStorage (username is not secret)
const saveUsernameToRecovery = (username: string | null) => {
  if (username) {
    localStorage.setItem(USERNAME_RECOVERY_KEY, username);
  }
};

const getUsernameFromRecovery = (): string | null => {
  const raw = localStorage.getItem(USERNAME_RECOVERY_KEY);
  if (!raw) return null;
  return raw;
};

const API_UNAVAILABLE_COOLDOWN_MS = 10_000;
const apiUnavailableUntil: Record<string, number> = {};
const ROOMS_FETCH_TTL_MS = 1_500;

type FetchResult = { ok: boolean; error?: string };
type FetchRoomsOptions = { force?: boolean };

let roomsFetchPromise: Promise<FetchResult> | null = null;
let roomsFetchFreshUntil = 0;

const resetRoomsFetchCache = (): void => {
  roomsFetchPromise = null;
  roomsFetchFreshUntil = 0;
};

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
  debug("[ChatsStore] Unauthorized — clearing auth state for", store.username);
  localStorage.removeItem(USERNAME_RECOVERY_KEY);
  useChatsStore.setState({
    username: null,
    isAuthenticated: false,
    hasPassword: null,
    currentRoomId: null,
  });
}

// Ensure username recovery key is set if username exists but recovery key doesn't.
const ensureUsernameRecovery = (username: string | null) => {
  if (username && !localStorage.getItem(USERNAME_RECOVERY_KEY)) {
    debug(
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
  setPassword: (
    password: string,
    currentPassword?: string
  ) => Promise<{ ok: boolean; error?: string }>; // Set or change password for user
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
  fetchRooms: (options?: FetchRoomsOptions) => Promise<FetchResult>;
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
    ircOptions?: CreateRoomIrcOptions
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
  deleteAccount: (params: {
    confirmUsername: string;
    currentPassword?: string;
  }) => Promise<{ ok: boolean; error?: string }>; // Permanently delete account
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
  | "deleteAccount"
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
      // Ensure username recovery key is set.
      ensureUsernameRecovery(initialState.username);

      return {
        ...initialState,

        // --- Actions ---
        setAiMessages: (messages) => set({ aiMessages: messages }),
        setUsername: (username) => {
          if (get().username !== username) {
            resetRoomsFetchCache();
          }
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
          if (get().isAuthenticated !== authenticated) {
            resetRoomsFetchCache();
          }
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
            const data = await checkUserPassword();
            set({ hasPassword: data.hasPassword });
            return { ok: true };
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
        setPassword: async (password, currentPassword) => {
          const currentUsername = get().username;

          if (!currentUsername) {
            return { ok: false, error: "Authentication required" };
          }

          try {
            const payload: { password: string; currentPassword?: string } = {
              password,
            };
            if (typeof currentPassword === "string" && currentPassword.length > 0) {
              payload.currentPassword = currentPassword;
            }

            await setUserPassword(payload);

            // Update local state to reflect password has been set
            set({ hasPassword: true });
            return { ok: true };
          } catch (error) {
            console.error("[ChatsStore] Error setting password:", error);
            return {
              ok: false,
              error:
                error instanceof ApiRequestError
                  ? error.message
                  : "Network error while setting password",
            };
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
            debug(
              "[ChatsStore] setRooms skipped: newRooms are identical to current rooms."
            );
            return; // Skip update if rooms haven't actually changed
          }

          debug("[ChatsStore] setRooms called. Updating rooms.");
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
          resetRoomsFetchCache();
          set(getInitialState());
        },
        logout: async () => {
          debug("[ChatsStore] Logging out user...");

          const currentUsername = get().username;

          if (currentUsername) {
            try {
              await logoutUserSafe();
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
          resetRoomsFetchCache();

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
            await get().fetchRooms({ force: true });
          } catch (error) {
            console.error(
              "[ChatsStore] Error refreshing rooms after logout:",
              error
            );
          }

          debug("[ChatsStore] User logged out successfully");
        },
        deleteAccount: async ({ confirmUsername, currentPassword }) => {
          const currentUsername = get().username;
          if (!currentUsername) {
            return { ok: false, error: "Authentication required" };
          }

          try {
            await deleteAccountApi({
              confirm: true,
              confirmUsername,
              ...(currentPassword ? { currentPassword } : {}),
            });
          } catch (error) {
            console.error("[ChatsStore] Error deleting account:", error);
            return {
              ok: false,
              error:
                error instanceof ApiRequestError
                  ? error.message
                  : "Network error while deleting account",
            };
          }

          // Account is gone server-side (cookie cleared in the response). Clear
          // all local state without calling the logout endpoint.
          track(APP_ANALYTICS.USER_LOGOUT, { username: currentUsername });
          localStorage.removeItem(USERNAME_RECOVERY_KEY);
          resetRoomsFetchCache();

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
            await get().fetchRooms({ force: true });
          } catch (error) {
            console.error(
              "[ChatsStore] Error refreshing rooms after deletion:",
              error
            );
          }

          return { ok: true };
        },
        fetchRooms: async (options = {}) => {
          if (roomsFetchPromise) {
            debug("[ChatsStore] Reusing in-flight rooms fetch...");
            return roomsFetchPromise;
          }

          if (!options.force && Date.now() < roomsFetchFreshUntil) {
            debug("[ChatsStore] Skipping rooms fetch; cache is fresh.");
            return { ok: true };
          }

          debug("[ChatsStore] Fetching rooms...");
          if (isApiTemporarilyUnavailable("rooms")) {
            return { ok: false, error: "Rooms API temporarily unavailable" };
          }

          roomsFetchPromise = (async (): Promise<FetchResult> => {
            try {
              const data = await listRoomsApi();
              if (data.rooms && Array.isArray(data.rooms)) {
                clearApiUnavailable("rooms");
                // Normalize ordering via setRooms to enforce alphabetical sections
                get().setRooms(data.rooms);
                roomsFetchFreshUntil = Date.now() + ROOMS_FETCH_TTL_MS;
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
            } finally {
              roomsFetchPromise = null;
            }
          })();

          return roomsFetchPromise;
        },
        fetchMessagesForRoom: async (roomId: string) => {
          if (!roomId) return { ok: false, error: "Room ID required" };

          debug(`[ChatsStore] Fetching messages for room ${roomId}...`);
          if (isApiTemporarilyUnavailable("room-messages")) {
            return { ok: false, error: "Messages API temporarily unavailable" };
          }

          try {
            const data = await getRoomMessagesApi(roomId);
            if (data.messages) {
              clearApiUnavailable("room-messages");
              // Merge with any existing messages to avoid race conditions with realtime pushes
              set((state) => ({
                roomMessages: {
                  ...state.roomMessages,
                  [roomId]: mergeFetchedRoomMessages(
                    state.roomMessages[roomId] || [],
                    data.messages || []
                  ),
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

          debug(
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

                Object.entries(messagesMap).forEach(([roomId, messages]) => {
                  nextRoomMessages[roomId] = mergeFetchedRoomMessages(
                    nextRoomMessages[roomId] || [],
                    messages as ApiMessage[]
                  );
                });

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

          debug(
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
            track(CHAT_ANALYTICS.ROOM_SWITCH, {
              hasPreviousRoom: !!currentRoomId,
            });
            debug(
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
            ircServerId?: string;
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
              if (ircOptions.ircServerId)
                payload.ircServerId = ircOptions.ircServerId;
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
              track(CHAT_ANALYTICS.ROOM_CREATE, {
                roomType: type,
                memberCount: members.length,
                isIrc: type === "irc",
              });
              // Room will be added via Pusher update, so we don't need to manually add it
              return { ok: true, roomId: data.room.id };
            }

            return { ok: false, error: "Invalid response format" };
          } catch (error) {
            if (error instanceof ApiRequestError) {
              if (error.status === 401) {
                debug("[ChatsStore] Received 401 — forcing logout");
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
            track(CHAT_ANALYTICS.ROOM_DELETE);
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
                debug("[ChatsStore] Received 401 — forcing logout");
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
            track(CHAT_ANALYTICS.TEXT_MESSAGE, {
              ...getTextAnalytics(content.trim()),
              source: "room_store",
            });
            // Real message will be added via Pusher, which will replace the optimistic one
            return { ok: true };
          } catch (error) {
            // Remove optimistic message on failure
            get().removeMessageFromRoom(roomId, tempId);
            if (error instanceof ApiRequestError) {
              if (error.status === 401) {
                debug("[ChatsStore] Received 401 — forcing logout");
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
          const isValid = USERNAME_REGEX.test(trimmedUsername);
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
          if (password.length < PASSWORD_MIN_LENGTH) {
            return {
              ok: false,
              error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
            };
          }

          try {
            const data = await registerUser({
              username: trimmedUsername,
              password,
            });
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
            return {
              ok: false,
              error:
                error instanceof ApiRequestError
                  ? error.message
                  : "Network error. Please try again.",
            };
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
      // Write-behind storage: chat history (aiMessages + capped roomMessages)
      // used to be JSON.stringify'd and written synchronously on every
      // appended message. Serialization now happens once per quiet window.
      storage: createDebouncedPersistStorage(),
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
      onRehydrateStorage: () => {
        debug("[ChatsStore] Rehydrating storage...");
        return (state, error) => {
          if (error) {
            console.error("[ChatsStore] Error during rehydration:", error);
          } else if (state) {
            debug(
              "[ChatsStore] Rehydration complete. Current state username:",
              state.username
            );

            // Recover username if missing
            if (state.username === null) {
              const recoveredUsername = getUsernameFromRecovery();
              if (recoveredUsername) {
                debug(
                  `[ChatsStore] Recovered username '${recoveredUsername}' from recovery storage.`
                );
                state.username = recoveredUsername;
              }
            }

            ensureUsernameRecovery(state.username);

            // Restore session from the httpOnly cookie.
            if (state.username) {
              restoreSessionFromCookie(state.username);
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
 * The httpOnly cookie authenticates the request automatically.
 */
async function restoreSessionFromCookie(expectedUsername: string) {
  try {
    const session = await getAuthSession();

    if (!session.ok) {
      debug("[ChatsStore] Session restore failed:", session.status);
      if (session.status === 401 || session.status === 403) {
        forceLogoutOnUnauthorized();
      }
      return;
    }

    const data = session.data;
    if (data.authenticated && data.username) {
      debug(
        "[ChatsStore] Session restored for",
        data.username,
        "(from cookie)"
      );
      const store = useChatsStore.getState();

      if (store.username === expectedUsername) {
        store.setAuthenticated(true);
        store.checkHasPassword();
      }
    } else {
      debug("[ChatsStore] No valid session — logging out.");
      forceLogoutOnUnauthorized();
    }
  } catch (err) {
    // Network error — keep state, don't force-logout.
    // The user may come back online and the cookie will still be valid.
    console.warn("[ChatsStore] Session restore request failed:", err);
  }
}

/**
 * Shallow-equality selector hook for this store. Co-located with the store
 * (rather than a central helpers barrel) so importing it doesn't pull other
 * stores into the bundle.
 */
export function useChatsStoreShallow<T>(
  selector: (state: ReturnType<typeof useChatsStore.getState>) => T
): T {
  return useStoreShallow(useChatsStore, selector);
}
