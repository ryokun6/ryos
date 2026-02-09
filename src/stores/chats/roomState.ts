import type { ChatMessage, ChatRoom } from "@/types/chat";
import { decodeHtmlEntities } from "@/utils/html";
import {
  type ApiChatMessagePayload,
  normalizeApiMessages,
} from "./messagePayloads";

const MESSAGE_HISTORY_CAP = 500;
const MATCH_WINDOW_MS = 10_000;
const INCOMING_TEMP_MATCH_WINDOW_MS = 5_000;

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
