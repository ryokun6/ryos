import { useCallback, useRef } from "react";

interface PinchGestureOptions {
  /** Minimum distance change (in pixels) to trigger the gesture */
  threshold?: number;
  /** Called when pinch-in (zoom out) gesture is detected */
  onPinchIn?: () => void;
  /** Called when pinch-out (zoom in) gesture is detected */
  onPinchOut?: () => void;
}

/**
 * Hook to detect two-finger pinch gestures on touch devices.
 *
 * - onPinchIn: triggered when fingers move together (zoom out gesture)
 * - onPinchOut: triggered when fingers spread apart (zoom in gesture)
 *
 * Example:
 * const pinchHandlers = usePinchGesture({
 *   onPinchIn: () => console.log("pinch in"),
 *   onPinchOut: () => console.log("pinch out"),
 * });
 * <div {...pinchHandlers} />
 */
export function usePinchGesture({
  threshold = 100,
  onPinchIn,
  onPinchOut,
}: PinchGestureOptions = {}) {
  const initialDistanceRef = useRef<number | null>(null);
  const hasTriggeredRef = useRef(false);

  const getDistance = (touches: React.TouchList) => {
    if (touches.length < 2) return null;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      initialDistanceRef.current = getDistance(e.touches);
      hasTriggeredRef.current = false;
    }
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (
        e.touches.length !== 2 ||
        initialDistanceRef.current === null ||
        hasTriggeredRef.current
      ) {
        return;
      }

      const currentDistance = getDistance(e.touches);
      if (currentDistance === null) return;

      const delta = currentDistance - initialDistanceRef.current;

      // Pinch in (fingers coming together) - negative delta
      if (delta < -threshold && onPinchIn) {
        hasTriggeredRef.current = true;
        onPinchIn();
      }
      // Pinch out (fingers spreading apart) - positive delta
      else if (delta > threshold && onPinchOut) {
        hasTriggeredRef.current = true;
        onPinchOut();
      }
    },
    [threshold, onPinchIn, onPinchOut]
  );

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleTouchEnd = useCallback((_e?: React.TouchEvent) => {
    initialDistanceRef.current = null;
    hasTriggeredRef.current = false;
  }, []);

  return {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
    onTouchCancel: handleTouchEnd,
  } as const;
}
