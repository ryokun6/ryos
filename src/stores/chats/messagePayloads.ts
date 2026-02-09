import type { ChatMessage, ChatRoom } from "@/types/chat";
import { abortableFetch } from "@/utils/abortableFetch";
import { decodeHtmlEntities } from "@/utils/html";
import {
  clearApiUnavailable,
  isApiTemporarilyUnavailable,
  markApiTemporarilyUnavailable,
  readJsonBody,
  warnChatsStoreOnce,
} from "./apiGuards";
import { withChatRequestDefaults } from "./requestConfig";

export interface ApiChatMessagePayload {
  id: string;
  roomId: string;
  username: string;
  content: string;
  timestamp: string | number;
}

export const normalizeApiMessage = (
  message: ApiChatMessagePayload
): ChatMessage => ({
  ...message,
  content: decodeHtmlEntities(String(message.content || "")),
  timestamp:
    typeof message.timestamp === "string" || typeof message.timestamp === "number"
      ? new Date(message.timestamp).getTime()
      : message.timestamp,
});

export const normalizeApiMessages = (
  messages: ApiChatMessagePayload[]
): ChatMessage[] =>
  messages
    .map((message) => normalizeApiMessage(message))
    .sort((a, b) => a.timestamp - b.timestamp);

const NETWORK_ERROR_MESSAGE = "Network error. Please try again.";

export const logIfNetworkResultError = (
  message: string,
  error: string
): void => {
  if (error === NETWORK_ERROR_MESSAGE) {
    console.error(message);
  }
};

export const fetchRoomsRequest = async (
  username: string | null
): Promise<Response> => {
  const queryParams = new URLSearchParams();
  if (username) {
    queryParams.append("username", username);
  }

  const url = queryParams.toString()
    ? `/api/rooms?${queryParams.toString()}`
    : "/api/rooms";

  return abortableFetch(
    url,
    withChatRequestDefaults({
      method: "GET",
    })
  );
};

export const fetchRoomMessagesRequest = async (
  roomId: string
): Promise<Response> =>
  abortableFetch(
    `/api/rooms/${encodeURIComponent(roomId)}/messages`,
    withChatRequestDefaults({
      method: "GET",
    })
  );

export const fetchBulkMessagesRequest = async (
  roomIds: string[]
): Promise<Response> => {
  const queryParams = new URLSearchParams({
    roomIds: roomIds.join(","),
  });

  return abortableFetch(
    `/api/messages/bulk?${queryParams.toString()}`,
    withChatRequestDefaults({
      method: "GET",
    })
  );
};

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
