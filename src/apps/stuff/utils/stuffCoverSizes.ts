import type { StuffVisualKind } from "./stuffItemVisualKind";

/** Portrait book cover — matches Books shelf (104×160, ~13:20). */
export const STUFF_BOOK_GRID = { width: 104, height: 160 } as const;

/** Square product tile for non-book grid items. */
export const STUFF_PRODUCT_GRID = { width: 110, height: 110 } as const;

/** Books list thumbnail — matches Books list row cover. */
export const STUFF_BOOK_LIST = { width: 36, height: 52 } as const;

/** Square list thumbnail for non-book items. */
export const STUFF_PRODUCT_LIST = { width: 40, height: 40 } as const;

/** Detail drawer preview — portrait book (smaller than shelf so the header breathes). */
export const STUFF_BOOK_DETAIL = { width: 100, height: 154 } as const;

/** Detail drawer preview — square product. */
export const STUFF_PRODUCT_DETAIL = { width: 112, height: 112 } as const;

/** Grid column math uses the widest cover slot (product square). */
export const STUFF_SHELF_ITEM_WIDTH = STUFF_PRODUCT_GRID.width;

/** Tallest grid cover (book portrait) — shelf row min-height baseline. */
export const STUFF_SHELF_ROW_MIN_HEIGHT = STUFF_BOOK_GRID.height + 8;

export function getStuffCoverDimensions(
  visualKind: StuffVisualKind,
  size: "grid" | "list" | "detail"
): { width: number; height: number } {
  const isBook = visualKind === "book";

  if (size === "detail") {
    return isBook ? STUFF_BOOK_DETAIL : STUFF_PRODUCT_DETAIL;
  }
  if (size === "list") {
    return isBook ? STUFF_BOOK_LIST : STUFF_PRODUCT_LIST;
  }
  return isBook ? STUFF_BOOK_GRID : STUFF_PRODUCT_GRID;
}
