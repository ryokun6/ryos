/**
 * Historical message-list bottom padding (`pb-14`). Kept as a floor so chats
 * without the model label keep the same scroll clearance.
 */
export const CHAT_MESSAGE_LIST_MIN_CLEARANCE_PX = 56;

/**
 * Pixels added above the measured overlay. The label-less composer is ~52px
 * and `pb-14` left a 4px gap; stick-to-bottom also stops 1px short of the
 * scroll height. Without this slack an exact fit clips the bubble border.
 */
export const CHAT_COMPOSER_CLEARANCE_SLACK_PX = 4;

export interface MessageListBottomClearanceInput {
  /** Top of the composer overlay, in viewport coordinates. */
  composerTop: number;
  /** Bottom of the message scrollport, in viewport coordinates. */
  scrollBottom: number;
  viewportHeight: number;
  /** Resolved `env(safe-area-inset-bottom)` in CSS pixels. */
  safeAreaBottom: number;
  /** Never return less than this. Defaults to the historical `pb-14` floor. */
  minClearance?: number;
}

/**
 * Pixels of message-list bottom clearance so the last bubble sits fully above
 * the composer overlay.
 *
 * The composer height (including the model label, errors, and its own padding)
 * is the distance from the overlay's top to the scrollport bottom. On iPhone
 * the home indicator can extend above that overlay; the larger of the two wins
 * so the last message also clears the safe area.
 */
export function messageListBottomClearance(
  input: MessageListBottomClearanceInput
): number {
  const composerOverlap = Math.max(0, input.scrollBottom - input.composerTop);
  const safeAreaBottom = Math.max(0, input.safeAreaBottom);
  const safeAreaTop = input.viewportHeight - safeAreaBottom;
  const safeOverlap = Math.max(0, input.scrollBottom - safeAreaTop);
  const measured =
    Math.ceil(Math.max(composerOverlap, safeOverlap)) +
    CHAT_COMPOSER_CLEARANCE_SLACK_PX;
  const minClearance = input.minClearance ?? CHAT_MESSAGE_LIST_MIN_CLEARANCE_PX;
  return Math.max(measured, minClearance);
}

/** Read the shell's resolved bottom safe-area inset (`--sat-safe-area-bottom`). */
export function readSafeAreaBottomPx(): number {
  if (typeof document === "undefined") return 0;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(
    "--sat-safe-area-bottom"
  );
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
