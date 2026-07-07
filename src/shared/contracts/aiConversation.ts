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
}

/**
 * Full or delta view of the canonical conversation. When requested with
 * `afterSeq`, `messages` contains only messages whose `seq` is greater than
 * the requested value (content updates re-mint `seq`, so they are included).
 */
export interface AIConversationSnapshot {
  owner: string;
  conversation: AIConversation;
  messages: AIConversationMessage[];
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

// ---------------------------------------------------------------------------
// Realtime cross-device updates
// ---------------------------------------------------------------------------

/**
 * Event emitted on the owner's `private-ai-…` realtime channel whenever the
 * canonical server conversation changes, so other signed-in devices can
 * re-hydrate live instead of waiting for the next focus refresh.
 */
export const AI_CONVERSATION_UPDATED_REALTIME_EVENT =
  "ai-conversation-updated";

export const AI_CONVERSATION_UPDATE_REASONS = [
  "turn-begin",
  "turn-complete",
  "greeting",
  "reset",
] as const;

export type AIConversationUpdateReason =
  (typeof AI_CONVERSATION_UPDATE_REASONS)[number];

export interface AIConversationUpdatedRealtimeEvent {
  channel: AIConversationChannel;
  conversationId: string;
  revision: number;
  reason: AIConversationUpdateReason;
  /**
   * The operation that produced this update. Turn events carry the
   * client-minted operation id, letting the originating device recognize and
   * skip its own echo.
   */
  operationId: string;
}

export function parseAIConversationUpdatedRealtimeEvent(
  value: unknown
): AIConversationUpdatedRealtimeEvent | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const channel = Reflect.get(value, "channel");
  const conversationId = Reflect.get(value, "conversationId");
  const revision = Reflect.get(value, "revision");
  const reason = Reflect.get(value, "reason");
  const operationId = Reflect.get(value, "operationId");
  if (
    !isAIConversationChannel(channel) ||
    typeof conversationId !== "string" ||
    conversationId.length === 0 ||
    typeof revision !== "number" ||
    !Number.isSafeInteger(revision) ||
    revision < 0 ||
    !AI_CONVERSATION_UPDATE_REASONS.includes(
      reason as AIConversationUpdateReason
    ) ||
    typeof operationId !== "string" ||
    operationId.length === 0
  ) {
    return null;
  }
  return {
    channel,
    conversationId,
    revision,
    reason: reason as AIConversationUpdateReason,
    operationId,
  };
}
