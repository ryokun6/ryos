import { useSyncExternalStore } from "react";

/**
 * Hook that detects online/offline status using useSyncExternalStore.
 * This is the modern React 18 way of subscribing to browser APIs.
 * 
 * Uses navigator.onLine with online/offline event listeners and periodic
 * checks to handle edge cases where navigator.onLine can be unreliable.
 */

// Polling interval for periodic checks (in case events don't fire)
const POLL_INTERVAL_MS = 5000;

// Store for tracking the current online state and listeners
const listeners = new Set<() => void>();
let pollIntervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Get the current online/offline state from the browser
 */
function getSnapshot(): boolean {
  if (typeof navigator === "undefined" || !("onLine" in navigator)) {
    return false; // Assume online if navigator.onLine not available
  }
  return !navigator.onLine;
}

/**
 * Get the server snapshot (for SSR)
 */
function getServerSnapshot(): boolean {
  return false; // Assume online during SSR
}

/**
 * Start the polling interval for periodic checks
 */
function startPolling() {
  if (pollIntervalId !== null) return;
  
  pollIntervalId = setInterval(() => {
    // Notify all listeners to re-check the state
    listeners.forEach((listener) => listener());
  }, POLL_INTERVAL_MS);
}

/**
 * Stop the polling interval
 */
function stopPolling() {
  if (pollIntervalId !== null) {
    clearInterval(pollIntervalId);
    pollIntervalId = null;
  }
}

/**
 * Subscribe to online/offline changes
 */
function subscribe(callback: () => void): () => void {
  listeners.add(callback);

  // Add browser event listeners (only for the first subscriber)
  if (listeners.size === 1) {
    window.addEventListener("online", callback);
    window.addEventListener("offline", callback);
    startPolling();
  }

  // Return unsubscribe function
  return () => {
    listeners.delete(callback);

    // Clean up browser event listeners when no subscribers left
    if (listeners.size === 0) {
      window.removeEventListener("online", callback);
      window.removeEventListener("offline", callback);
      stopPolling();
    }
  };
}

/**
 * Hook that detects online/offline status by listening to browser events
 * and checking navigator.onLine. Handles edge cases where navigator.onLine
 * can be unreliable. Includes periodic checks to ensure state stays in sync.
 * 
 * @returns true if offline, false if online
 * 
 * @example
 * const isOffline = useOffline();
 * if (isOffline) {
 *   return <OfflineMessage />;
 * }
 */
export function useOffline(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
