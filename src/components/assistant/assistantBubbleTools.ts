import type { ToolInvocationPart } from "@/components/shared/tool-invocation-message/types";

/**
 * Tool calls that get a rich inline embed inside the assistant's speech
 * bubble (the same cards the Chats app renders): map place results, weather
 * cards, HTML preview applets, and Cursor cloud-agent runs. Other tools keep
 * their ticker-only treatment.
 */
export const ASSISTANT_BUBBLE_TOOL_NAMES: ReadonlySet<string> = new Set([
  "mapsSearchPlaces",
  "getWeather",
  "generateHtml",
  "cursorCloudAgent",
  "listCursorCloudAgentRuns",
  // Approval-gated: the Allow / Don't Allow permission card must render in
  // the bubble, otherwise a getPreciseLocation request dead-ends there.
  "getPreciseLocation",
]);

/** Message shape needed to extract bubble tool parts (subset of AIChatMessage). */
export interface AssistantBubbleMessageLike {
  role: string;
  parts?: Array<{ type: string }>;
}

/**
 * Embeddable tool parts of a (possibly in-flight) assistant message. Returns
 * an empty list for user messages, so the embeds clear as soon as a new turn
 * is submitted and reappear live while the next turn streams its tool calls.
 */
export function getAssistantBubbleToolParts(
  message: AssistantBubbleMessageLike | undefined
): ToolInvocationPart[] {
  if (!message || message.role !== "assistant" || !Array.isArray(message.parts)) {
    return [];
  }
  return message.parts.filter(
    (part): part is ToolInvocationPart =>
      typeof part.type === "string" &&
      part.type.startsWith("tool-") &&
      ASSISTANT_BUBBLE_TOOL_NAMES.has(part.type.slice(5))
  );
}
