import { useCallback, useEffect, useRef } from "react";

export function useTimedStatusMessage(
  setMessage: (message: string | null) => void,
  durationMs = 2000
): (message: string) => void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearStatusTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => clearStatusTimeout, [clearStatusTimeout]);

  return useCallback(
    (message: string) => {
      setMessage(message);
      clearStatusTimeout();
      timeoutRef.current = setTimeout(() => {
        setMessage(null);
        timeoutRef.current = null;
      }, durationMs);
    },
    [clearStatusTimeout, durationMs, setMessage]
  );
}
