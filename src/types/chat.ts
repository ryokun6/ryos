import { type UIMessage } from "@ai-sdk/react";
export type {
  ChatMessage,
  ChatRoom,
  ChatUser as User,
} from "@/shared/contracts/chat";

// Message metadata for AI chat
export interface MessageMetadata extends Record<string, unknown> {
  createdAt: Date;
}

// AI chat message type with metadata
export type AIChatMessage = UIMessage<MessageMetadata>;
