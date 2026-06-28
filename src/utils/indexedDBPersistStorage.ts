import type { PersistStorage, StorageValue } from "zustand/middleware";
import { ensureIndexedDBInitialized, STORES } from "./indexedDB";
import {
  clearPendingFlush,
  ensureLifecycleFlush,
  isPersistWritesHalted,
  registerAdapterResetter,
  registerPendingFlush,
  registerSettler,
  settleAllPersistWrites,
} from "./persistWriteQueue";

/**
 * Debounced write-behind IndexedDB adapter for zustand's persist middleware.
 *
 * Use this instead of `createDebouncedPersistStorage` for slices that can
 * exceed localStorage's ~5–10MB per-origin quota. The Soundboard, for example,
 * stores base64-encoded audio recordings inline in its persisted state; on
 * localStorage that silently throws `QuotaExceededError` (historically crashing
 * the app on mobile Safari). IndexedDB has a far larger quota and stores the
 * snapshot via structured clone (no `JSON.stringify` on the hot path).
 *
 * Semantics mirror the localStorage adapter:
 *   - `setItem` records the latest snapshot and debounces the write; the
 *     transaction is committed once per quiet window instead of per mutation.
 *   - pending writes flush on `pagehide` / tab-hidden via the shared
 *     `persistWriteQueue`, so quitting never loses more than the debounce
 *     window (best effort — IndexedDB commits are async, unlike localStorage).
 *   - `getItem` serves a pending snapshot first (read-your-writes), then the
 *     IndexedDB record.
 *
 * Migration: on first read, if IndexedDB has no record for `name` but a legacy
 * localStorage value exists (the slice's previous home), it is parsed, copied
 * into IndexedDB, and the localStorage key is removed to free quota.
 *
 * Backup/restore: records live in `STORES.PERSISTED_STATE`. Manual backup must
 * `await settleAllPersistWrites()` before reading the store so the latest
 * snapshot is captured.
 */

const STORE = STORES.PERSISTED_STATE;

async function writeRecord<S>(
  name: string,
  value: StorageValue<S>
): Promise<void> {
  const db = await ensureIndexedDBInitialized();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, name);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function readRecord<S>(
  name: string
): Promise<StorageValue<S> | null | undefined> {
  const db = await ensureIndexedDBInitialized();
  try {
    return await new Promise<StorageValue<S> | null | undefined>(
      (resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).get(name);
        req.onsuccess = () =>
          resolve(req.result as StorageValue<S> | null | undefined);
        req.onerror = () => reject(req.error);
      }
    );
  } finally {
    db.close();
  }
}

async function deleteRecord(name: string): Promise<void> {
  const db = await ensureIndexedDBInitialized();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(name);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function clearRecords(): Promise<void> {
  const db = await ensureIndexedDBInitialized();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/**
 * One-time migration of a slice that previously persisted to localStorage.
 * Returns the parsed value (now also written to IndexedDB) or null.
 */
async function migrateFromLocalStorage<S>(
  name: string
): Promise<StorageValue<S> | null> {
  if (typeof localStorage === "undefined") return null;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(name);
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed: StorageValue<S>;
  try {
    parsed = JSON.parse(raw) as StorageValue<S>;
  } catch (error) {
    console.error(
      `[indexedDBPersistStorage] Failed to parse legacy "${name}":`,
      error
    );
    return null;
  }
  try {
    await writeRecord(name, parsed);
    localStorage.removeItem(name);
  } catch (error) {
    // Keep the legacy key if the copy failed so data isn't lost.
    console.error(
      `[indexedDBPersistStorage] Failed to migrate "${name}" to IndexedDB:`,
      error
    );
  }
  return parsed;
}

export function createIndexedDBPersistStorage<S>(
  options: { delayMs?: number } = {}
): PersistStorage<S> {
  const delayMs = options.delayMs ?? 500;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingName: string | null = null;
  let pendingValue: StorageValue<S> | null = null;
  // Serializes async IndexedDB commits so an older transaction cannot finish
  // after a newer one and restore stale state.
  let writeChain: Promise<void> = Promise.resolve();
  const inFlightValues = new Map<string, StorageValue<S>>();

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
    inFlightValues.set(name, value);
    writeChain = writeChain
      .then(() => writeRecord(name, value))
      .catch((error) => {
        console.error(
          `[indexedDBPersistStorage] Failed to write "${name}":`,
          error
        );
      })
      .finally(() => {
        if (inFlightValues.get(name) === value) {
          inFlightValues.delete(name);
        }
      });
  };

  const settle = async () => {
    await writeChain;
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
    inFlightValues.clear();
    writeChain = Promise.resolve();
  };

  registerSettler(settle);
  registerAdapterResetter(resetForTests);

  return {
    getItem: async (name) => {
      // Read-your-writes: a queued snapshot is newer than IndexedDB.
      if (pendingName === name && pendingValue !== null) {
        return pendingValue;
      }
      if (inFlightValues.has(name)) {
        return inFlightValues.get(name) ?? null;
      }
      try {
        const record = await readRecord<S>(name);
        if (record !== undefined && record !== null) {
          return record;
        }
      } catch (error) {
        console.error(
          `[indexedDBPersistStorage] Failed to read "${name}":`,
          error
        );
      }
      // No IndexedDB record yet — fall back to the legacy localStorage slice.
      return migrateFromLocalStorage<S>(name);
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

    removeItem: async (name) => {
      if (pendingName === name) {
        pendingName = null;
        pendingValue = null;
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
        clearPendingFlush(name);
      }
      try {
        await deleteRecord(name);
      } catch (error) {
        console.error(
          `[indexedDBPersistStorage] Failed to remove "${name}":`,
          error
        );
      }
      try {
        if (typeof localStorage !== "undefined") localStorage.removeItem(name);
      } catch {
        // ignore — best-effort legacy cleanup
      }
    },
  };
}

/**
 * Flush and await all pending persist writes (localStorage + IndexedDB).
 * Call before reading raw IndexedDB persist records (manual backup).
 */
export async function settlePersistWrites(): Promise<void> {
  await settleAllPersistWrites();
}

/**
 * Clear every Zustand persist slice stored in IndexedDB.
 *
 * Used by system reset after write-behind queues have settled and been halted,
 * so IndexedDB-backed app state follows the same reset semantics as
 * localStorage-backed app state.
 */
export async function clearIndexedDBPersistedState(): Promise<void> {
  await clearRecords();
}
