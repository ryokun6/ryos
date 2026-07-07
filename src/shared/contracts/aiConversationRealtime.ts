import {
  AI_CONVERSATION_OPERATION_ID_MAX_LENGTH,
  isAIConversationChannel,
  type AIConversationChannel,
} from "./aiConversation";

export const AI_CONVERSATION_REALTIME_EVENT = "ai-conversation";
export const AI_CONVERSATION_REALTIME_MAX_CHUNKS = 64;
export const AI_CONVERSATION_REALTIME_MAX_DELTA_CODE_POINTS = 2_048;
export const AI_CONVERSATION_REALTIME_MAX_IDENTIFIER_LENGTH = 512;

const MAX_STARTED_AT_LENGTH = 64;

export type AIConversationRealtimeTrigger =
  | "submit-message"
  | "regenerate-message";

export interface AIConversationRealtimeTurn {
  channel: AIConversationChannel;
  conversationId: string;
  revision: number;
  operationId: string;
  trigger: AIConversationRealtimeTrigger;
  targetMessageId?: string;
  startedAt: string;
}

export type AIConversationRealtimeChunk =
  | { kind: "start"; messageId: string }
  | { kind: "text-start"; id: string }
  | { kind: "text-delta"; id: string; delta: string }
  | { kind: "text-end"; id: string };

export type AIConversationRealtimeEvent =
  | ({ kind: "turn-started" } & AIConversationRealtimeTurn)
  | ({
      kind: "stream-chunks";
      sequence: number;
      chunks: AIConversationRealtimeChunk[];
    } & AIConversationRealtimeTurn)
  | ({
      kind: "turn-finished";
      outcome: "completed" | "failed";
    } & AIConversationRealtimeTurn)
  | {
      kind: "conversation-updated";
      reason: "imported" | "reset";
      channel: AIConversationChannel;
      conversationId: string;
      revision: number;
      operationId: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBoundedIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= AI_CONVERSATION_REALTIME_MAX_IDENTIFIER_LENGTH
  );
}

function isRevision(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0
  );
}

function isOperationId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= AI_CONVERSATION_OPERATION_ID_MAX_LENGTH
  );
}

function isTrigger(value: unknown): value is AIConversationRealtimeTrigger {
  return value === "submit-message" || value === "regenerate-message";
}

function parseTurn(
  value: Record<string, unknown>
): AIConversationRealtimeTurn | null {
  if (
    !isAIConversationChannel(value.channel) ||
    !isBoundedIdentifier(value.conversationId) ||
    !isRevision(value.revision) ||
    !isOperationId(value.operationId) ||
    !isTrigger(value.trigger) ||
    typeof value.startedAt !== "string" ||
    value.startedAt.length === 0 ||
    value.startedAt.length > MAX_STARTED_AT_LENGTH ||
    !Number.isFinite(Date.parse(value.startedAt)) ||
    (value.trigger === "regenerate-message" &&
      !isBoundedIdentifier(value.targetMessageId)) ||
    (value.trigger === "submit-message" &&
      value.targetMessageId !== undefined) ||
    (value.targetMessageId !== undefined &&
      !isBoundedIdentifier(value.targetMessageId))
  ) {
    return null;
  }

  return {
    channel: value.channel,
    conversationId: value.conversationId,
    revision: value.revision,
    operationId: value.operationId,
    trigger: value.trigger,
    ...(value.targetMessageId === undefined
      ? {}
      : { targetMessageId: value.targetMessageId }),
    startedAt: value.startedAt,
  };
}

function parseChunk(value: unknown): AIConversationRealtimeChunk | null {
  if (!isRecord(value)) return null;

  switch (value.kind) {
    case "start":
      return isBoundedIdentifier(value.messageId)
        ? { kind: "start", messageId: value.messageId }
        : null;
    case "text-start":
    case "text-end":
      return isBoundedIdentifier(value.id)
        ? { kind: value.kind, id: value.id }
        : null;
    case "text-delta":
      return isBoundedIdentifier(value.id) &&
        typeof value.delta === "string" &&
        value.delta.length > 0 &&
        [...value.delta].length <=
          AI_CONVERSATION_REALTIME_MAX_DELTA_CODE_POINTS
        ? { kind: "text-delta", id: value.id, delta: value.delta }
        : null;
    default:
      return null;
  }
}

export function parseAIConversationRealtimeEvent(
  value: unknown
): AIConversationRealtimeEvent | null {
  if (!isRecord(value)) return null;

  if (value.kind === "conversation-updated") {
    if (
      (value.reason !== "imported" && value.reason !== "reset") ||
      !isAIConversationChannel(value.channel) ||
      !isBoundedIdentifier(value.conversationId) ||
      !isRevision(value.revision) ||
      !isOperationId(value.operationId)
    ) {
      return null;
    }
    return {
      kind: "conversation-updated",
      reason: value.reason,
      channel: value.channel,
      conversationId: value.conversationId,
      revision: value.revision,
      operationId: value.operationId,
    };
  }

  const turn = parseTurn(value);
  if (!turn) return null;

  switch (value.kind) {
    case "turn-started":
      return { kind: "turn-started", ...turn };
    case "stream-chunks": {
      if (
        !isRevision(value.sequence) ||
        !Array.isArray(value.chunks) ||
        value.chunks.length === 0 ||
        value.chunks.length > AI_CONVERSATION_REALTIME_MAX_CHUNKS
      ) {
        return null;
      }
      const chunks: AIConversationRealtimeChunk[] = [];
      for (const rawChunk of value.chunks) {
        const chunk = parseChunk(rawChunk);
        if (!chunk) return null;
        chunks.push(chunk);
      }
      return {
        kind: "stream-chunks",
        ...turn,
        sequence: value.sequence,
        chunks,
      };
    }
    case "turn-finished":
      return value.outcome === "completed" || value.outcome === "failed"
        ? { kind: "turn-finished", ...turn, outcome: value.outcome }
        : null;
    default:
      return null;
  }
}
