import type { AIChatMessage } from "@/types/chat";

const isDefaultGreeting = (message: AIChatMessage): boolean =>
  message.id === "1" && message.role === "assistant";

export function shouldApplyFreshProactiveGreeting(
  currentMessages: AIChatMessage[],
  options: { suppressed: boolean }
): boolean {
  if (options.suppressed) return false;
  return currentMessages.some(isDefaultGreeting);
}

/**
 * Replace only the default greeting in-place so user/assistant messages are
 * preserved when a proactive greeting completes after the user has typed.
 */
export function applyFreshProactiveGreeting(
  currentMessages: AIChatMessage[],
  proactiveMessage: AIChatMessage,
  options: { suppressed: boolean }
): AIChatMessage[] | null {
  if (!shouldApplyFreshProactiveGreeting(currentMessages, options)) {
    return null;
  }

  const greetingIndex = currentMessages.findIndex(isDefaultGreeting);
  if (greetingIndex === -1) return null;

  const updated = [...currentMessages];
  updated[greetingIndex] = proactiveMessage;
  return updated;
}
