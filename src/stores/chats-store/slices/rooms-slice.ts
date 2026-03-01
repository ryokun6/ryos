import type { ChatMessage } from "@/types/chat";
import { getApiUrl } from "@/utils/platform";
import { abortableFetch } from "@/utils/abortableFetch";
import {
  clearApiUnavailable,
  isApiTemporarilyUnavailable,
  makeAuthenticatedRequest,
  markApiTemporarilyUnavailable,
  readJsonBody,
  warnChatsStoreOnce,
} from "../services/api";
import {
  mergeFetchedMessages,
  normalizeApiMessages,
  sortAndCapMessages,
  sortRoomsForDisplay,
  upsertIncomingRoomMessage,
} from "../services/messages";
import type {
  ApiMessage,
  ChatsStoreGet,
  ChatsStoreSet,
  ChatsStoreState,
  CreateRoomPayload,
} from "../types";

type RoomsSlice = Pick<
  ChatsStoreState,
  | "setRooms"
  | "setCurrentRoomId"
  | "setRoomMessagesForCurrentRoom"
  | "addMessageToRoom"
  | "removeMessageFromRoom"
  | "clearRoomMessages"
  | "fetchRooms"
  | "fetchMessagesForRoom"
  | "fetchBulkMessages"
  | "switchRoom"
  | "createRoom"
  | "deleteRoom"
  | "sendMessage"
>;

export const createRoomsSlice = (set: ChatsStoreSet, get: ChatsStoreGet): RoomsSlice => ({
  setRooms: (newRooms) => {
    if (!Array.isArray(newRooms)) {
      console.warn(
        "[ChatsStore] Attempted to set rooms with a non-array value:",
        newRooms
      );
      return;
    }

    const currentRooms = get().rooms;
    const sortedNewRooms = sortRoomsForDisplay(newRooms);

    if (JSON.stringify(currentRooms) === JSON.stringify(sortedNewRooms)) {
      console.log(
        "[ChatsStore] setRooms skipped: newRooms are identical to current rooms."
      );
      return;
    }

    console.log("[ChatsStore] setRooms called. Updating rooms.");
    set({ rooms: sortedNewRooms });
  },
  setCurrentRoomId: (roomId) => set({ currentRoomId: roomId }),
  setRoomMessagesForCurrentRoom: (messages) => {
    const currentRoomId = get().currentRoomId;
    if (currentRoomId) {
      set((state) => ({
        roomMessages: {
          ...state.roomMessages,
          [currentRoomId]: sortAndCapMessages(messages),
        },
      }));
    }
  },
  addMessageToRoom: (roomId, message) => {
    set((state) => {
      const existingMessages = state.roomMessages[roomId] || [];
      const updatedMessages = upsertIncomingRoomMessage(existingMessages, message);
      if (updatedMessages === existingMessages) {
        return {};
      }

      return {
        roomMessages: {
          ...state.roomMessages,
          [roomId]: updatedMessages,
        },
      };
    });
  },
  removeMessageFromRoom: (roomId, messageId) => {
    set((state) => {
      const existingMessages = state.roomMessages[roomId] || [];
      const updatedMessages = existingMessages.filter((m) => m.id !== messageId);
      if (updatedMessages.length < existingMessages.length) {
        return {
          roomMessages: {
            ...state.roomMessages,
            [roomId]: updatedMessages,
          },
        };
      }
      return {};
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
  fetchRooms: async () => {
    console.log("[ChatsStore] Fetching rooms...");
    if (isApiTemporarilyUnavailable("rooms")) {
      return { ok: false, error: "Rooms API temporarily unavailable" };
    }
    const currentUsername = get().username;

    try {
      const queryParams = new URLSearchParams();
      if (currentUsername) {
        queryParams.append("username", currentUsername);
      }

      const url = queryParams.toString()
        ? `/api/rooms?${queryParams.toString()}`
        : "/api/rooms";

      const response = await abortableFetch(url, {
        method: "GET",
        timeout: 15000,
        throwOnHttpError: false,
        retry: { maxAttempts: 1, initialDelayMs: 250 },
      });
      if (!response.ok) {
        const errorData = await readJsonBody<{ error?: string }>(
          response,
          "fetchRooms error response"
        );
        return {
          ok: false,
          error: errorData.ok
            ? errorData.data.error || "Failed to fetch rooms"
            : `HTTP error! status: ${response.status}`,
        };
      }

      const roomsData = await readJsonBody<{ rooms?: ChatsStoreState["rooms"] }>(
        response,
        "fetchRooms success response"
      );
      if (!roomsData.ok) {
        warnChatsStoreOnce(
          "fetchRooms-success-response",
          `[ChatsStore] ${roomsData.error}`
        );
        markApiTemporarilyUnavailable("rooms");
        return { ok: false, error: "Rooms API unavailable" };
      }

      const data = roomsData.data;
      if (data.rooms && Array.isArray(data.rooms)) {
        clearApiUnavailable("rooms");
        get().setRooms(data.rooms);
        return { ok: true };
      }

      return { ok: false, error: "Invalid response format" };
    } catch (error) {
      console.error("[ChatsStore] Error fetching rooms:", error);
      markApiTemporarilyUnavailable("rooms");
      return { ok: false, error: "Network error. Please try again." };
    }
  },
  fetchMessagesForRoom: async (roomId: string) => {
    if (!roomId) return { ok: false, error: "Room ID required" };

    console.log(`[ChatsStore] Fetching messages for room ${roomId}...`);
    if (isApiTemporarilyUnavailable("room-messages")) {
      return { ok: false, error: "Messages API temporarily unavailable" };
    }

    try {
      const response = await abortableFetch(
        `/api/rooms/${encodeURIComponent(roomId)}/messages`,
        {
          method: "GET",
          timeout: 15000,
          throwOnHttpError: false,
          retry: { maxAttempts: 1, initialDelayMs: 250 },
        }
      );
      if (!response.ok) {
        const errorData = await readJsonBody<{ error?: string }>(
          response,
          "fetchMessagesForRoom error response"
        );
        return {
          ok: false,
          error: errorData.ok
            ? errorData.data.error || "Failed to fetch messages"
            : `HTTP error! status: ${response.status}`,
        };
      }

      const messagesData = await readJsonBody<{ messages?: ApiMessage[] }>(
        response,
        "fetchMessagesForRoom success response"
      );
      if (!messagesData.ok) {
        warnChatsStoreOnce(
          "fetchMessagesForRoom-success-response",
          `[ChatsStore] ${messagesData.error}`
        );
        markApiTemporarilyUnavailable("room-messages");
        return { ok: false, error: "Messages API unavailable" };
      }

      const data = messagesData.data;
      if (data.messages) {
        clearApiUnavailable("room-messages");
        const fetchedMessages = normalizeApiMessages(data.messages || []);

        set((state) => {
          const existing = state.roomMessages[roomId] || [];
          const merged = mergeFetchedMessages(existing, fetchedMessages);
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
      return { ok: false, error: "Network error. Please try again." };
    }
  },
  fetchBulkMessages: async (roomIds: string[]) => {
    if (roomIds.length === 0) return { ok: false, error: "Room IDs required" };

    console.log(
      `[ChatsStore] Fetching messages for rooms: ${roomIds.join(", ")}...`
    );
    if (isApiTemporarilyUnavailable("bulk-messages")) {
      return { ok: false, error: "Bulk messages API temporarily unavailable" };
    }

    try {
      const queryParams = new URLSearchParams({
        roomIds: roomIds.join(","),
      });

      const response = await abortableFetch(
        `/api/messages/bulk?${queryParams.toString()}`,
        {
          method: "GET",
          timeout: 15000,
          throwOnHttpError: false,
          retry: { maxAttempts: 1, initialDelayMs: 250 },
        }
      );
      if (!response.ok) {
        const errorData = await readJsonBody<{ error?: string }>(
          response,
          "fetchBulkMessages error response"
        );
        return {
          ok: false,
          error: errorData.ok
            ? errorData.data.error || "Failed to fetch messages"
            : `HTTP error! status: ${response.status}`,
        };
      }

      const bulkData = await readJsonBody<{
        messagesMap?: Record<string, ApiMessage[]>;
      }>(response, "fetchBulkMessages success response");
      if (!bulkData.ok) {
        warnChatsStoreOnce(
          "fetchBulkMessages-success-response",
          `[ChatsStore] ${bulkData.error}`
        );
        markApiTemporarilyUnavailable("bulk-messages");
        return { ok: false, error: "Bulk messages API unavailable" };
      }

      const data = bulkData.data;
      const messagesMap = data.messagesMap;
      if (messagesMap) {
        clearApiUnavailable("bulk-messages");
        set((state) => {
          const nextRoomMessages = { ...state.roomMessages };

          Object.entries(messagesMap).forEach(([roomId, messages]) => {
            const processed = normalizeApiMessages(messages as ApiMessage[]);
            const existing = nextRoomMessages[roomId] || [];
            nextRoomMessages[roomId] = mergeFetchedMessages(existing, processed);
          });

          return { roomMessages: nextRoomMessages };
        });

        return { ok: true };
      }

      return { ok: false, error: "Invalid response format" };
    } catch (error) {
      console.error(
        `[ChatsStore] Error fetching messages for rooms ${roomIds.join(", ")}:`,
        error
      );
      markApiTemporarilyUnavailable("bulk-messages");
      return { ok: false, error: "Network error. Please try again." };
    }
  },
  switchRoom: async (newRoomId: string | null) => {
    const currentRoomId = get().currentRoomId;
    const username = get().username;

    console.log(`[ChatsStore] Switching from ${currentRoomId} to ${newRoomId}`);

    set({ currentRoomId: newRoomId });

    if (newRoomId) {
      get().clearUnread(newRoomId);
    }

    if (username) {
      try {
        const response = await abortableFetch("/api/presence/switch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            previousRoomId: currentRoomId,
            nextRoomId: newRoomId,
            username,
          }),
          timeout: 15000,
          throwOnHttpError: false,
          retry: { maxAttempts: 1, initialDelayMs: 250 },
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({
            error: `HTTP error! status: ${response.status}`,
          }));
          console.error("[ChatsStore] Error switching rooms:", errorData);
        } else {
          console.log("[ChatsStore] Room switch API call successful");
          setTimeout(() => {
            console.log("[ChatsStore] Refreshing rooms after switch");
            get().fetchRooms();
          }, 50);
        }
      } catch (error) {
        console.error("[ChatsStore] Network error switching rooms:", error);
      }
    }

    if (newRoomId) {
      console.log(`[ChatsStore] Fetching latest messages for room ${newRoomId}`);
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

    const tempId = `temp_${Math.random().toString(36).substring(2, 9)}`;
    const optimisticMessage: ChatMessage = {
      id: tempId,
      clientId: tempId,
      roomId,
      username,
      content: content.trim(),
      timestamp: Date.now(),
    };

    get().addMessageToRoom(roomId, optimisticMessage);

    try {
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };

      if (authToken) {
        headers.Authorization = `Bearer ${authToken}`;
        headers["X-Username"] = username;
      }

      const messageUrl = `/api/rooms/${encodeURIComponent(roomId)}/messages`;
      const messageBody = JSON.stringify({
        content: content.trim(),
      });

      const response = authToken
        ? await makeAuthenticatedRequest(
            messageUrl,
            {
              method: "POST",
              headers,
              body: messageBody,
            },
            get().refreshAuthToken
          )
        : await abortableFetch(getApiUrl(messageUrl), {
            method: "POST",
            headers,
            body: messageBody,
            timeout: 15000,
            throwOnHttpError: false,
            retry: { maxAttempts: 1, initialDelayMs: 250 },
          });

      if (!response.ok) {
        get().removeMessageFromRoom(roomId, tempId);
        const errorData = await response.json().catch(() => ({
          error: `HTTP error! status: ${response.status}`,
        }));
        return {
          ok: false,
          error: errorData.error || "Failed to send message",
        };
      }

      return { ok: true };
    } catch (error) {
      get().removeMessageFromRoom(roomId, tempId);
      console.error("[ChatsStore] Error sending message:", error);
      return { ok: false, error: "Network error. Please try again." };
    }
  },
});
