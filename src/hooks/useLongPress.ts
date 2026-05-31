import { useCallback, useRef } from "react";

/**
 * Reusable long-press hook that works on touch devices.
 *
 * onLongPress will be invoked after `delay` ms (default 500)
 * if the user is still pressing on the element.
 *
 * Example:
 * const longPress = useLongPress((e) => console.log("long press", e));
 * <div {...longPress} />
 */
export function useLongPress<T extends HTMLElement = HTMLElement>(
  onLongPress: (e: React.TouchEvent<T>) => void,
  { delay = 500 }: { delay?: number } = {}
) {
  const timeoutRef = useRef<number | null>(null);

  const clear = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const start = useCallback(
    (e: React.TouchEvent<T>) => {
      // Only handle single-finger touches
      if (e.touches && e.touches.length === 1) {
        timeoutRef.current = window.setTimeout(() => {
          onLongPress(e);
        }, delay);
      }
    },
    [onLongPress, delay]
  );

  return {
    onTouchStart: start,
    onTouchEnd: clear,
    onTouchMove: clear,
    onTouchCancel: clear,
  } as const;
}