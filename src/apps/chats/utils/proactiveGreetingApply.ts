import type { AIChatMessage } from "@/types/chat";

export const isDefaultGreetingMessage = (message: AIChatMessage): boolean =>
  message.id === "1" && message.role === "assistant";

export function shouldApplyFreshProactiveGreeting(
  currentMessages: AIChatMessage[]
): boolean {
  return currentMessages.some(isDefaultGreetingMessage);
}

/**
 * Replace only the default greeting in-place so user/assistant messages and
 * any in-flight assistant stream are preserved.
 */
export function applyFreshProactiveGreeting(
  currentMessages: AIChatMessage[],
  proactiveMessage: AIChatMessage
): AIChatMessage[] | null {
  if (!shouldApplyFreshProactiveGreeting(currentMessages)) {
    return null;
  }

  const greetingIndex = currentMessages.findIndex(isDefaultGreetingMessage);
  if (greetingIndex === -1) return null;

  const updated = [...currentMessages];
  updated[greetingIndex] = proactiveMessage;
  return updated;
}
