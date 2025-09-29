import { type UIMessage } from "@ai-sdk/react";

// Message metadata for AI chat
export interface MessageMetadata extends Record<string, unknown> {
  createdAt: Date;
}

// AI chat message type with metadata
export type AIChatMessage = UIMessage<MessageMetadata>;

export type ChatMessage = {
  id: string; // Server message ID
  clientId?: string; // Stable client-side ID used for optimistic rendering
  roomId: string;
  username: string;
  content: string;
  timestamp: number;
};

export type ChatRoom = {
  id: string;
  name: string;
  type?: "public" | "private"; // optional for backward compatibility
  createdAt: number;
  userCount: number;
  users?: string[];
  members?: string[]; // for private rooms - list of usernames who can access
};

export type User = {
  username: string;
  lastActive: number;
};
