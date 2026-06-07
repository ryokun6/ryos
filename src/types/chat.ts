import { type UIMessage } from "@ai-sdk/react";
import type {
  ChatMessage as SharedChatMessage,
  ChatRoom as SharedChatRoom,
  User as SharedUser,
} from "@/shared/contracts/chat";

// Message metadata for AI chat
export interface MessageMetadata extends Record<string, unknown> {
  createdAt: Date;
}

// AI chat message type with metadata
export type AIChatMessage = UIMessage<MessageMetadata>;

export type ChatMessage = SharedChatMessage;

export type ChatRoom = SharedChatRoom;

export type User = SharedUser;
