/**
 * Shared reload-loop guard.
 *
 * Stale-bundle / chunk-recovery code in several places (main.tsx, prefetch.ts,
 * and the inline bootstrap script in index.html) must avoid reloading forever
 * when something is persistently broken. They coordinate through these
 * sessionStorage keys. This module centralizes the logic so the TS callers
 * stay in sync; the inline index.html script mirrors the same keys/limits.
 */

import {
  LEGACY_STORAGE_KEYS,
  migrateSessionStorageKey,
  STORAGE_KEYS,
} from "@/utils/storageKeys";

export const RELOAD_COUNT_KEY = "ryos:reload-count";
export const RELOAD_WINDOW_KEY = "ryos:reload-window-start";
export const STALE_RELOAD_KEY = STORAGE_KEYS.staleReload;

migrateSessionStorageKey(
  LEGACY_STORAGE_KEYS.staleReload,
  STALE_RELOAD_KEY
);

export const MAX_RELOADS_PER_WINDOW = 3;
export const RELOAD_WINDOW_MS = 60_000; // 1 minute
export const STALE_RELOAD_COOLDOWN_MS = 10_000; // 10 seconds

function readInt(storage: Storage, key: string): number {
  return parseInt(storage.getItem(key) || "0", 10);
}

function getSessionStorage(): Storage | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    return sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Returns true if we've already reloaded too many times within the rolling
 * window. Also resets the counter when the window has elapsed.
 */
export function isInReloadLoop(): boolean {
  const storage = getSessionStorage();
  if (!storage) return false;
  try {
    const count = readInt(storage, RELOAD_COUNT_KEY);
    const windowStart = readInt(storage, RELOAD_WINDOW_KEY);
    if (!windowStart || Date.now() - windowStart > RELOAD_WINDOW_MS) {
      storage.removeItem(RELOAD_COUNT_KEY);
      storage.removeItem(RELOAD_WINDOW_KEY);
      return false;
    }
    return count >= MAX_RELOADS_PER_WINDOW;
  } catch {
    return false;
  }
}

/**
 * Record that a reload is happening (for loop detection).
 */
export function trackReload(): void {
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    const windowStart = readInt(storage, RELOAD_WINDOW_KEY);
    const count = readInt(storage, RELOAD_COUNT_KEY);
    if (!windowStart || Date.now() - windowStart > RELOAD_WINDOW_MS) {
      storage.setItem(RELOAD_WINDOW_KEY, String(Date.now()));
      storage.setItem(RELOAD_COUNT_KEY, "1");
    } else {
      storage.setItem(RELOAD_COUNT_KEY, String(count + 1));
    }
  } catch {
    // sessionStorage may be unavailable
  }
}

/**
 * Returns true if a stale-bundle reload happened within the cooldown window
 * and we should therefore NOT reload again yet.
 */
export function isStaleReloadOnCooldown(): boolean {
  const storage = getSessionStorage();
  if (!storage) return false;
  try {
    const last = storage.getItem(STALE_RELOAD_KEY);
    if (!last) return false;
    return Date.now() - parseInt(last, 10) < STALE_RELOAD_COOLDOWN_MS;
  } catch {
    return false;
  }
}

/**
 * Mark that a stale-bundle reload is happening now (starts the cooldown).
 */
export function markStaleReload(): void {
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    storage.setItem(STALE_RELOAD_KEY, String(Date.now()));
  } catch {
    // sessionStorage may be unavailable
  }
}

/**
 * Clear the stale-reload cooldown (e.g. after a successful fresh load).
 */
export function clearStaleReload(): void {
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    storage.removeItem(STALE_RELOAD_KEY);
  } catch {
    // sessionStorage may be unavailable
  }
}
