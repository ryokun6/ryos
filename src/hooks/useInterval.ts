import { useEffect, useRef } from "react";

/**
 * Custom hook for declarative setInterval with automatic cleanup.
 *
 * @param callback - Function to call on each interval
 * @param delay - Interval delay in ms. Pass null to pause the interval.
 * @param options - Configuration options
 * @param options.immediate - If true, callback runs immediately on mount/delay change
 *
 * @example
 * // Basic usage - runs every second
 * useInterval(() => setCount(c => c + 1), 1000);
 *
 * // Conditional interval - pauses when delay is null
 * useInterval(() => tick(), isRunning ? 1000 : null);
 *
 * // Immediate execution
 * useInterval(() => fetchData(), 5000, { immediate: true });
 */
export function useInterval(
  callback: () => void,
  delay: number | null,
  options?: { immediate?: boolean }
): void {
  const savedCallback = useRef(callback);
  const { immediate = false } = options ?? {};

  // Remember the latest callback
  savedCallback.current = callback;

  // Set up the interval
  useEffect(() => {
    // Don't schedule if delay is null
    if (delay === null) {
      return;
    }

    // Run immediately if requested
    if (immediate) {
      savedCallback.current();
    }

    const id = setInterval(() => {
      savedCallback.current();
    }, delay);

    return () => clearInterval(id);
  }, [delay, immediate]);
}
