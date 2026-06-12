import type { PersistStorage, StorageValue } from "zustand/middleware";

/**
 * Debounced write-behind localStorage adapter for zustand's persist
 * middleware.
 *
 * `createJSONStorage(() => localStorage)` serializes the entire partialized
 * slice and writes it synchronously on EVERY persisted mutation. For large
 * slices (Files VFS, chat history, iPod library) that means multi-MB
 * `JSON.stringify` + sync disk writes on hot paths like appending a chat
 * message or renaming a file.
 *
 * This adapter keeps localStorage as the authoritative storage (backup,
 * restore, and reset flows that read the raw keys keep working) but:
 *   - `setItem` only records the latest snapshot and starts a debounce
 *     timer; serialization happens once per quiet window instead of once
 *     per mutation (zustand state is immutable, so the held reference is a
 *     consistent snapshot).
 *   - pending writes are flushed on `pagehide` / tab-hidden so quitting the
 *     app never loses more than the current debounce window — the same
 *     guarantee browsers give localStorage itself on crash.
 *   - `getItem` serves a pending snapshot first (read-your-writes).
 *
 * Flows that read the raw localStorage keys directly (system reset, manual
 * backup) must call `flushDebouncedPersistWrites()` first.
 */

type PendingFlush = () => void;

// name -> flush, so a global flush can drain every adapter instance.
const pendingFlushes = new Map<string, PendingFlush>();
let lifecycleFlushRegistered = false;
let halted = false;

/** Synchronously write out every pending persist snapshot. */
export function flushDebouncedPersistWrites(): void {
  for (const flush of Array.from(pendingFlushes.values())) {
    flush();
  }
}

/**
 * Stop all further persist writes until the page reloads. Used by
 * restore/reset flows that rewrite localStorage directly and then reload:
 * without this, an in-memory store mutation queued during the restore window
 * would be flushed by the pagehide handler mid-reload and clobber freshly
 * restored keys with pre-restore state.
 */
export function haltDebouncedPersistWrites(): void {
  halted = true;
  pendingFlushes.clear();
}

function ensureLifecycleFlush(): void {
  if (lifecycleFlushRegistered || typeof window === "undefined") return;
  lifecycleFlushRegistered = true;
  window.addEventListener("pagehide", flushDebouncedPersistWrites);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushDebouncedPersistWrites();
    }
  });
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
    if (halted) {
      pendingName = null;
      pendingValue = null;
      return;
    }
    if (pendingName === null || pendingValue === null) return;
    const name = pendingName;
    const value = pendingValue;
    pendingName = null;
    pendingValue = null;
    pendingFlushes.delete(name);
    try {
      localStorage.setItem(name, JSON.stringify(value));
    } catch (error) {
      console.error(
        `[debouncedPersistStorage] Failed to write "${name}":`,
        error
      );
    }
  };

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
      if (halted) return;
      ensureLifecycleFlush();
      pendingName = name;
      pendingValue = value;
      pendingFlushes.set(name, writeNow);
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
        pendingFlushes.delete(name);
      }
      localStorage.removeItem(name);
    },
  };
}
