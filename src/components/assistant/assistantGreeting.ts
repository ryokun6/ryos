/**
 * Pure greeting/staleness rules for the floating desktop assistant. Kept free
 * of store/hook imports so tests can exercise them without dragging in the
 * whole app dependency graph.
 */

/** Re-greet if the user hasn't talked to the assistant for this long. */
export const ASSISTANT_GREETING_STALE_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * A bubble left dismissed this long marks the conversation as done: the next
 * summon clears the old thread and opens with a fresh greeting.
 */
export const ASSISTANT_DISMISS_DONE_MS = 5 * 60 * 1000; // 5 minutes

export type AssistantGreetDecision =
  /** Recent conversation still going — keep showing it, no new greeting. */
  | "none"
  /** Greet, continuing the existing thread (first summon / stale thread). */
  | "greet"
  /** Conversation is done — clear it and greet on a fresh thread. */
  | "fresh-greet";

/** Decide what should happen when the bubble opens (summon, tap, or reload). */
export function getAssistantGreetDecision({
  bubbleDismissedAt,
  lastInteractionAt,
  hasAssistantReply,
  now,
}: {
  bubbleDismissedAt: number | null;
  lastInteractionAt: number | null;
  hasAssistantReply: boolean;
  now: number;
}): AssistantGreetDecision {
  const dismissedLongEnough =
    bubbleDismissedAt !== null &&
    now - bubbleDismissedAt >= ASSISTANT_DISMISS_DONE_MS;
  if (dismissedLongEnough) return "fresh-greet";

  const stale =
    !lastInteractionAt || now - lastInteractionAt > ASSISTANT_GREETING_STALE_MS;
  if (hasAssistantReply && !stale) return "none";
  return "greet";
}
