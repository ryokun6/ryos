/**
 * Pure helpers for deciding where an `AppDrawer` should pop out and whether
 * the host window must be repositioned/resized to make room for it.
 *
 * Behaviour:
 *
 *   1. Prefer the canonical side (right on desktop, bottom on mobile).
 *   2. If the canonical side does not fit, try the opposite side
 *      (left on desktop, top on mobile).
 *   3. If neither side fits at the current window bounds, reposition the
 *      window along the perpendicular axis so the canonical side fits.
 *   4. If repositioning alone is not enough (the window is wider/taller than
 *      the available space minus the drawer protrusion), also resize the
 *      window down to a value that does fit.
 *
 * Kept as a pure module so it can be unit-tested without React.
 */

export type DrawerPlacement = "right" | "left" | "bottom" | "top";

export interface DrawerLayoutInput {
  /** True when the viewport is in compact / mobile mode (uses sheets). */
  isCompact: boolean;
  /** Current window bounds in viewport coordinates. */
  window: { x: number; y: number; width: number; height: number };
  /** Viewport size. */
  viewport: { width: number; height: number };
  /** Top inset (menu bar). */
  topInset: number;
  /** Bottom inset (taskbar + dock + safe area). */
  bottomInset: number;
  /** Side-drawer protrusion in pixels (how far the panel extends past the window edge when open). */
  sideProtrusionPx: number;
  /** Sheet (compact) max height in pixels. */
  sheetMaxHeightPx: number;
  /**
   * Minimum window dimension to keep when forced to resize.
   * Defaults to `(min: 240, …)`.
   */
  minSize?: { width?: number; height?: number };
  /** Extra horizontal margin to keep around the side-drawer edge. */
  sideMarginPx?: number;
  /** Extra vertical margin around the sheet. */
  sheetMarginPx?: number;
}

export interface DrawerLayoutResult {
  placement: DrawerPlacement;
  /**
   * If non-null the host window should be moved/resized to these bounds
   * before opening the drawer. The placement is always the canonical side
   * (right/bottom) when an adjustment is needed.
   */
  windowAdjust: { x: number; y: number; width: number; height: number } | null;
}

const DEFAULT_MIN_WIDTH = 240;
const DEFAULT_MIN_HEIGHT = 200;

/**
 * Decide which side the drawer should pop out from, and whether the host
 * window needs to be moved or resized to make room.
 */
export function resolveDrawerLayout(
  input: DrawerLayoutInput
): DrawerLayoutResult {
  const {
    isCompact,
    window: win,
    viewport,
    topInset,
    bottomInset,
    sideProtrusionPx,
    sheetMaxHeightPx,
    minSize,
    sideMarginPx = 0,
    sheetMarginPx = 0,
  } = input;

  if (isCompact) {
    return resolveSheet({
      win,
      viewport,
      topInset,
      bottomInset,
      sheetMaxHeightPx,
      minHeight: minSize?.height ?? DEFAULT_MIN_HEIGHT,
      margin: sheetMarginPx,
    });
  }

  return resolveSide({
    win,
    viewport,
    sideProtrusionPx,
    minWidth: minSize?.width ?? DEFAULT_MIN_WIDTH,
    margin: sideMarginPx,
    topInset,
  });
}

// ── Desktop side-drawer logic ────────────────────────────────────────────────

interface SideInput {
  win: { x: number; y: number; width: number; height: number };
  viewport: { width: number; height: number };
  sideProtrusionPx: number;
  minWidth: number;
  margin: number;
  topInset: number;
}

function resolveSide({
  win,
  viewport,
  sideProtrusionPx,
  minWidth,
  margin,
  topInset,
}: SideInput): DrawerLayoutResult {
  const fitsRight =
    win.x + win.width + sideProtrusionPx + margin <= viewport.width;
  const fitsLeft = win.x - sideProtrusionPx - margin >= 0;

  if (fitsRight) return { placement: "right", windowAdjust: null };
  if (fitsLeft) return { placement: "left", windowAdjust: null };

  // Neither side fits at current bounds — reposition (and resize if needed)
  // so the canonical right side fits.
  const availableForWindowWidth =
    viewport.width - sideProtrusionPx - margin;
  if (availableForWindowWidth < minWidth) {
    // Even at minWidth there's not enough horizontal room. Best-effort: shrink
    // to minWidth, snap to x = 0, and accept overflow. The drawer will still
    // try to render on the right.
    return {
      placement: "right",
      windowAdjust: {
        x: 0,
        y: Math.max(topInset, win.y),
        width: Math.max(minWidth, viewport.width - sideProtrusionPx - margin),
        height: win.height,
      },
    };
  }

  let nextWidth = win.width;
  if (nextWidth > availableForWindowWidth) {
    nextWidth = availableForWindowWidth;
  }

  // Place the window so the right-side drawer fits.
  let nextX = viewport.width - sideProtrusionPx - margin - nextWidth;
  if (nextX < 0) nextX = 0;

  if (nextX === win.x && nextWidth === win.width) {
    return { placement: "right", windowAdjust: null };
  }

  return {
    placement: "right",
    windowAdjust: {
      x: nextX,
      y: Math.max(topInset, win.y),
      width: nextWidth,
      height: win.height,
    },
  };
}

// ── Compact bottom-sheet logic ───────────────────────────────────────────────

interface SheetInput {
  win: { x: number; y: number; width: number; height: number };
  viewport: { width: number; height: number };
  topInset: number;
  bottomInset: number;
  sheetMaxHeightPx: number;
  minHeight: number;
  margin: number;
}

function resolveSheet({
  win,
  viewport,
  topInset,
  bottomInset,
  sheetMaxHeightPx,
  minHeight,
  margin,
}: SheetInput): DrawerLayoutResult {
  const fitsBottom =
    win.y + win.height + sheetMaxHeightPx + margin <=
    viewport.height - bottomInset;
  const fitsTop = win.y - sheetMaxHeightPx - margin >= topInset;

  if (fitsBottom) return { placement: "bottom", windowAdjust: null };
  if (fitsTop) return { placement: "top", windowAdjust: null };

  const availableForWindowHeight =
    viewport.height - topInset - bottomInset - sheetMaxHeightPx - margin;

  if (availableForWindowHeight < minHeight) {
    return {
      placement: "bottom",
      windowAdjust: {
        x: win.x,
        y: topInset,
        width: win.width,
        height: Math.max(
          minHeight,
          viewport.height - topInset - bottomInset - sheetMaxHeightPx - margin
        ),
      },
    };
  }

  let nextHeight = win.height;
  if (nextHeight > availableForWindowHeight) {
    nextHeight = availableForWindowHeight;
  }

  let nextY =
    viewport.height - bottomInset - sheetMaxHeightPx - margin - nextHeight;
  if (nextY < topInset) nextY = topInset;

  if (nextY === win.y && nextHeight === win.height) {
    return { placement: "bottom", windowAdjust: null };
  }

  return {
    placement: "bottom",
    windowAdjust: {
      x: win.x,
      y: nextY,
      width: win.width,
      height: nextHeight,
    },
  };
}
