import type { StuffVisualKind } from "./stuffItemVisualKind";

/** Portrait book cover — matches Books shelf (104×160, ~13:20). */
export const STUFF_BOOK_GRID = { width: 104, height: 160 } as const;

/**
 * Landscape CD jewel case front.
 * Spec: standard single jewel case is 142 mm × 125 mm × 10 mm
 * (Wikipedia “Optical disc packaging”); front-face W:H = 142:125 ≈ 1.136:1.
 * Pixel size keeps shelf weight near the old tile; width = round(height × 142/125).
 */
export const STUFF_CD_GRID = { width: 123, height: 108 } as const;

/** Square product tile for non-book / non-CD grid items. */
export const STUFF_PRODUCT_GRID = { width: 110, height: 110 } as const;

/** Books list thumbnail — matches Books list row cover. */
export const STUFF_BOOK_LIST = { width: 36, height: 52 } as const;

/** CD list thumbnail — same 142:125 jewel-case ratio, smaller. */
export const STUFF_CD_LIST = { width: 42, height: 37 } as const;

/** Square list thumbnail for non-book / non-CD items. */
export const STUFF_PRODUCT_LIST = { width: 40, height: 40 } as const;

/** Detail drawer preview — portrait book (smaller than shelf so the header breathes). */
export const STUFF_BOOK_DETAIL = { width: 100, height: 154 } as const;

/** Detail drawer preview — same pixel size as grid jewel case. */
export const STUFF_CD_DETAIL = { width: 123, height: 108 } as const;

/** Detail drawer preview — square product. */
export const STUFF_PRODUCT_DETAIL = { width: 112, height: 112 } as const;

/** Grid column math uses the widest cover slot (landscape CD jewel case). */
export const STUFF_SHELF_ITEM_WIDTH = STUFF_CD_GRID.width;

/** Tallest grid cover (book portrait) — shelf row min-height baseline. */
export const STUFF_SHELF_ROW_MIN_HEIGHT = STUFF_BOOK_GRID.height + 8;

/** External jewel-case front ratio (mm): width / height. */
export const STUFF_CD_JEWEL_CASE_RATIO = 142 / 125;

export function getStuffCoverDimensions(
  visualKind: StuffVisualKind,
  size: "grid" | "list" | "detail"
): { width: number; height: number } {
  if (visualKind === "book") {
    if (size === "detail") return STUFF_BOOK_DETAIL;
    if (size === "list") return STUFF_BOOK_LIST;
    return STUFF_BOOK_GRID;
  }

  if (visualKind === "cd") {
    if (size === "detail") return STUFF_CD_DETAIL;
    if (size === "list") return STUFF_CD_LIST;
    return STUFF_CD_GRID;
  }

  if (size === "detail") return STUFF_PRODUCT_DETAIL;
  if (size === "list") return STUFF_PRODUCT_LIST;
  return STUFF_PRODUCT_GRID;
}
