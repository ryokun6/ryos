import type { UIMessage } from "ai";

export const AI_CONVERSATION_CHANNELS = ["chat", "assistant"] as const;
export const AI_CONVERSATION_OPERATION_ID_MAX_LENGTH = 128;

/**
 * Server-persisted proactive greeting messages are identified by this id
 * prefix. The prefix predates server-owned history (older clients minted
 * local-only `proactive-*` ids), so both sides share one definition.
 */
export const AI_PROACTIVE_GREETING_MESSAGE_ID_PREFIX = "proactive-";

/**
 * Minimum idle time since the last conversation message before a proactive
 * greeting may be appended to an existing thread.
 */
export const AI_PROACTIVE_GREETING_STALE_AFTER_MS = 5 * 60 * 1000;

export function isAIProactiveGreetingMessageId(id: unknown): boolean {
  return (
    typeof id === "string" &&
    id.startsWith(AI_PROACTIVE_GREETING_MESSAGE_ID_PREFIX)
  );
}

export type AIConversationChannel =
  (typeof AI_CONVERSATION_CHANNELS)[number];

export function isAIConversationChannel(
  value: unknown
): value is AIConversationChannel {
  return value === "chat" || value === "assistant";
}

export type AIConversationPart = UIMessage["parts"][number];

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
