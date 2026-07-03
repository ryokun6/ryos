import type { BooksPageTurnDirection } from "./booksEdgeTap";

/** Minimum horizontal travel (px) before a touch drag counts as a swipe. */
export const BOOKS_SWIPE_MIN_DISTANCE = 48;
/** Horizontal travel must beat vertical travel by this factor. */
export const BOOKS_SWIPE_AXIS_DOMINANCE = 1.2;

interface ResolveBooksSwipeDirectionOptions {
  deltaX: number;
  deltaY: number;
  isVerticalText: boolean;
  hasSelection: boolean;
}

/**
 * Resolve a horizontal touch swipe inside the EPUB page into a page turn.
 * Swiping left pulls in the following page for horizontal text; vertical
 * (right-to-left page progression) text reverses the mapping — same physics
 * as the edge taps. A live text selection always wins over navigation.
 */
export function resolveBooksSwipeDirection({
  deltaX,
  deltaY,
  isVerticalText,
  hasSelection,
}: ResolveBooksSwipeDirectionOptions): BooksPageTurnDirection | null {
  if (hasSelection || !Number.isFinite(deltaX) || !Number.isFinite(deltaY)) {
    return null;
  }

  const absX = Math.abs(deltaX);
  if (absX < BOOKS_SWIPE_MIN_DISTANCE) return null;
  if (absX < Math.abs(deltaY) * BOOKS_SWIPE_AXIS_DOMINANCE) return null;

  if (deltaX < 0) {
    return isVerticalText ? "prev" : "next";
  }
  return isVerticalText ? "next" : "prev";
}
