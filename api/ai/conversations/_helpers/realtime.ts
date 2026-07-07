import {
  AI_CONVERSATION_REALTIME_EVENT,
  AI_CONVERSATION_REALTIME_MAX_CHUNKS,
  AI_CONVERSATION_REALTIME_MAX_DELTA_CODE_POINTS,
  AI_CONVERSATION_REALTIME_MAX_IDENTIFIER_LENGTH,
  type AIConversationRealtimeChunk,
  type AIConversationRealtimeEvent,
  type AIConversationRealtimeTurn,
} from "../../../../src/shared/contracts/aiConversationRealtime.js";
import { getChatsUserChannelName } from "../../../../src/shared/constants/realtime.js";
import { triggerRealtimeEvent } from "../../../_utils/realtime.js";

const REALTIME_BATCH_MAX_BYTES = 7 * 1024;
const REALTIME_DELTA_MAX_BYTES = 2 * 1024;
const REALTIME_FLUSH_INTERVAL_MS = 120;
const encoder = new TextEncoder();

export type PublishAIConversationRealtimeEvent = (
  event: AIConversationRealtimeEvent
) => Promise<void>;

export async function broadcastAIConversationRealtimeEvent(
  username: string,
  event: AIConversationRealtimeEvent
): Promise<void> {
  await triggerRealtimeEvent(
    getChatsUserChannelName(username),
    AI_CONVERSATION_REALTIME_EVENT,
    event
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonByteLength(value: unknown): number {
  try {
    return encoder.encode(JSON.stringify(value)).byteLength;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function splitTextDelta(id: string, delta: string): string[] {
  const pieces: string[] = [];
  let current = "";
  let currentCodePoints = 0;

  for (const codePoint of delta) {
    const candidate = `${current}${codePoint}`;
    if (
      current &&
      (currentCodePoints >= AI_CONVERSATION_REALTIME_MAX_DELTA_CODE_POINTS ||
        jsonByteLength({ kind: "text-delta", id, delta: candidate }) >
          REALTIME_DELTA_MAX_BYTES)
    ) {
      pieces.push(current);
      current = "";
      currentCodePoints = 0;
    }
    current += codePoint;
    currentCodePoints += 1;
  }
  if (current) pieces.push(current);
  return pieces;
}

function parseSseUIChunk(raw: string): Record<string, unknown> | null {
  const line = raw
    .split("\n")
    .find((candidate) => candidate.startsWith("data: "));
  if (!line) return null;
  const data = line.slice("data: ".length);
  if (data === "[DONE]") return null;
  try {
    const parsed: unknown = JSON.parse(data);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function toRealtimeChunks(
  chunk: Record<string, unknown>
): AIConversationRealtimeChunk[] {
  const isBoundedIdentifier = (value: unknown): value is string =>
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= AI_CONVERSATION_REALTIME_MAX_IDENTIFIER_LENGTH;

  switch (chunk.type) {
    case "start":
      return isBoundedIdentifier(chunk.messageId)
        ? [{ kind: "start", messageId: chunk.messageId }]
        : [];
    case "text-start":
    case "text-end":
      return isBoundedIdentifier(chunk.id)
        ? [{ kind: chunk.type, id: chunk.id }]
        : [];
    case "text-delta":
      if (
        !isBoundedIdentifier(chunk.id) ||
        typeof chunk.delta !== "string" ||
        !chunk.delta
      ) {
        return [];
      }
      return splitTextDelta(chunk.id, chunk.delta).map((delta) => ({
        kind: "text-delta",
        id: chunk.id,
        delta,
      }));
    default:
      return [];
  }
}

function appendChunk(
  chunks: AIConversationRealtimeChunk[],
  incoming: AIConversationRealtimeChunk
): AIConversationRealtimeChunk[] {
  const previous = chunks.at(-1);
  if (
    previous?.kind === "text-delta" &&
    incoming.kind === "text-delta" &&
    previous.id === incoming.id
  ) {
    const combined = `${previous.delta}${incoming.delta}`;
    if (
      encoder.encode(combined).byteLength <= REALTIME_DELTA_MAX_BYTES &&
      [...combined].length <=
        AI_CONVERSATION_REALTIME_MAX_DELTA_CODE_POINTS
    ) {
      return [
        ...chunks.slice(0, -1),
        { kind: "text-delta", id: previous.id, delta: combined },
      ];
    }
  }
  return [...chunks, incoming];
}

export async function forwardAIConversationRealtimeStream({
  stream,
  turn,
  getTerminalEvent,
  publish,
  onError,
  onStreamError,
}: {
  stream: ReadableStream<string>;
  turn: AIConversationRealtimeTurn;
  getTerminalEvent: () => AIConversationRealtimeEvent | null;
  publish: PublishAIConversationRealtimeEvent;
  onError?: (error: unknown) => void;
  onStreamError?: (error: unknown) => Promise<void>;
}): Promise<void> {
  const reader = stream.getReader();
  let chunks: AIConversationRealtimeChunk[] = [];
  let sequence = 0;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingTimedFlush: Promise<void> | null = null;
  let publishChain = Promise.resolve();

  const safePublish = (event: AIConversationRealtimeEvent): Promise<void> => {
    publishChain = publishChain
      .then(() => publish(event))
      .catch((error) => {
        onError?.(error);
      });
    return publishChain;
  };

  const clearFlushTimer = () => {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = null;
  };

  const flush = async () => {
    clearFlushTimer();
    if (chunks.length === 0) return;
    const event: AIConversationRealtimeEvent = {
      kind: "stream-chunks",
      ...turn,
      sequence,
      chunks,
    };
    chunks = [];
    if (jsonByteLength(event) > REALTIME_BATCH_MAX_BYTES) {
      onError?.(new Error("Realtime conversation batch exceeds payload limit"));
      return;
    }
    sequence += 1;
    await safePublish(event);
  };

  const scheduleFlush = () => {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      const timedFlush = flush();
      pendingTimedFlush = timedFlush;
      void timedFlush.finally(() => {
        if (pendingTimedFlush === timedFlush) pendingTimedFlush = null;
      });
    }, REALTIME_FLUSH_INTERVAL_MS);
  };

  const queueChunk = async (chunk: AIConversationRealtimeChunk) => {
    const nextChunks = appendChunk(chunks, chunk);
    const candidate: AIConversationRealtimeEvent = {
      kind: "stream-chunks",
      ...turn,
      sequence,
      chunks: nextChunks,
    };
    if (
      chunks.length > 0 &&
      (nextChunks.length > AI_CONVERSATION_REALTIME_MAX_CHUNKS ||
        jsonByteLength(candidate) > REALTIME_BATCH_MAX_BYTES)
    ) {
      await flush();
      const singletonEvent: AIConversationRealtimeEvent = {
        kind: "stream-chunks",
        ...turn,
        sequence,
        chunks: [chunk],
      };
      if (jsonByteLength(singletonEvent) > REALTIME_BATCH_MAX_BYTES) {
        onError?.(
          new Error("Realtime conversation chunk exceeds payload limit")
        );
        return;
      }
      chunks = [chunk];
    } else if (
      chunks.length === 0 &&
      jsonByteLength(candidate) > REALTIME_BATCH_MAX_BYTES
    ) {
      onError?.(new Error("Realtime conversation chunk exceeds payload limit"));
      return;
    } else {
      chunks = nextChunks;
    }

    if (
      chunk.kind === "start" ||
      chunk.kind === "text-end"
    ) {
      await flush();
    } else {
      scheduleFlush();
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const uiChunk = parseSseUIChunk(value);
      if (!uiChunk) continue;
      for (const realtimeChunk of toRealtimeChunks(uiChunk)) {
        await queueChunk(realtimeChunk);
      }
    }
  } catch (error) {
    onError?.(error);
    await onStreamError?.(error);
  } finally {
    reader.releaseLock();
  }

  clearFlushTimer();
  const timedFlush = pendingTimedFlush;
  if (timedFlush) await timedFlush;
  await flush();
  await publishChain;
  await safePublish(
    getTerminalEvent() ?? {
      kind: "turn-finished",
      ...turn,
      outcome: "failed",
    }
  );
}
