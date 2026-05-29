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
