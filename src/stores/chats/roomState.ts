import type { ChatMessage, ChatRoom } from "@/types/chat";
import { abortableFetch } from "@/utils/abortableFetch";
import { decodeHtmlEntities } from "@/utils/html";
import { getApiUrl } from "@/utils/platform";
import {
  clearApiUnavailable,
  isApiTemporarilyUnavailable,
  markApiTemporarilyUnavailable,
  readErrorResponseBody,
  readJsonBody,
  type RefreshTokenHandler,
  type RefreshTokenResult,
  makeAuthenticatedRequest,
  warnChatsStoreOnce,
  withChatRequestDefaults,
} from "./authFlows";

const MESSAGE_HISTORY_CAP = 500;
const MATCH_WINDOW_MS = 10_000;
const INCOMING_TEMP_MATCH_WINDOW_MS = 5_000;
const NETWORK_ERROR_MESSAGE = "Network error. Please try again.";

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
    return { ok: false, error: NETWORK_ERROR_MESSAGE };
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
    return { ok: false, error: NETWORK_ERROR_MESSAGE };
  }
};

export const fetchBulkMessagesPayload = async (
  roomIds: string[]
): Promise<
  | { ok: true; messagesMap: Record<string, ApiChatMessagePayload[]> }
  | { ok: false; error: string }
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
    return { ok: false, error: NETWORK_ERROR_MESSAGE };
  }
};

const sortChatRoomsForUi = (rooms: ChatRoom[]): ChatRoom[] =>
  [...rooms].sort((a, b) => {
    const aOrder = a.type === "private" ? 1 : 0;
    const bOrder = b.type === "private" ? 1 : 0;
    if (aOrder !== bOrder) return aOrder - bOrder;

    const aName = (a.name || "").toLowerCase();
    const bName = (b.name || "").toLowerCase();
    if (aName !== bName) return aName.localeCompare(bName);

    return a.id.localeCompare(b.id);
  });

const areChatRoomListsEqual = (
  currentRooms: ChatRoom[],
  nextRooms: ChatRoom[]
): boolean => JSON.stringify(currentRooms) === JSON.stringify(nextRooms);

export const prepareRoomsForSet = (
  currentRooms: ChatRoom[],
  incomingRooms: ChatRoom[]
): { changed: boolean; rooms: ChatRoom[] } => {
  const sortedRooms = sortChatRoomsForUi(incomingRooms);
  return {
    changed: !areChatRoomListsEqual(currentRooms, sortedRooms),
    rooms: sortedRooms,
  };
};

export const capRoomMessages = (messages: ChatMessage[]): ChatMessage[] =>
  messages.slice(-MESSAGE_HISTORY_CAP);

export const sortAndCapRoomMessages = (
  messages: ChatMessage[]
): ChatMessage[] =>
  capRoomMessages([...messages].sort((a, b) => a.timestamp - b.timestamp));

export const mergeServerMessagesWithOptimistic = (
  existingMessages: ChatMessage[],
  fetchedMessages: ChatMessage[]
): ChatMessage[] => {
  const byId = new Map<string, ChatMessage>();
  const tempMessages: ChatMessage[] = [];

  for (const message of existingMessages) {
    if (message.id.startsWith("temp_")) {
      tempMessages.push(message);
    } else {
      byId.set(message.id, message);
    }
  }

  for (const message of fetchedMessages) {
    const prev = byId.get(message.id);
    if (prev?.clientId) {
      byId.set(message.id, { ...message, clientId: prev.clientId });
    } else {
      byId.set(message.id, message);
    }
  }

  const usedTempIds = new Set<string>();

  for (const temp of tempMessages) {
    const tempClientId = temp.clientId || temp.id;
    let matched = false;

    for (const serverMessage of fetchedMessages) {
      if (serverMessage.clientId && serverMessage.clientId === tempClientId) {
        const existingServerMessage = byId.get(serverMessage.id);
        if (existingServerMessage) {
          byId.set(serverMessage.id, {
            ...existingServerMessage,
            clientId: tempClientId,
          });
        }
        matched = true;
        break;
      }

      if (
        serverMessage.username === temp.username &&
        serverMessage.content === temp.content &&
        Math.abs(serverMessage.timestamp - temp.timestamp) <= MATCH_WINDOW_MS
      ) {
        const existingServerMessage = byId.get(serverMessage.id);
        if (existingServerMessage) {
          byId.set(serverMessage.id, {
            ...existingServerMessage,
            clientId: tempClientId,
          });
        }
        matched = true;
        break;
      }
    }

    if (!matched && !usedTempIds.has(temp.id)) {
      byId.set(temp.id, temp);
      usedTempIds.add(temp.id);
    }
  }

  return sortAndCapRoomMessages(Array.from(byId.values()));
};

const mergeIncomingRoomMessage = (
  existingMessages: ChatMessage[],
  incoming: ChatMessage
): ChatMessage[] | null => {
  if (existingMessages.some((message) => message.id === incoming.id)) {
    return null;
  }

  const incomingClientId = incoming.clientId;
  if (incomingClientId) {
    const indexByClientId = existingMessages.findIndex(
      (message) =>
        message.id === incomingClientId || message.clientId === incomingClientId
    );
    if (indexByClientId !== -1) {
      const tempMessage = existingMessages[indexByClientId];
      const replaced = {
        ...incoming,
        clientId: tempMessage.clientId || tempMessage.id,
      } satisfies ChatMessage;
      const updated = [...existingMessages];
      updated[indexByClientId] = replaced;
      return sortAndCapRoomMessages(updated);
    }
  }

  const tempIndex = existingMessages.findIndex(
    (message) =>
      message.id.startsWith("temp_") &&
      message.username === incoming.username &&
      message.content === incoming.content
  );

  if (tempIndex !== -1) {
    const tempMessage = existingMessages[tempIndex];
    const replaced = {
      ...incoming,
      clientId: tempMessage.clientId || tempMessage.id,
    } satisfies ChatMessage;
    const updated = [...existingMessages];
    updated[tempIndex] = replaced;
    return sortAndCapRoomMessages(updated);
  }

  const incomingTs = Number(incoming.timestamp);
  const candidateIndexes: number[] = [];
  existingMessages.forEach((message, idx) => {
    if (message.id.startsWith("temp_") && message.username === incoming.username) {
      const delta = Math.abs(Number(message.timestamp) - incomingTs);
      if (Number.isFinite(delta) && delta <= INCOMING_TEMP_MATCH_WINDOW_MS) {
        candidateIndexes.push(idx);
      }
    }
  });

  if (candidateIndexes.length > 0) {
    let bestIndex = candidateIndexes[0];
    let bestDelta = Math.abs(
      Number(existingMessages[bestIndex].timestamp) - incomingTs
    );
    for (let i = 1; i < candidateIndexes.length; i++) {
      const idx = candidateIndexes[i];
      const delta = Math.abs(Number(existingMessages[idx].timestamp) - incomingTs);
      if (delta < bestDelta) {
        bestIndex = idx;
        bestDelta = delta;
      }
    }
    const tempMessage = existingMessages[bestIndex];
    const replaced = {
      ...incoming,
      clientId: tempMessage.clientId || tempMessage.id,
    } satisfies ChatMessage;
    const updated = [...existingMessages];
    updated[bestIndex] = replaced;
    return sortAndCapRoomMessages(updated);
  }

  return sortAndCapRoomMessages([...existingMessages, incoming]);
};

export const setCurrentRoomMessagesInMap = (
  roomMessages: Record<string, ChatMessage[]>,
  currentRoomId: string,
  messages: ChatMessage[]
): Record<string, ChatMessage[]> => ({
  ...roomMessages,
  [currentRoomId]: sortAndCapRoomMessages(messages),
});

export const mergeIncomingRoomMessageInMap = (
  roomMessages: Record<string, ChatMessage[]>,
  roomId: string,
  message: ChatMessage
): Record<string, ChatMessage[]> | null => {
  const existingMessages = roomMessages[roomId] || [];
  const incoming: ChatMessage = {
    ...message,
    content: decodeHtmlEntities(String(message.content || "")),
  };
  const mergedMessages = mergeIncomingRoomMessage(existingMessages, incoming);
  if (!mergedMessages) {
    return null;
  }

  return {
    ...roomMessages,
    [roomId]: mergedMessages,
  };
};

export const removeRoomMessageFromMap = (
  roomMessages: Record<string, ChatMessage[]>,
  roomId: string,
  messageId: string
): { changed: boolean; roomMessages: Record<string, ChatMessage[]> } => {
  const existingMessages = roomMessages[roomId] || [];
  const updatedMessages = existingMessages.filter((message) => message.id !== messageId);
  if (updatedMessages.length >= existingMessages.length) {
    return { changed: false, roomMessages };
  }
  return {
    changed: true,
    roomMessages: {
      ...roomMessages,
      [roomId]: updatedMessages,
    },
  };
};

export const clearRoomMessagesInMap = (
  roomMessages: Record<string, ChatMessage[]>,
  roomId: string
): Record<string, ChatMessage[]> => ({
  ...roomMessages,
  [roomId]: [],
});

export const mergeFetchedMessagesForRoom = (
  roomMessages: Record<string, ChatMessage[]>,
  roomId: string,
  apiMessages: ApiChatMessagePayload[]
): Record<string, ChatMessage[]> => {
  const existing = roomMessages[roomId] || [];
  const fetchedMessages = normalizeApiMessages(apiMessages || []);
  const merged = mergeServerMessagesWithOptimistic(existing, fetchedMessages);

  return {
    ...roomMessages,
    [roomId]: merged,
  };
};

export const mergeFetchedBulkMessages = (
  roomMessages: Record<string, ChatMessage[]>,
  messagesMap: Record<string, ApiChatMessagePayload[]>
): Record<string, ChatMessage[]> => {
  const nextRoomMessages = { ...roomMessages };

  Object.entries(messagesMap).forEach(([roomId, messages]) => {
    const processed = normalizeApiMessages(messages);
    const existing = nextRoomMessages[roomId] || [];
    nextRoomMessages[roomId] = mergeServerMessagesWithOptimistic(
      existing,
      processed
    );
  });

  return nextRoomMessages;
};

export const buildPersistedRoomMessages = (
  roomMessages: Record<string, ChatMessage[]>
): Record<string, ChatMessage[]> =>
  Object.fromEntries(
    Object.entries(roomMessages).map(([roomId, messages]) => [
      roomId,
      capRoomMessages(messages),
    ])
  );

export const toggleBoolean = (value: boolean): boolean => !value;

export const resolveNextFontSize = (
  currentSize: number,
  sizeOrFn: number | ((prevSize: number) => number)
): number =>
  typeof sizeOrFn === "function" ? sizeOrFn(currentSize) : sizeOrFn;

export const sanitizeMessageRenderLimit = (limit: number): number =>
  Math.max(20, Math.floor(limit));

export const incrementUnreadCount = (
  unreadCounts: Record<string, number>,
  roomId: string
): Record<string, number> => ({
  ...unreadCounts,
  [roomId]: (unreadCounts[roomId] || 0) + 1,
});

export const clearUnreadCount = (
  unreadCounts: Record<string, number>,
  roomId: string
): Record<string, number> => {
  const { [roomId]: _removed, ...rest } = unreadCounts;
  return rest;
};

export interface CreateRoomPayload {
  type: "public" | "private";
  name?: string;
  members?: string[];
}

interface CreateRoomRequestParams {
  name: string;
  type: "public" | "private";
  members: string[];
  authToken: string;
  username: string;
  refreshAuthToken: RefreshTokenHandler;
}

export const createRoomRequest = async ({
  name,
  type,
  members,
  authToken,
  username,
  refreshAuthToken,
}: CreateRoomRequestParams): Promise<Response> => {
  const payload: CreateRoomPayload = { type };
  if (type === "public") {
    payload.name = name.trim();
  } else {
    payload.members = members;
  }

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${authToken}`,
    "X-Username": username,
  };

  return makeAuthenticatedRequest(
    "/api/rooms",
    {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    },
    refreshAuthToken
  );
};

interface DeleteRoomRequestParams {
  roomId: string;
  authToken: string;
  username: string;
  refreshAuthToken: RefreshTokenHandler;
}

export const deleteRoomRequest = async ({
  roomId,
  authToken,
  username,
  refreshAuthToken,
}: DeleteRoomRequestParams): Promise<Response> => {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${authToken}`,
    "X-Username": username,
  };

  return makeAuthenticatedRequest(
    `/api/rooms/${encodeURIComponent(roomId)}`,
    {
      method: "DELETE",
      headers,
    },
    refreshAuthToken
  );
};

export const createOptimisticChatMessage = (
  roomId: string,
  username: string,
  content: string
): ChatMessage => {
  const tempId = `temp_${Math.random().toString(36).substring(2, 9)}`;
  return {
    id: tempId,
    clientId: tempId,
    roomId,
    username,
    content,
    timestamp: Date.now(),
  };
};

interface SendRoomMessageRequestParams {
  roomId: string;
  content: string;
  username: string;
  authToken: string | null;
  refreshAuthToken: RefreshTokenHandler;
}

export const sendRoomMessageRequest = async ({
  roomId,
  content,
  username,
  authToken,
  refreshAuthToken,
}: SendRoomMessageRequestParams): Promise<Response> => {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
    headers["X-Username"] = username;
  }

  const messageUrl = `/api/rooms/${encodeURIComponent(roomId)}/messages`;
  const messageBody = JSON.stringify({ content });

  return authToken
    ? makeAuthenticatedRequest(
        messageUrl,
        {
          method: "POST",
          headers,
          body: messageBody,
        },
        refreshAuthToken
      )
    : abortableFetch(
        getApiUrl(messageUrl),
        withChatRequestDefaults({
          method: "POST",
          headers,
          body: messageBody,
        })
      );
};

interface CreateRoomFlowParams {
  name: string;
  type: "public" | "private";
  members: string[];
  username: string | null;
  authToken: string | null;
  ensureAuthToken: () => Promise<{ ok: boolean; error?: string }>;
  getCurrentAuthToken: () => string | null;
  refreshAuthToken: () => Promise<RefreshTokenResult>;
}

export const runCreateRoomFlow = async ({
  name,
  type,
  members,
  username,
  authToken,
  ensureAuthToken,
  getCurrentAuthToken,
  refreshAuthToken,
}: CreateRoomFlowParams): Promise<{ ok: boolean; error?: string; roomId?: string }> => {
  if (!username) {
    return { ok: false, error: "Username required" };
  }

  let effectiveAuthToken = authToken;
  if (!effectiveAuthToken) {
    const tokenResult = await ensureAuthToken();
    if (!tokenResult.ok) {
      return { ok: false, error: "Authentication required" };
    }
    effectiveAuthToken = getCurrentAuthToken();
  }

  if (!effectiveAuthToken) {
    return { ok: false, error: "Authentication required" };
  }

  try {
    const response = await createRoomRequest({
      name,
      type,
      members,
      authToken: effectiveAuthToken,
      username,
      refreshAuthToken,
    });

    if (!response.ok) {
      const errorData = await readErrorResponseBody(response);
      return {
        ok: false,
        error: errorData.error || "Failed to create room",
      };
    }

    const data = (await response.json()) as { room?: { id: string } };
    if (data.room?.id) {
      return { ok: true, roomId: data.room.id };
    }

    return { ok: false, error: "Invalid response format" };
  } catch (error) {
    console.error("[ChatsStore] Error creating room:", error);
    return { ok: false, error: "Network error. Please try again." };
  }
};

interface DeleteRoomFlowParams {
  roomId: string;
  username: string | null;
  authToken: string | null;
  refreshAuthToken: () => Promise<RefreshTokenResult>;
  onDeletedCurrentRoom: () => void;
}

export const runDeleteRoomFlow = async ({
  roomId,
  username,
  authToken,
  refreshAuthToken,
  onDeletedCurrentRoom,
}: DeleteRoomFlowParams): Promise<{ ok: boolean; error?: string }> => {
  if (!username || !authToken) {
    return { ok: false, error: "Authentication required" };
  }

  try {
    const response = await deleteRoomRequest({
      roomId,
      authToken,
      username,
      refreshAuthToken,
    });

    if (!response.ok) {
      const errorData = await readErrorResponseBody(response);
      return {
        ok: false,
        error: errorData.error || "Failed to delete room",
      };
    }

    onDeletedCurrentRoom();
    return { ok: true };
  } catch (error) {
    console.error("[ChatsStore] Error deleting room:", error);
    return { ok: false, error: "Network error. Please try again." };
  }
};

interface SendMessageFlowParams {
  roomId: string;
  content: string;
  username: string | null;
  authToken: string | null;
  refreshAuthToken: () => Promise<RefreshTokenResult>;
  addMessageToRoom: (roomId: string, message: ChatMessage) => void;
  removeMessageFromRoom: (roomId: string, messageId: string) => void;
}

export const runSendMessageFlow = async ({
  roomId,
  content,
  username,
  authToken,
  refreshAuthToken,
  addMessageToRoom,
  removeMessageFromRoom,
}: SendMessageFlowParams): Promise<{ ok: boolean; error?: string }> => {
  const trimmedContent = content.trim();
  if (!username || !trimmedContent) {
    return { ok: false, error: "Username and content required" };
  }

  const optimisticMessage = createOptimisticChatMessage(
    roomId,
    username,
    trimmedContent
  );
  addMessageToRoom(roomId, optimisticMessage);

  try {
    const response = await sendRoomMessageRequest({
      roomId,
      content: trimmedContent,
      username,
      authToken,
      refreshAuthToken,
    });

    if (!response.ok) {
      removeMessageFromRoom(roomId, optimisticMessage.id);
      const errorData = await readErrorResponseBody(response);
      return {
        ok: false,
        error: errorData.error || "Failed to send message",
      };
    }

    return { ok: true };
  } catch (error) {
    removeMessageFromRoom(roomId, optimisticMessage.id);
    console.error("[ChatsStore] Error sending message:", error);
    return { ok: false, error: "Network error. Please try again." };
  }
};

interface SyncPresenceOnRoomSwitchParams {
  previousRoomId: string | null;
  nextRoomId: string | null;
  username: string;
  onRoomsRefresh: () => void;
}

export const syncPresenceOnRoomSwitch = async ({
  previousRoomId,
  nextRoomId,
  username,
  onRoomsRefresh,
}: SyncPresenceOnRoomSwitchParams): Promise<void> => {
  try {
    const response = await abortableFetch(
      "/api/presence/switch",
      withChatRequestDefaults({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          previousRoomId,
          nextRoomId,
          username,
        }),
      })
    );

    if (!response.ok) {
      const errorData = await readErrorResponseBody(response);
      console.error("[ChatsStore] Error switching rooms:", errorData);
      return;
    }

    console.log("[ChatsStore] Room switch API call successful");
    setTimeout(() => {
      console.log("[ChatsStore] Refreshing rooms after switch");
      onRoomsRefresh();
    }, 50);
  } catch (error) {
    console.error("[ChatsStore] Network error switching rooms:", error);
  }
};
