import type { PersistStorage, StorageValue } from "zustand/middleware";
import { ensureIndexedDBInitialized, STORES } from "./indexedDB";
import {
  clearPendingFlush,
  ensureLifecycleFlush,
  getPersistEpoch,
  isPersistEpochCurrent,
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
 * exceed localStorage's ~5–10MB per-origin quota but still fit a single
 * snapshot. Entity-heavy slices use `createSplitIndexedDBPersistStorage`
 * instead. IndexedDB has a far larger quota and stores the snapshot via
 * structured clone (no `JSON.stringify` on the hot path).
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
  value: StorageValue<S>,
  expectedEpoch?: string
): Promise<boolean> {
  if (expectedEpoch && !isPersistEpochCurrent(expectedEpoch)) return false;
  const db = await ensureIndexedDBInitialized();
  try {
    if (expectedEpoch && !isPersistEpochCurrent(expectedEpoch)) return false;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, name);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    return true;
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

async function moveLegacyRecord<S>(
  canonicalName: string,
  legacyName: string,
  expectedEpoch: string
): Promise<StorageValue<S> | null> {
  if (!isPersistEpochCurrent(expectedEpoch)) return null;
  const db = await ensureIndexedDBInitialized();
  try {
    if (!isPersistEpochCurrent(expectedEpoch)) return null;
    return await new Promise<StorageValue<S> | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      let result: StorageValue<S> | null = null;
      const canonicalRequest = store.get(canonicalName);

      canonicalRequest.onsuccess = () => {
        if (canonicalRequest.result != null) {
          result = canonicalRequest.result as StorageValue<S>;
          return;
        }
        const legacyRequest = store.get(legacyName);
        legacyRequest.onsuccess = () => {
          if (legacyRequest.result == null) return;
          result = legacyRequest.result as StorageValue<S>;
          store.put(result, canonicalName);
          store.delete(legacyName);
        };
      };

      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () =>
        reject(tx.error ?? new Error("Persist key migration aborted"));
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
  name: string,
  legacyNames: readonly string[],
  expectedEpoch: string
): Promise<StorageValue<S> | null> {
  if (typeof localStorage === "undefined") return null;
  let sourceName: string | null = null;
  let raw: string | null = null;
  for (const candidate of [name, ...legacyNames]) {
    try {
      raw = localStorage.getItem(candidate);
    } catch {
      return null;
    }
    if (raw) {
      sourceName = candidate;
      break;
    }
  }
  if (!raw || !sourceName) return null;
  let parsed: StorageValue<S>;
  try {
    parsed = JSON.parse(raw) as StorageValue<S>;
  } catch (error) {
    console.error(
      `[indexedDBPersistStorage] Failed to parse legacy "${sourceName}":`,
      error
    );
    return null;
  }
  try {
    if (!isPersistEpochCurrent(expectedEpoch)) return parsed;
    const committed = await writeRecord(name, parsed, expectedEpoch);
    if (committed && isPersistEpochCurrent(expectedEpoch)) {
      localStorage.removeItem(sourceName);
    }
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
  options: { delayMs?: number; legacyNames?: readonly string[] } = {}
): PersistStorage<S> {
  const delayMs = options.delayMs ?? 500;
  const legacyNames = [...new Set(options.legacyNames ?? [])];
  const adapterEpoch = getPersistEpoch();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingName: string | null = null;
  let pendingValue: StorageValue<S> | null = null;
  // Resolves once the most recently kicked-off write commits.
  let inFlight: Promise<void> = Promise.resolve();
  let writeError: unknown = null;
  const hydratingNames = new Set<string>();
  const writesDuringHydration = new Set<string>();

  const writeNow = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (pendingName !== null && hydratingNames.has(pendingName)) {
      writesDuringHydration.add(pendingName);
      return;
    }
    if (
      isPersistWritesHalted() ||
      !isPersistEpochCurrent(adapterEpoch)
    ) {
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
    // Serialize commits for this adapter. Without chaining, a slower older
    // transaction could finish after a newer snapshot and overwrite it.
    inFlight = inFlight
      .then(() => writeRecord(name, value, adapterEpoch))
      .then(() => {
        writeError = null;
      })
      .catch((error) => {
        writeError = error;
        console.error(
          `[indexedDBPersistStorage] Failed to write "${name}":`,
          error
        );
      });
  };

  const settle = async () => {
    await inFlight;
    if (writeError) throw writeError;
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
    inFlight = Promise.resolve();
    writeError = null;
    hydratingNames.clear();
    writesDuringHydration.clear();
  };

  registerSettler(settle);
  registerAdapterResetter(resetForTests);

  return {
    getItem: async (name) => {
      // Read-your-writes: a queued snapshot is newer than IndexedDB.
      if (pendingName === name && pendingValue !== null) {
        return pendingValue;
      }
      hydratingNames.add(name);
      try {
        const record = await readRecord<S>(name);
        if (record !== undefined && record !== null) {
          return record;
        }
        for (const legacyName of legacyNames) {
          try {
            const legacyRecord = await moveLegacyRecord<S>(
              name,
              legacyName,
              adapterEpoch
            );
            if (legacyRecord) return legacyRecord;
          } catch (error) {
            console.error(
              `[indexedDBPersistStorage] Failed to rename "${legacyName}" to "${name}":`,
              error
            );
            const retainedLegacy = await readRecord<S>(legacyName);
            if (retainedLegacy != null) return retainedLegacy;
          }
        }
        // No IndexedDB record yet — fall back to legacy localStorage slices.
        return migrateFromLocalStorage<S>(
          name,
          legacyNames,
          adapterEpoch
        );
      } catch (error) {
        console.error(
          `[indexedDBPersistStorage] Failed to read "${name}":`,
          error
        );
      } finally {
        hydratingNames.delete(name);
        if (writesDuringHydration.delete(name) && pendingName === name) {
          if (timer !== null) {
            clearTimeout(timer);
            timer = null;
          }
          pendingName = null;
          pendingValue = null;
          clearPendingFlush(name);
        }
      }
      return null;
    },

    setItem: (name, value) => {
      if (
        isPersistWritesHalted() ||
        !isPersistEpochCurrent(adapterEpoch)
      ) {
        return;
      }
      if (hydratingNames.has(name)) writesDuringHydration.add(name);
      ensureLifecycleFlush();
      pendingName = name;
      pendingValue = value;
      registerPendingFlush(name, writeNow);
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(writeNow, delayMs);
    },

    removeItem: async (name) => {
      if (!isPersistEpochCurrent(adapterEpoch)) return;
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
        for (const legacyName of legacyNames) {
          await deleteRecord(legacyName);
        }
      } catch (error) {
        console.error(
          `[indexedDBPersistStorage] Failed to remove "${name}":`,
          error
        );
      }
      try {
        if (typeof localStorage !== "undefined") {
          localStorage.removeItem(name);
          for (const legacyName of legacyNames) {
            localStorage.removeItem(legacyName);
          }
        }
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
