import type { ChatMessage } from "@/types/chat";
import { decodeHtmlEntities } from "@/utils/html";

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
