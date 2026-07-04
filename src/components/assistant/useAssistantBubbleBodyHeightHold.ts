import { useLayoutEffect, useRef, type RefObject } from "react";

/**
 * Holds the assistant bubble body's rendered height while a reply is in
 * flight.
 *
 * When a message is sent, the body swaps the previous (often multi-line)
 * reply for the one-line thinking ticker. Without a hold the bubble's height
 * snaps down — visibly displacing the bubble — and then regrows as the reply
 * streams back in. Reserving the pre-send height as a min-height keeps the
 * bubble still for the whole turn; it only resizes once, when the finished
 * reply settles (or grows past the reserved space while streaming).
 *
 * Returns the min-height (px) to apply to the body, or null when idle.
 */
export function useAssistantBubbleBodyHeightHold(
  bodyRef: RefObject<HTMLElement | null>,
  isLoading: boolean
): number | null {
  const lastIdleHeightRef = useRef<number | null>(null);
  const heldHeightRef = useRef<number | null>(null);

  // Track the body's height on every idle commit. When loading flips on, the
  // body has already swapped to the ticker in that same commit, so the height
  // to reserve must come from the commit before it.
  useLayoutEffect(() => {
    if (isLoading) return;
    const element = bodyRef.current;
    if (element) lastIdleHeightRef.current = element.offsetHeight;
  });

  // Latch the pre-send height for the duration of the turn.
  if (!isLoading) {
    heldHeightRef.current = null;
  } else if (heldHeightRef.current === null) {
    heldHeightRef.current = lastIdleHeightRef.current;
  }
  return heldHeightRef.current;
}
