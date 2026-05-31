import { useCallback, useRef } from "react";

/**
 * Reusable long-press hook that works on touch devices.
 *
 * onLongPress will be invoked after `delay` ms (default 500)
 * if the user is still pressing on the element.
 *
 * A small movement tolerance (`moveTolerance`, default 10px) is allowed so
 * that natural finger jitter while holding does not cancel the long press.
 * Only movement beyond the tolerance (i.e. an intentional scroll/drag) cancels
 * it. Without this, real touch devices almost always emit tiny `touchmove`
 * events during a hold, which previously aborted the gesture and made
 * context menus feel broken on mobile.
 *
 * Example:
 * const longPress = useLongPress((e) => console.log("long press", e));
 * <div {...longPress} />
 */
export function useLongPress<T extends HTMLElement = HTMLElement>(
  onLongPress: (e: React.TouchEvent<T>) => void,
  { delay = 500, moveTolerance = 10 }: { delay?: number; moveTolerance?: number } = {}
) {
  const timeoutRef = useRef<number | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);

  const clear = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    startPosRef.current = null;
  }, []);

  const start = useCallback(
    (e: React.TouchEvent<T>) => {
      // Only handle single-finger touches
      if (e.touches && e.touches.length === 1) {
        const touch = e.touches[0];
        startPosRef.current = { x: touch.clientX, y: touch.clientY };
        timeoutRef.current = window.setTimeout(() => {
          onLongPress(e);
        }, delay);
      }
    },
    [onLongPress, delay]
  );

  const handleMove = useCallback(
    (e: React.TouchEvent<T>) => {
      const startPos = startPosRef.current;
      if (!startPos || timeoutRef.current === null) return;

      const touch = e.touches[0];
      if (!touch) {
        clear();
        return;
      }

      const dx = touch.clientX - startPos.x;
      const dy = touch.clientY - startPos.y;
      // Cancel only when the finger has moved beyond the tolerance, treating
      // it as an intentional scroll/drag rather than a stationary hold.
      if (dx * dx + dy * dy > moveTolerance * moveTolerance) {
        clear();
      }
    },
    [clear, moveTolerance]
  );

  return {
    onTouchStart: start,
    onTouchEnd: clear,
    onTouchMove: handleMove,
    onTouchCancel: clear,
  } as const;
}
