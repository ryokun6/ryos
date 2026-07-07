import type { AIChatMessage } from "@/types/chat";
import {
  AI_PROACTIVE_GREETING_STALE_AFTER_MS,
  isAIProactiveGreetingMessageId,
} from "@/shared/contracts/aiConversation";

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
  isAIProactiveGreetingMessageId(message.id);

/**
 * Get the timestamp (epoch ms) of a message's createdAt metadata.
 * Falls back to 0 if no valid timestamp is found.
 */
export function getMessageCreatedAtTime(message: AIChatMessage): number {
  const createdAt = message.metadata?.createdAt;
  if (!createdAt) return 0;

  if (createdAt instanceof Date) return createdAt.getTime();
  if (typeof createdAt === "number") return createdAt;
  if (typeof createdAt === "string") {
    const ts = new Date(createdAt).getTime();
    return Number.isFinite(ts) ? ts : 0;
  }
  return 0;
}

/**
 * Client-side pre-check mirroring the server's proactive-greeting
 * eligibility: greet a brand-new thread (only the local default greeting) or
 * a thread whose last message has gone stale. The server re-validates against
 * the canonical conversation, so this only avoids pointless requests.
 */
export function isConversationGreetable(
  messages: AIChatMessage[],
  now = Date.now()
): boolean {
  if (messages.length === 0) return true;
  if (isClearedToDefaultGreeting(messages)) return true;

  const last = messages[messages.length - 1];
  if (isProactiveGreetingMessage(last)) return false;

  const lastTimestamp = getMessageCreatedAtTime(last);
  return (
    lastTimestamp > 0 &&
    now - lastTimestamp > AI_PROACTIVE_GREETING_STALE_AFTER_MS
  );
}

/**
 * Parse the `/api/chat` proactive-greeting JSON response into the persisted
 * greeting message, or null when the server skipped the greeting.
 */
export function parseServerProactiveGreeting(
  value: unknown
): AIChatMessage | null {
  if (typeof value !== "object" || value === null) return null;
  const greeting = Reflect.get(value, "greeting");
  const message = Reflect.get(value, "message");
  if (typeof greeting !== "string" || !greeting.trim()) return null;
  if (typeof message !== "object" || message === null) return null;

  const id = Reflect.get(message, "id");
  const role = Reflect.get(message, "role");
  const rawParts = Reflect.get(message, "parts");
  const rawCreatedAt = Reflect.get(message, "createdAt");
  if (
    !isAIProactiveGreetingMessageId(id) ||
    typeof id !== "string" ||
    role !== "assistant" ||
    !Array.isArray(rawParts)
  ) {
    return null;
  }

  const parts = rawParts.filter(
    (part): part is AIChatMessage["parts"][number] =>
      typeof part === "object" &&
      part !== null &&
      typeof Reflect.get(part, "type") === "string"
  );
  if (parts.length === 0) return null;

  const createdAt =
    typeof rawCreatedAt === "string" ? new Date(rawCreatedAt) : new Date();
  return {
    id,
    role: "assistant",
    parts,
    metadata: {
      createdAt: Number.isFinite(createdAt.getTime()) ? createdAt : new Date(),
    },
  };
}

/**
 * Merge a server-persisted proactive greeting into the live message list:
 * replace the default greeting when present (fresh chat), otherwise append to
 * the stale thread. Returns null when nothing should change — e.g. the
 * greeting already landed via hydration, or local activity (a newer message /
 * an unsent user turn) raced the greeting and hydration should reconcile.
 */
export function applyServerProactiveGreeting(
  currentMessages: AIChatMessage[],
  greetingMessage: AIChatMessage
): AIChatMessage[] | null {
  if (currentMessages.some((message) => message.id === greetingMessage.id)) {
    return null;
  }
  if (shouldApplyFreshProactiveGreeting(currentMessages)) {
    return applyFreshProactiveGreeting(currentMessages, greetingMessage);
  }

  const last = currentMessages[currentMessages.length - 1];
  if (!last) return [greetingMessage];
  if (last.role === "user") return null;

  const lastTimestamp = getMessageCreatedAtTime(last);
  const greetingTimestamp = getMessageCreatedAtTime(greetingMessage);
  if (
    lastTimestamp > 0 &&
    greetingTimestamp > 0 &&
    lastTimestamp > greetingTimestamp
  ) {
    return null;
  }
  return [...currentMessages, greetingMessage];
}

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
