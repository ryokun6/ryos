/** Minimum horizontal travel (px) before a touch drag counts as a period swipe. */
export const CALENDAR_PERIOD_SWIPE_MIN_DISTANCE = 56;
/** Horizontal travel must beat vertical travel by this factor. */
export const CALENDAR_PERIOD_SWIPE_AXIS_DOMINANCE = 1.25;
/** Ignore tiny movements until the finger travels this far. */
export const CALENDAR_PERIOD_SWIPE_AXIS_LOCK_PX = 12;

export type CalendarPeriodSwipeDirection = "prev" | "next";

export interface ResolveCalendarPeriodSwipeOptions {
  deltaX: number;
  deltaY: number;
  /** When set, horizontal overflow scrolling must be at the leading edge to go prev. */
  scrollLeft?: number;
  /** Max scrollLeft of the horizontal scroller (scrollWidth - clientWidth). */
  maxScrollLeft?: number;
}

/**
 * Resolve a single-finger touch into a calendar period navigation
 * (prev/next day, week, or month). Swipe left → next; swipe right → prev.
 * When a horizontal scroll parent is present, only navigates once that
 * scroller is already at the matching edge (or has no overflow).
 */
export function resolveCalendarPeriodSwipe({
  deltaX,
  deltaY,
  scrollLeft,
  maxScrollLeft,
}: ResolveCalendarPeriodSwipeOptions): CalendarPeriodSwipeDirection | null {
  if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return null;

  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);
  if (absX < CALENDAR_PERIOD_SWIPE_MIN_DISTANCE) return null;
  if (absX < absY * CALENDAR_PERIOD_SWIPE_AXIS_DOMINANCE) return null;

  const hasHorizontalScroll =
    typeof scrollLeft === "number" &&
    typeof maxScrollLeft === "number" &&
    Number.isFinite(scrollLeft) &&
    Number.isFinite(maxScrollLeft) &&
    maxScrollLeft > 1;

  if (deltaX < 0) {
    // Swipe left → next period
    if (hasHorizontalScroll && scrollLeft! < maxScrollLeft! - 1) return null;
    return "next";
  }

  // Swipe right → previous period
  if (hasHorizontalScroll && scrollLeft! > 1) return null;
  return "prev";
}

/** True when a touch target (or ancestor) should suppress period swipe navigation. */
export function shouldIgnoreCalendarPeriodSwipeTarget(
  target: EventTarget | null
): boolean {
  if (
    !target ||
    typeof (target as Element).closest !== "function"
  ) {
    return false;
  }
  return Boolean(
    (target as Element).closest(
      "[data-no-period-swipe], input, textarea, select, [contenteditable='true']"
    )
  );
}
