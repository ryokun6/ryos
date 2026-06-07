import type { ChatMessage } from "@/types/chat";
import { CHAT_ANALYTICS, getTextAnalytics, track } from "@/utils/analytics";
import { decodeHtmlEntities } from "@/utils/decodeHtmlEntities";
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
import type { ChatsStoreState } from "./types";
import {
  type ApiMessage,
  capRoomMessages,
  clearApiUnavailable,
  isApiTemporarilyUnavailable,
  markApiTemporarilyUnavailable,
} from "./shared";
import { forceLogoutOnUnauthorized } from "./authSlice";

type ChatsGet = () => ChatsStoreState;
type ChatsSet = (
  partial:
    | Partial<ChatsStoreState>
    | ((state: ChatsStoreState) => Partial<ChatsStoreState>)
) => void;

export function createRoomsSlice(
  set: ChatsSet,
  get: ChatsGet
): Pick<
  ChatsStoreState,
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
  | "incrementUnread"
  | "clearUnread"
  | "setHasEverUsedChats"
> {
  return {
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
        track(CHAT_ANALYTICS.ROOM_SWITCH, {
          hasPreviousRoom: !!currentRoomId,
        });
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
            console.log("[ChatsStore] Received 401 — forcing logout");
            forceLogoutOnUnauthorized();
          }
          return { ok: false, error: error.message || "Failed to send message" };
        }
        console.error("[ChatsStore] Error sending message:", error);
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
}
