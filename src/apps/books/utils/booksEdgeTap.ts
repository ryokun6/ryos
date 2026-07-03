export const BOOKS_EDGE_TAP_RATIO = 0.2;

export type BooksPageTurnDirection = "prev" | "next";

interface ResolveBooksEdgeTapDirectionOptions {
  clientX: number;
  viewportWidth: number;
  isVerticalText: boolean;
  hasSelection: boolean;
  isInteractiveTarget: boolean;
}

/**
 * Resolve a short tap near an EPUB page edge into a page turn. Text selection
 * and interactive content always win over navigation.
 */
export function resolveBooksEdgeTapDirection({
  clientX,
  viewportWidth,
  isVerticalText,
  hasSelection,
  isInteractiveTarget,
}: ResolveBooksEdgeTapDirectionOptions): BooksPageTurnDirection | null {
  if (
    hasSelection ||
    isInteractiveTarget ||
    !Number.isFinite(clientX) ||
    !Number.isFinite(viewportWidth) ||
    viewportWidth <= 0
  ) {
    return null;
  }

  const edgeWidth = viewportWidth * BOOKS_EDGE_TAP_RATIO;
  if (clientX <= edgeWidth) {
    return isVerticalText ? "next" : "prev";
  }
  if (clientX >= viewportWidth - edgeWidth) {
    return isVerticalText ? "prev" : "next";
  }
  return null;
}
