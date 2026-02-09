import type { ChatRoom } from "@/types/chat";
import type { ApiChatMessagePayload } from "./messageNormalization";
import {
  clearApiUnavailable,
  isApiTemporarilyUnavailable,
  markApiTemporarilyUnavailable,
  readJsonBody,
  warnChatsStoreOnce,
} from "./apiGuards";
import {
  fetchBulkMessagesRequest,
  fetchRoomMessagesRequest,
  fetchRoomsRequest,
} from "./messageRequests";

export const fetchRoomsPayload = async (
  username: string | null
): Promise<{ ok: true; rooms: ChatRoom[] } | { ok: false; error: string }> => {
  if (isApiTemporarilyUnavailable("rooms")) {
    return { ok: false, error: "Rooms API temporarily unavailable" };
  }

  try {
    const response = await fetchRoomsRequest(username);
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

    const roomsData = await readJsonBody<{ rooms?: ChatRoom[] }>(
      response,
      "fetchRooms success response"
    );
    if (!roomsData.ok) {
      warnChatsStoreOnce("fetchRooms-success-response", `[ChatsStore] ${roomsData.error}`);
      markApiTemporarilyUnavailable("rooms");
      return { ok: false, error: "Rooms API unavailable" };
    }

    const rooms = roomsData.data.rooms;
    if (rooms && Array.isArray(rooms)) {
      clearApiUnavailable("rooms");
      return { ok: true, rooms };
    }

    return { ok: false, error: "Invalid response format" };
  } catch {
    markApiTemporarilyUnavailable("rooms");
    return { ok: false, error: "Network error. Please try again." };
  }
};

export const fetchRoomMessagesPayload = async (
  roomId: string
): Promise<
  { ok: true; messages: ApiChatMessagePayload[] } | { ok: false; error: string }
> => {
  if (isApiTemporarilyUnavailable("room-messages")) {
    return { ok: false, error: "Messages API temporarily unavailable" };
  }

  try {
    const response = await fetchRoomMessagesRequest(roomId);
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

    const messagesData = await readJsonBody<{ messages?: ApiChatMessagePayload[] }>(
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

    if (messagesData.data.messages) {
      clearApiUnavailable("room-messages");
      return { ok: true, messages: messagesData.data.messages };
    }

    return { ok: false, error: "Invalid response format" };
  } catch {
    markApiTemporarilyUnavailable("room-messages");
    return { ok: false, error: "Network error. Please try again." };
  }
};

export const fetchBulkMessagesPayload = async (
  roomIds: string[]
): Promise<
  { ok: true; messagesMap: Record<string, ApiChatMessagePayload[]> } | { ok: false; error: string }
> => {
  if (isApiTemporarilyUnavailable("bulk-messages")) {
    return { ok: false, error: "Bulk messages API temporarily unavailable" };
  }

  try {
    const response = await fetchBulkMessagesRequest(roomIds);
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
      messagesMap?: Record<string, ApiChatMessagePayload[]>;
    }>(response, "fetchBulkMessages success response");
    if (!bulkData.ok) {
      warnChatsStoreOnce(
        "fetchBulkMessages-success-response",
        `[ChatsStore] ${bulkData.error}`
      );
      markApiTemporarilyUnavailable("bulk-messages");
      return { ok: false, error: "Bulk messages API unavailable" };
    }

    if (bulkData.data.messagesMap) {
      clearApiUnavailable("bulk-messages");
      return { ok: true, messagesMap: bulkData.data.messagesMap };
    }

    return { ok: false, error: "Invalid response format" };
  } catch {
    markApiTemporarilyUnavailable("bulk-messages");
    return { ok: false, error: "Network error. Please try again." };
  }
};
