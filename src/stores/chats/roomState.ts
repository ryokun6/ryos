import type { ChatMessage, ChatRoom } from "@/types/chat";
import { decodeHtmlEntities } from "@/utils/html";
import { mergeIncomingRoomMessage } from "./incomingMessageMerge";
import { sortAndCapRoomMessages } from "./roomMessages";

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
