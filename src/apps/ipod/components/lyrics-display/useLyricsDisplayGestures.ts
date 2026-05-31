import { useCallback, useRef } from "react";

export function useLyricsDisplayGestures({
  interactive,
  videoVisible,
  onAdjustOffset,
  onSwipeUp,
  onSwipeDown,
}: {
  interactive: boolean;
  videoVisible: boolean;
  onAdjustOffset?: (deltaMs: number) => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
}) {
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(
    null
  );
  const accumulatedDeltaRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const hasTriggeredSwipeRef = useRef(false);

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!interactive || !videoVisible || !onAdjustOffset) return;
    const delta = e.deltaY;
    const step = 50;
    const change = delta > 0 ? step : -step;
    onAdjustOffset(change);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (!interactive) return;
    if (e.touches.length === 1) {
      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        time: Date.now(),
      };
      accumulatedDeltaRef.current = { x: 0, y: 0 };
      hasTriggeredSwipeRef.current = false;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (!interactive || !touchStartRef.current || e.touches.length === 0)
      return;

    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const dx = currentX - touchStartRef.current.x;
    const dy = currentY - touchStartRef.current.y;

    const isHorizontal = Math.abs(dx) > Math.abs(dy);

    if (isHorizontal && videoVisible && onAdjustOffset) {
      const lastX = touchStartRef.current.x + accumulatedDeltaRef.current.x;
      const incrementalDx = currentX - lastX;

      if (Math.abs(incrementalDx) > 10) {
        const step = 50;
        const change = incrementalDx > 0 ? step : -step;
        onAdjustOffset(change);
        accumulatedDeltaRef.current.x = dx;
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (!interactive || !touchStartRef.current || hasTriggeredSwipeRef.current) {
      touchStartRef.current = null;
      return;
    }

    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    const deltaTime = Date.now() - touchStartRef.current.time;

    const SWIPE_THRESHOLD = 80;
    const MAX_SWIPE_TIME = 500;
    const MAX_CROSS_DRIFT = 100;

    const isVerticalSwipe =
      Math.abs(dy) > SWIPE_THRESHOLD &&
      Math.abs(dx) < MAX_CROSS_DRIFT &&
      deltaTime < MAX_SWIPE_TIME;

    if (isVerticalSwipe) {
      if (dy < 0 && onSwipeUp) {
        onSwipeUp();
        hasTriggeredSwipeRef.current = true;
      } else if (dy > 0 && onSwipeDown) {
        onSwipeDown();
        hasTriggeredSwipeRef.current = true;
      }
    }

    touchStartRef.current = null;
  };

  const handleTouchCancel = useCallback(() => {
    touchStartRef.current = null;
    accumulatedDeltaRef.current = { x: 0, y: 0 };
    hasTriggeredSwipeRef.current = false;
  }, []);

  return {
    handleWheel,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleTouchCancel,
  };
}
