import type { PersistStorage, StorageValue } from "zustand/middleware";

/**
 * Zustand persist storage that resolves `localStorage` on every call.
 *
 * Unlike `createJSONStorage(() => localStorage)`, which eagerly captures the
 * Storage object at store-module init, this adapter always reads/writes the
 * current global `localStorage`. That matters in Bun's shared-process test
 * runner: happy-dom suites can replace `localStorage`, and an eagerly
 * captured reference keeps pointing at the stale (often empty) Storage after
 * unregister — so `persist.rehydrate()` ignores seeds written to the live
 * MemoryStorage installed by the test setup.
 */
export function createLiveJsonStorage<S>(): PersistStorage<S> {
  return {
    getItem: (name) => {
      const raw = localStorage.getItem(name);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as StorageValue<S>;
      } catch (error) {
        console.error(`[liveJsonStorage] Failed to parse "${name}":`, error);
        return null;
      }
    },
    setItem: (name, value) => {
      localStorage.setItem(name, JSON.stringify(value));
    },
    removeItem: (name) => {
      localStorage.removeItem(name);
    },
  };
}
