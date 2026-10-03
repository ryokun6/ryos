/** Minimum upward movement (px) to reveal a hidden dock via swipe. */
export const DOCK_SWIPE_UP_THRESHOLD_PX = 48;

/** Movement below this (px) is treated as a tap, not a swipe. */
export const DOCK_SWIPE_MOVE_THRESHOLD_PX = 12;

export function shouldRevealDockFromSwipeUp(
  deltaX: number,
  deltaY: number,
  options?: {
    swipeUpThreshold?: number;
    moveThreshold?: number;
  },
): boolean {
  const swipeUpThreshold =
    options?.swipeUpThreshold ?? DOCK_SWIPE_UP_THRESHOLD_PX;
  const moveThreshold =
    options?.moveThreshold ?? DOCK_SWIPE_MOVE_THRESHOLD_PX;

  const absDx = Math.abs(deltaX);
  const absDy = Math.abs(deltaY);

  if (absDx < moveThreshold && absDy < moveThreshold) {
    return false;
  }

  return deltaY < -swipeUpThreshold && absDy > absDx;
}

export function isClientYInBottomZone(
  clientY: number,
  viewportHeight: number,
  zoneHeightPx: number,
): boolean {
  return clientY >= viewportHeight - zoneHeightPx;
}

/** Minimum inward movement (px) to reveal a hidden side dock via swipe. */
export const DOCK_SWIPE_IN_THRESHOLD_PX = 48;

/** Inward swipe from the side a dock sits on: leftward for a right dock, rightward for a left dock. */
export function shouldRevealSideDockFromSwipe(
  deltaX: number,
  deltaY: number,
  side: "left" | "right",
  options?: {
    swipeInThreshold?: number;
    moveThreshold?: number;
  },
): boolean {
  const swipeInThreshold =
    options?.swipeInThreshold ?? DOCK_SWIPE_IN_THRESHOLD_PX;
  const moveThreshold =
    options?.moveThreshold ?? DOCK_SWIPE_MOVE_THRESHOLD_PX;

  const absDx = Math.abs(deltaX);
  const absDy = Math.abs(deltaY);

  if (absDx < moveThreshold && absDy < moveThreshold) {
    return false;
  }

  const inward = side === "right" ? -deltaX : deltaX;
  return inward > swipeInThreshold && absDx > absDy;
}

export function isClientXInSideZone(
  clientX: number,
  viewportWidth: number,
  zoneWidthPx: number,
  side: "left" | "right",
): boolean {
  return side === "right"
    ? clientX >= viewportWidth - zoneWidthPx
    : clientX <= zoneWidthPx;
}
