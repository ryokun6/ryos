import { useState, useEffect } from "react";

/**
 * Hook that detects online/offline status by listening to browser events
 * and checking navigator.onLine. Handles edge cases where navigator.onLine
 * can be unreliable. Includes periodic checks to ensure state stays in sync.
 */
export function useOffline(): boolean {
  const [isOffline, setIsOffline] = useState(() => {
    // Initialize with current state
    if (typeof navigator !== "undefined" && "onLine" in navigator) {
      return !navigator.onLine;
    }
    // If navigator.onLine is not available, assume online
    return false;
  });

  useEffect(() => {
    // Update state when online/offline events fire
    const handleOnline = () => {
      setIsOffline(false);
    };
    const handleOffline = () => {
      setIsOffline(true);
    };

    // Set initial state
    if (typeof navigator !== "undefined" && "onLine" in navigator) {
      setIsOffline(!navigator.onLine);
    }

    // Listen to online/offline events
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Periodic check to ensure state stays in sync (in case events don't fire)
    // Check every 5 seconds
    const intervalId = setInterval(() => {
      if (typeof navigator !== "undefined" && "onLine" in navigator) {
        setIsOffline((prev) => {
          const currentOffline = !navigator.onLine;
          // Only update if state changed to avoid unnecessary re-renders
          return currentOffline !== prev ? currentOffline : prev;
        });
      }
    }, 5000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(intervalId);
    };
  }, []);

  return isOffline;
}

