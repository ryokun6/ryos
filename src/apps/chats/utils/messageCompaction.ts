import type { AIChatMessage } from "@/types/chat";
import type { DisplayMessage } from "./messages";
import {
  compactMessagesByTokenBudget,
  compactMessagesForModelContext,
} from "@/shared/aiConversationCompaction";
import {
  AI_CHAT_COMPACTION_MESSAGE_SAFETY_MAX,
  DEFAULT_AI_MODEL,
  type SupportedModel,
} from "@/shared/aiModels";

/** Stable id for the display-only "Previous messages compacted" marker. */
export const MESSAGES_COMPACTED_MARKER_ID =
  "system:previous-messages-compacted";

/** Metadata kind for the compacted-history system row. */
export const MESSAGES_COMPACTED_KIND = "messages-compacted";

/**
 * Absolute message-count safety net. Primary compaction uses the selected
 * model's context-window token budget.
 */
export const AI_MESSAGE_COMPACTION_MAX = AI_CHAT_COMPACTION_MESSAGE_SAFETY_MAX;

export function isMessagesCompactedMarker(message: {
  id?: string;
  role: string;
  metadata?: { kind?: unknown; [key: string]: unknown };
}): boolean {
  return (
    message.role === "system" &&
    (message.id === MESSAGES_COMPACTED_MARKER_ID ||
      message.metadata?.kind === MESSAGES_COMPACTED_KIND)
  );
}

/** Singleton so React.memo sees a stable reference across rebuilds. */
export const COMPACTED_MESSAGES_MARKER: DisplayMessage = {
  id: MESSAGES_COMPACTED_MARKER_ID,
  role: "system",
  parts: [{ type: "text", text: "" }],
  metadata: {
    createdAt: new Date(0),
    kind: MESSAGES_COMPACTED_KIND,
  },
};

export interface CompactAiMessagesOptions {
  modelId?: SupportedModel | null;
  /** Explicit conversation-history token budget (overrides model derivation). */
  maxTokens?: number;
  maxMessages?: number;
  systemTokenEstimate?: number;
}

/**
 * Drop oldest turns when history exceeds the selected model's conversation
 * token budget (context window minus reserved output / safety). Cuts only at
 * user-message boundaries.
 */
export function compactAiMessages(
  messages: readonly AIChatMessage[],
  options: CompactAiMessagesOptions = {}
): {
  messages: AIChatMessage[];
  compacted: boolean;
  estimatedTokens: number;
} {
  if (typeof options.maxTokens === "number") {
    const budgeted = compactMessagesByTokenBudget(messages, {
      maxTokens: options.maxTokens,
      maxMessages: options.maxMessages,
    });
    return {
      messages: budgeted.messages as AIChatMessage[],
      compacted: budgeted.compacted,
      estimatedTokens: budgeted.estimatedTokens,
    };
  }

  const result = compactMessagesForModelContext(messages, {
    modelId: options.modelId ?? DEFAULT_AI_MODEL,
    maxMessages: options.maxMessages,
    systemTokenEstimate: options.systemTokenEstimate,
  });
  return {
    messages: result.messages as AIChatMessage[],
    compacted: result.compacted,
    estimatedTokens: result.estimatedTokens,
  };
}

export function withCompactedMessagesMarker(
  messages: DisplayMessage[],
  showMarker: boolean
): DisplayMessage[] {
  if (!showMarker || messages.length === 0) return messages;
  if (messages.some(isMessagesCompactedMarker)) return messages;
  return [COMPACTED_MESSAGES_MARKER, ...messages];
}
