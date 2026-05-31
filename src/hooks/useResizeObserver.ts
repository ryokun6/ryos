import { useEffect, useRef, type RefObject } from "react";

interface UseResizeObserverOptions {
  /** ResizeObserver box model to observe */
  box?: ResizeObserverBoxOptions;
  /** Debounce delay in ms. If set, callbacks are debounced. */
  debounce?: number;
}

/**
 * Observe an existing ref for size changes. Use when the ref comes from
 * another hook or parent state.
 */
export function useResizeObserverWithRef<T extends HTMLElement>(
  ref: RefObject<T | null>,
  callback: (entry: ResizeObserverEntry) => void,
  options?: UseResizeObserverOptions
): void {
  const savedCallback = useRef(callback);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  savedCallback.current = callback;

  const { box, debounce } = options ?? {};

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const handleResize = (entries: ResizeObserverEntry[]) => {
      const entry = entries[0];
      if (!entry) return;

      if (debounce !== undefined && debounce > 0) {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
          savedCallback.current(entry);
        }, debounce);
      } else {
        savedCallback.current(entry);
      }
    };

    const observer = new ResizeObserver(handleResize);
    observer.observe(element, box ? { box } : undefined);

    return () => {
      observer.disconnect();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [ref, box, debounce]);
}
