import type { ChatMessage } from "@/types/chat";
import {
  type ApiChatMessagePayload,
  normalizeApiMessages,
} from "./messageNormalization";
import { mergeServerMessagesWithOptimistic } from "./roomMessages";

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
