import type { AIChatMessage } from "@/types/chat";
import type {
  AIConversationRealtimeEvent,
  AIConversationRealtimeTurn,
} from "@/shared/contracts/aiConversationRealtime";

export type AIConversationRealtimeStreamEvent = Extract<
  AIConversationRealtimeEvent,
  { kind: "stream-chunks" }
>;

export interface RemoteAIConversationStream {
  turn: AIConversationRealtimeTurn;
  nextSequence: number;
  messageId: string | null;
  preparedMessage: boolean;
  textPartIndexes: Map<string, number>;
}

export type ApplyRemoteAIConversationStreamResult =
  | {
      kind: "applied";
      stream: RemoteAIConversationStream;
      messages: AIChatMessage[];
    }
  | { kind: "gap" };

export function createRemoteAIConversationStream(
  turn: AIConversationRealtimeTurn
): RemoteAIConversationStream {
  return {
    turn,
    nextSequence: 0,
    messageId: null,
    preparedMessage: false,
    textPartIndexes: new Map(),
  };
}

export function isSameRemoteAIConversationTurn(
  stream: RemoteAIConversationStream,
  event: Pick<
    AIConversationRealtimeTurn,
    "channel" | "conversationId" | "operationId"
  >
): boolean {
  return (
    stream.turn.channel === event.channel &&
    stream.turn.conversationId === event.conversationId &&
    stream.turn.operationId === event.operationId
  );
}

function prepareResponseMessage({
  messages,
  stream,
  messageId,
}: {
  messages: readonly AIChatMessage[];
  stream: RemoteAIConversationStream;
  messageId: string;
}): AIChatMessage[] | null {
  let nextMessages = [...messages];
  if (
    !stream.preparedMessage &&
    stream.turn.trigger === "regenerate-message" &&
    stream.turn.targetMessageId
  ) {
    const targetIndex = nextMessages.findIndex(
      (message) => message.id === stream.turn.targetMessageId
    );
    if (targetIndex >= 0) {
      nextMessages =
        nextMessages[targetIndex]?.role === "assistant"
          ? nextMessages.slice(0, targetIndex)
          : nextMessages.slice(0, targetIndex + 1);
    }
  }

  const existingIndex = nextMessages.findIndex(
    (message) => message.id === messageId
  );
  if (existingIndex >= 0) {
    const existing = nextMessages[existingIndex];
    if (!existing || existing.role !== "assistant") return null;
    nextMessages[existingIndex] = {
      ...existing,
      parts: [...existing.parts],
    };
  } else {
    nextMessages.push({
      id: messageId,
      role: "assistant",
      parts: [],
      metadata: { createdAt: new Date(stream.turn.startedAt) },
    });
  }
  return nextMessages;
}

function updateResponseMessage(
  messages: AIChatMessage[],
  messageId: string,
  update: (message: AIChatMessage) => AIChatMessage | null
): AIChatMessage[] | null {
  const messageIndex = messages.findIndex(
    (message) => message.id === messageId
  );
  const message = messages[messageIndex];
  if (messageIndex < 0 || !message || message.role !== "assistant") return null;
  const updated = update(message);
  if (!updated) return null;
  const nextMessages = [...messages];
  nextMessages[messageIndex] = updated;
  return nextMessages;
}

export function applyRemoteAIConversationStreamEvent({
  stream,
  event,
  messages,
}: {
  stream: RemoteAIConversationStream;
  event: AIConversationRealtimeStreamEvent;
  messages: readonly AIChatMessage[];
}): ApplyRemoteAIConversationStreamResult {
  if (
    !isSameRemoteAIConversationTurn(stream, event) ||
    event.sequence !== stream.nextSequence
  ) {
    return { kind: "gap" };
  }

  const nextStream: RemoteAIConversationStream = {
    ...stream,
    nextSequence: stream.nextSequence + 1,
    textPartIndexes: new Map(stream.textPartIndexes),
  };
  let nextMessages = [...messages];

  for (const chunk of event.chunks) {
    switch (chunk.kind) {
      case "start": {
        if (nextStream.messageId && nextStream.messageId !== chunk.messageId) {
          return { kind: "gap" };
        }
        if (!nextStream.preparedMessage) {
          const prepared = prepareResponseMessage({
            messages: nextMessages,
            stream: nextStream,
            messageId: chunk.messageId,
          });
          if (!prepared) return { kind: "gap" };
          nextMessages = prepared;
          nextStream.preparedMessage = true;
        }
        nextStream.messageId = chunk.messageId;
        break;
      }
      case "text-start": {
        if (!nextStream.messageId || !nextStream.preparedMessage) {
          return { kind: "gap" };
        }
        const partIndex = nextStream.textPartIndexes.get(chunk.id);
        if (partIndex !== undefined) break;
        const updated = updateResponseMessage(
          nextMessages,
          nextStream.messageId,
          (message) => {
            const nextParts = [...message.parts, { type: "text" as const, text: "" }];
            nextStream.textPartIndexes.set(chunk.id, nextParts.length - 1);
            return { ...message, parts: nextParts };
          }
        );
        if (!updated) return { kind: "gap" };
        nextMessages = updated;
        break;
      }
      case "text-delta": {
        if (!nextStream.messageId || !nextStream.preparedMessage) {
          return { kind: "gap" };
        }
        let partIndex = nextStream.textPartIndexes.get(chunk.id);
        const updated = updateResponseMessage(
          nextMessages,
          nextStream.messageId,
          (message) => {
            const nextParts = [...message.parts];
            if (partIndex === undefined) {
              nextParts.push({ type: "text", text: "" });
              partIndex = nextParts.length - 1;
              nextStream.textPartIndexes.set(chunk.id, partIndex);
            }
            const part = nextParts[partIndex];
            if (!part || part.type !== "text") return null;
            nextParts[partIndex] = { ...part, text: `${part.text}${chunk.delta}` };
            return { ...message, parts: nextParts };
          }
        );
        if (!updated) return { kind: "gap" };
        nextMessages = updated;
        break;
      }
      case "text-end":
        break;
      default: {
        const exhaustive: never = chunk;
        return exhaustive;
      }
    }
  }

  return { kind: "applied", stream: nextStream, messages: nextMessages };
}
