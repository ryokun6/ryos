import type { AIChatMessage } from "@/types/chat";
import { getAssistantVisibleText } from "@/apps/chats/utils/aiMessageText";

function hasToolPart(message: AIChatMessage): boolean {
  return (
    Array.isArray(message.parts) &&
    message.parts.some(
      (part) =>
        typeof part.type === "string" &&
        (part.type.startsWith("tool-") || part.type === "dynamic-tool")
    )
  );
}

/**
 * Whether the bubble should show the thinking ticker instead of reply text.
 *
 * A tool-calling turn is not over when a stream ends: the AI SDK sets the
 * status to "ready" while client tools are still executing (their outputs
 * arrive via addToolOutput afterwards) and again for a beat before
 * sendAutomaticallyWhen fires the follow-up request. Treating those windows
 * as "turn finished" made the bubble flash its empty state — and collapse,
 * displacing side-placed bubbles whose position depends on the bubble
 * height — mid-reply. An assistant message that has tool calls but no
 * visible text therefore still counts as awaiting the reply.
 */
export function resolveAssistantAwaitingReply({
  messages,
  isLoading,
  hasError,
}: {
  messages: AIChatMessage[];
  isLoading: boolean;
  hasError: boolean;
}): boolean {
  const last = messages[messages.length - 1];
  if (isLoading) {
    if (!last || last.role !== "assistant") return true;
    return !getAssistantVisibleText(last).trim();
  }
  if (hasError) return false;
  if (!last || last.role !== "assistant") return false;
  if (getAssistantVisibleText(last).trim()) return false;
  return hasToolPart(last);
}
