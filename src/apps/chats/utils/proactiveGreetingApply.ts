import type { AIChatMessage } from "@/types/chat";

export const isDefaultGreetingMessage = (message: AIChatMessage): boolean =>
  message.id === "1" && message.role === "assistant";

/**
 * True when the message list is exactly the single default greeting, i.e. the
 * conversation has just been cleared / reset. Used to force the SDK message
 * list back in sync even when it is momentarily longer (e.g. a stream that was
 * still draining when the user pressed "Clear Chat").
 */
export const isClearedToDefaultGreeting = (
  messages: AIChatMessage[]
): boolean => messages.length === 1 && isDefaultGreetingMessage(messages[0]);

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

const isProactiveGreetingMessage = (message: AIChatMessage): boolean =>
  message.id === "proactive-1" || !!message.id?.startsWith("proactive-");

export type AiMessageSyncDecision =
  | { action: "patch-greeting"; messages: AIChatMessage[] }
  | { action: "skip" }
  | { action: "sync" }
  | { action: "noop" };

/**
 * Pure decision for `useSyncedAiMessages`: given the persisted store list and
 * the live AI SDK list, decide how (if at all) to reconcile them.
 *
 * - `patch-greeting`: the stream still shows the default loading greeting while
 *   the store already has the proactive greeting; swap it in place.
 * - `skip`: the SDK list is mid-stream (longer than the store) and the store is
 *   NOT a fresh clear, so leave the live list alone.
 * - `sync`: push the store list onto the SDK (length or last-id mismatch).
 * - `noop`: already in sync.
 */
export function resolveAiMessageSync(
  aiMessages: AIChatMessage[],
  sdkMessages: AIChatMessage[]
): AiMessageSyncDecision {
  const storeLast = aiMessages.at(-1);
  const sdkLast = sdkMessages.at(-1);

  const sdkHasDefaultGreeting = sdkMessages.some(isDefaultGreetingMessage);
  const storeProactiveGreeting = aiMessages.find(isProactiveGreetingMessage);

  if (sdkHasDefaultGreeting && storeProactiveGreeting) {
    const patched = applyFreshProactiveGreeting(
      sdkMessages,
      storeProactiveGreeting
    );
    return patched ? { action: "patch-greeting", messages: patched } : { action: "noop" };
  }

  // Mid-stream the SDK list runs ahead of the store. Don't clobber it with a
  // shorter store snapshot — unless the store was just cleared to the single
  // default greeting, in which case the clear must win.
  if (
    sdkMessages.length > aiMessages.length &&
    !isClearedToDefaultGreeting(aiMessages)
  ) {
    return { action: "skip" };
  }

  if (aiMessages.length !== sdkMessages.length || storeLast?.id !== sdkLast?.id) {
    return { action: "sync" };
  }

  return { action: "noop" };
}
