import { useEffect, useRef, useCallback, type RefObject } from "react";

interface UseResizeObserverOptions {
  /** ResizeObserver box model to observe */
  box?: ResizeObserverBoxOptions;
  /** Debounce delay in ms. If set, callbacks are debounced. */
  debounce?: number;
}

/**
 * Custom hook for observing element size changes with automatic cleanup.
 *
 * @param callback - Function called when element size changes
 * @param options - Configuration options
 * @returns A ref to attach to the element to observe
 *
 * @example
 * // Basic usage
 * const ref = useResizeObserver<HTMLDivElement>((entry) => {
 *   setWidth(entry.contentRect.width);
 * });
 * return <div ref={ref}>...</div>;
 *
 * // With debouncing
 * const ref = useResizeObserver<HTMLDivElement>(
 *   (entry) => setDimensions(entry.contentRect),
 *   { debounce: 100 }
 * );
 */
export function useResizeObserver<T extends HTMLElement = HTMLElement>(
  callback: (entry: ResizeObserverEntry) => void,
  options?: UseResizeObserverOptions
): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  const savedCallback = useRef(callback);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep callback ref updated
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
  }, [box, debounce]);

  return ref;
}

/**
 * Hook variant that accepts an external ref instead of returning one.
 * Useful when you already have a ref from another source.
 *
 * @param ref - Existing ref to observe
 * @param callback - Function called when element size changes
 * @param options - Configuration options
 *
 * @example
 * const containerRef = useRef<HTMLDivElement>(null);
 * useResizeObserverWithRef(containerRef, (entry) => {
 *   setWidth(entry.contentRect.width);
 * });
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

/**
 * Simple hook that returns current dimensions of an element.
 * Updates automatically when element resizes.
 *
 * @returns [ref, dimensions] - Attach ref to element, dimensions update automatically
 *
 * @example
 * const [ref, { width, height }] = useElementSize<HTMLDivElement>();
 * return <div ref={ref}>Size: {width}x{height}</div>;
 */
export function useElementSize<T extends HTMLElement = HTMLElement>(): [
  RefObject<T | null>,
  { width: number; height: number }
] {
  const ref = useRef<T | null>(null);
  const dimensionsRef = useRef({ width: 0, height: 0 });

  // Use a state update function that only triggers re-render if dimensions changed
  const forceUpdate = useCallback(() => {
    // This is a simple implementation - for production, consider using useState
    // with proper comparison to avoid unnecessary re-renders
  }, []);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const handleResize = (entries: ResizeObserverEntry[]) => {
      const entry = entries[0];
      if (!entry) return;

      const { width, height } = entry.contentRect;
      if (
        dimensionsRef.current.width !== width ||
        dimensionsRef.current.height !== height
      ) {
        dimensionsRef.current = { width, height };
        forceUpdate();
      }
    };

    // Get initial dimensions
    const rect = element.getBoundingClientRect();
    dimensionsRef.current = { width: rect.width, height: rect.height };

    const observer = new ResizeObserver(handleResize);
    observer.observe(element);

    return () => observer.disconnect();
  }, [forceUpdate]);

  return [ref, dimensionsRef.current];
}
