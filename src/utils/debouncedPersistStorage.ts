import type { PersistStorage, StorageValue } from "zustand/middleware";
import {
  clearPendingFlush,
  ensureLifecycleFlush,
  flushAllPersistWrites,
  haltPersistWrites,
  isPersistWritesHalted,
  registerAdapterResetter,
  registerPendingFlush,
  resetPersistWritesForTests,
  resumePersistWrites,
} from "./persistWriteQueue";

/**
 * Debounced write-behind localStorage adapter for zustand's persist
 * middleware.
 *
 * `createJSONStorage(() => localStorage)` serializes the entire partialized
 * slice and writes it synchronously on EVERY persisted mutation. For large
 * slices that still fit comfortably within the Web Storage quota, that can
 * mean avoidable `JSON.stringify` + sync disk writes on hot mutation paths.
 *
 * This adapter keeps localStorage as the authoritative storage but:
 *   - `setItem` only records the latest snapshot and starts a debounce
 *     timer; serialization happens once per quiet window instead of once
 *     per mutation (zustand state is immutable, so the held reference is a
 *     consistent snapshot).
 *   - pending writes are flushed on `pagehide` / tab-hidden so quitting the
 *     app never loses more than the current debounce window — the same
 *     guarantee browsers give localStorage itself on crash.
 *   - `getItem` serves a pending snapshot first (read-your-writes).
 *
 * Write scheduling (debounce timer, lifecycle flush, and the halt switch) is
 * shared with the IndexedDB adapter via `persistWriteQueue`, so a single flush
 * drains every adapter instance regardless of backing store.
 */

/** Synchronously write out every pending persist snapshot. */
export function flushDebouncedPersistWrites(): void {
  flushAllPersistWrites();
}

/**
 * Stop all further persist writes until the page reloads. Used by
 * restore/reset flows that rewrite storage directly and then reload:
 * without this, an in-memory store mutation queued during the restore window
 * would be flushed by the pagehide handler mid-reload and clobber freshly
 * restored keys with pre-restore state.
 */
export function haltDebouncedPersistWrites(): void {
  haltPersistWrites();
}

/** Resume writes when a restore/reset operation aborts before reload. */
export function resumeDebouncedPersistWrites(): void {
  resumePersistWrites();
}

/** @internal Test-only reset for Bun's shared-process test runner. */
export function resetDebouncedPersistWritesForTests(): void {
  resetPersistWritesForTests();
}

export function createDebouncedPersistStorage<S>(
  options: { delayMs?: number } = {}
): PersistStorage<S> {
  const delayMs = options.delayMs ?? 500;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingName: string | null = null;
  let pendingValue: StorageValue<S> | null = null;

  const writeNow = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (isPersistWritesHalted()) {
      pendingName = null;
      pendingValue = null;
      return;
    }
    if (pendingName === null || pendingValue === null) return;
    const name = pendingName;
    const value = pendingValue;
    pendingName = null;
    pendingValue = null;
    clearPendingFlush(name);
    try {
      localStorage.setItem(name, JSON.stringify(value));
    } catch (error) {
      console.error(
        `[debouncedPersistStorage] Failed to write "${name}":`,
        error
      );
    }
  };

  const resetForTests = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (pendingName !== null) {
      clearPendingFlush(pendingName);
    }
    pendingName = null;
    pendingValue = null;
  };

  registerAdapterResetter(resetForTests);

  return {
    getItem: (name) => {
      // Read-your-writes: a queued snapshot is newer than localStorage.
      if (pendingName === name && pendingValue !== null) {
        return pendingValue;
      }
      const raw = localStorage.getItem(name);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as StorageValue<S>;
      } catch (error) {
        console.error(
          `[debouncedPersistStorage] Failed to parse "${name}":`,
          error
        );
        return null;
      }
    },

    setItem: (name, value) => {
      if (isPersistWritesHalted()) return;
      ensureLifecycleFlush();
      pendingName = name;
      pendingValue = value;
      registerPendingFlush(name, writeNow);
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(writeNow, delayMs);
    },

    removeItem: (name) => {
      if (pendingName === name) {
        pendingName = null;
        pendingValue = null;
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
        clearPendingFlush(name);
      }
      localStorage.removeItem(name);
    },
  };
}
