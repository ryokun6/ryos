import type { AIChatMessage } from "@/types/chat";
import type { DisplayMessage } from "./messages";

/** Stable id for the display-only "Previous messages compacted" marker. */
export const MESSAGES_COMPACTED_MARKER_ID =
  "system:previous-messages-compacted";

/** Metadata kind for the compacted-history system row. */
export const MESSAGES_COMPACTED_KIND = "messages-compacted";

/**
 * Align with the server conversation cap (`MAX_MESSAGES` in
 * `api/ai/conversations/_helpers/store.ts`). Anonymous local history is
 * trimmed to this size so long chats don't grow forever.
 */
export const AI_MESSAGE_COMPACTION_MAX = 200;

export function isMessagesCompactedMarker(
  message: Pick<DisplayMessage, "id" | "role" | "metadata">
): boolean {
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

/**
 * Drop oldest turns (at user-message boundaries) when history exceeds the
 * compaction cap. Returns whether any messages were removed.
 */
export function compactAiMessages(
  messages: readonly AIChatMessage[],
  maxMessages: number = AI_MESSAGE_COMPACTION_MAX
): { messages: AIChatMessage[]; compacted: boolean } {
  if (messages.length <= maxMessages || maxMessages < 1) {
    return { messages: [...messages], compacted: false };
  }

  let cutIndex = messages.length - maxMessages;
  // Prefer cutting at a user turn so we don't leave a dangling assistant reply.
  while (cutIndex < messages.length && messages[cutIndex]?.role !== "user") {
    cutIndex += 1;
  }
  if (cutIndex <= 0 || cutIndex >= messages.length) {
    return {
      messages: messages.slice(-maxMessages),
      compacted: true,
    };
  }

  return {
    messages: messages.slice(cutIndex),
    compacted: true,
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
