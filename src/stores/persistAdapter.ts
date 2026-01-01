import { createJSONStorage, persist, type PersistOptions } from "zustand/middleware";
import type { StateCreator } from "zustand";

/**
 * Wrapper helpers for creating safe, JSON-based persisted Zustand stores.
 * Adds guardrails around storage access (parse/write failures won't throw)
 * and centralizes configuration so stores share consistent behavior.
 */

export type PersistedStoreMeta = {
  /** Milliseconds since epoch when the store was last updated (optional). */
  _updatedAt?: number;
};

type BasePersistConfig<T> = Omit<PersistOptions<T>, "name" | "storage"> & {
  /** Storage key used by persist. */
  name: string;
  /** Optional custom storage provider (defaults to localStorage). */
  storage?: () => Storage;
};

const createSafeJSONStorage = (getStorage?: () => Storage) => {
  const base = createJSONStorage(getStorage ?? (() => localStorage));

  return {
    ...base,
    getItem: (name: string) => {
      try {
        return base.getItem(name);
      } catch (error) {
        console.error(`[persist] Failed to parse stored value for "${name}"`, error);
        return null;
      }
    },
    setItem: (name: string, value: unknown) => {
      try {
        base.setItem(name, value);
      } catch (error) {
        console.error(`[persist] Failed to write value for "${name}"`, error);
      }
    },
    removeItem: (name: string) => {
      try {
        base.removeItem(name);
      } catch (error) {
        console.error(`[persist] Failed to remove value for "${name}"`, error);
      }
    },
  };
};

/**
 * Create a persisted store with a shared, safe JSON storage adapter.
 */
export function createPersistedStore<T extends object>(
  config: StateCreator<T, [], [], T>,
  options: BasePersistConfig<T>
) {
  const storage = createSafeJSONStorage(options.storage);

  return persist(config, {
    name: options.name,
    version: options.version,
    storage,
    partialize: options.partialize,
    migrate: options.migrate,
    onRehydrateStorage: options.onRehydrateStorage,
    skipHydration: options.skipHydration,
  });
}
