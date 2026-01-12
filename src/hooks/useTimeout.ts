import { useEffect, useRef, useCallback } from "react";

interface UseTimeoutReturn {
  /** Clear the pending timeout */
  clear: () => void;
  /** Reset the timeout (clear existing and start new) */
  reset: () => void;
}

/**
 * Custom hook for declarative setTimeout with automatic cleanup.
 *
 * @param callback - Function to call when timeout fires
 * @param delay - Timeout delay in ms. Pass null to disable the timeout.
 * @returns Object with clear and reset functions
 *
 * @example
 * // Basic usage
 * useTimeout(() => setVisible(false), 3000);
 *
 * // Conditional timeout
 * useTimeout(() => hideMessage(), showMessage ? 5000 : null);
 *
 * // Manual control
 * const { clear, reset } = useTimeout(() => autoSave(), 10000);
 * // Later: clear() to cancel, reset() to restart
 */
export function useTimeout(
  callback: () => void,
  delay: number | null
): UseTimeoutReturn {
  const savedCallback = useRef(callback);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Remember the latest callback
  savedCallback.current = callback;

  const clear = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clear();
    if (delay !== null) {
      timeoutRef.current = setTimeout(() => {
        savedCallback.current();
      }, delay);
    }
  }, [delay, clear]);

  // Set up the timeout
  useEffect(() => {
    // Don't schedule if delay is null
    if (delay === null) {
      return;
    }

    timeoutRef.current = setTimeout(() => {
      savedCallback.current();
    }, delay);

    return clear;
  }, [delay, clear]);

  return { clear, reset };
}
