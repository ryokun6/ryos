import { useSyncExternalStore } from "react";

/**
 * Hook that detects online/offline status using useSyncExternalStore.
 * This is the modern React 18 way of subscribing to browser APIs.
 *
 * Uses navigator.onLine with online/offline event listeners. As a safety net
 * for environments where the `online` event can be missed, we poll while the
 * device is offline so connection recovery is detected reliably. Polling is
 * NOT run while online (the common case) to avoid an always-on timer that
 * wakes the event loop and drains battery — the `offline` event is reliable
 * for the online → offline transition.
 */

// Polling interval for periodic checks while offline (in case the `online`
// event is missed by the browser).
const POLL_INTERVAL_MS = 5000;

// Subscribers registered via useSyncExternalStore.
const listeners = new Set<() => void>();
let pollIntervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Read the current offline state from the browser.
 */
function readOffline(): boolean {
  if (typeof navigator === "undefined" || !("onLine" in navigator)) {
    return false; // Assume online if navigator.onLine not available
  }
  return !navigator.onLine;
}

/**
 * Get the current online/offline state (true === offline).
 * useSyncExternalStore relies on this returning a primitive so identical
 * states compare equal via Object.is and avoid spurious re-renders.
 */
export function getSnapshot(): boolean {
  return readOffline();
}

/**
 * Get the server snapshot (for SSR)
 */
export function getServerSnapshot(): boolean {
  return false; // Assume online during SSR
}

/**
 * Notify every subscriber so React re-reads the snapshot.
 */
function notifyListeners(): void {
  listeners.forEach((listener) => listener());
}

/**
 * Start or stop the offline-recovery poll based on the current state.
 * Polling only runs while offline; once back online it is torn down.
 */
function syncPolling(): void {
  if (typeof setInterval === "undefined") return;

  const offline = readOffline();
  if (offline && pollIntervalId === null) {
    pollIntervalId = setInterval(notifyListeners, POLL_INTERVAL_MS);
  } else if (!offline && pollIntervalId !== null) {
    clearInterval(pollIntervalId);
    pollIntervalId = null;
  }
}

/**
 * Single shared handler bound to the window online/offline events. It must
 * notify ALL subscribers (not just the first one) and reconcile polling.
 */
function handleStatusChange(): void {
  notifyListeners();
  syncPolling();
}

/**
 * Subscribe to online/offline changes.
 */
export function subscribe(callback: () => void): () => void {
  listeners.add(callback);

  // Bind the window listeners once, for the first subscriber. The handler is
  // a stable shared function so it can be reliably removed later and so it
  // fans out to every subscriber.
  if (listeners.size === 1 && typeof window !== "undefined") {
    window.addEventListener("online", handleStatusChange);
    window.addEventListener("offline", handleStatusChange);
    // Start polling immediately if we mount while already offline.
    syncPolling();
  }

  return () => {
    listeners.delete(callback);

    // Tear everything down once the last subscriber leaves.
    if (listeners.size === 0) {
      if (typeof window !== "undefined") {
        window.removeEventListener("online", handleStatusChange);
        window.removeEventListener("offline", handleStatusChange);
      }
      if (pollIntervalId !== null) {
        clearInterval(pollIntervalId);
        pollIntervalId = null;
      }
    }
  };
}

/**
 * Hook that detects online/offline status by listening to browser events
 * and checking navigator.onLine. Handles edge cases where navigator.onLine
 * can be unreliable by polling while offline to detect recovery.
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
