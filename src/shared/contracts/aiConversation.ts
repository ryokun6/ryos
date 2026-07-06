import type {
  FileUIPart,
  SourceDocumentUIPart,
  SourceUrlUIPart,
  TextUIPart,
  ToolUIPart,
} from "ai";

export const AI_CONVERSATION_CHANNELS = ["chat", "assistant"] as const;

export type AIConversationChannel =
  (typeof AI_CONVERSATION_CHANNELS)[number];

export function isAIConversationChannel(
  value: unknown
): value is AIConversationChannel {
  return value === "chat" || value === "assistant";
}

export type AIConversationTextPart = TextUIPart;

export type AIConversationPart =
  | AIConversationTextPart
  | FileUIPart
  | ToolUIPart
  | SourceUrlUIPart
  | SourceDocumentUIPart;

export interface AIConversationMessage {
  id: string;
  seq: number;
  role: "user" | "assistant";
  parts: AIConversationPart[];
  createdAt: string;
}

export interface AIConversation {
  id: string;
  channel: AIConversationChannel;
  revision: number;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  oldestSeq: number | null;
  newestSeq: number | null;
  historyTruncated: boolean;
  canImportLegacy: boolean;
}

export interface AIConversationPage {
  owner: string;
  conversation: AIConversation;
  messages: AIConversationMessage[];
  page: {
    nextCursor: string | null;
    hasMore: boolean;
  };
}

export interface AIConversationRequestContext {
  id: string;
  revision: number;
  operationId: string;
}

export interface AIConversationResetResult {
  owner: string;
  conversation: AIConversation;
  reset: boolean;
}
