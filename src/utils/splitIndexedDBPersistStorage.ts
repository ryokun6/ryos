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
} from "./persistWriteQueue";

export interface SplitPersistRow {
  key: string;
  value: Record<string, unknown>;
  /** Build expensive/binary row values only when the row actually changed. */
  materialize?: () =>
    | Record<string, unknown>
    | Promise<Record<string, unknown>>;
  /**
   * In-memory change token. Prefer an entity/array reference (or a primitive
   * payload) so unchanged rows avoid another IDB put after hydration.
   */
  revision?: unknown;
  /** A second cheap token for metadata coupled to the row payload. */
  secondaryRevision?: unknown;
  /** Optional stable ordering field compared alongside `revision`. */
  position?: number;
}

export type SplitPersistRowsByStore = Record<
  string,
  readonly SplitPersistRow[]
>;

export interface SplitPersistSnapshot<S> {
  /** Small Zustand-compatible state retained in `persisted_state`. */
  metadata: S;
  /** Entity rows written to dedicated object stores. */
  rows: SplitPersistRowsByStore;
}

export interface SplitIndexedDBPersistStorageOptions<S> {
  /** Dedicated object stores owned exclusively by this persisted slice. */
  stores: readonly string[];
  /** Layout version, independent of Zustand's persisted-state version. */
  layoutVersion: number;
  /** Current Zustand version; older snapshots are left inline for migrate(). */
  persistVersion?: number;
  /** Previous persist names copied into the canonical `name` on first read. */
  legacyNames?: readonly string[];
  delayMs?: number;
  split: (
    state: S
  ) => SplitPersistSnapshot<S> | Promise<SplitPersistSnapshot<S>>;
  merge: (
    metadata: S,
    rows: Readonly<SplitPersistRowsByStore>
  ) => S | Promise<S>;
}

interface SplitStorageValue<S> extends StorageValue<S> {
  __ryosSplitLayout?: {
    version: number;
    generation?: string;
  };
}

const METADATA_STORE = STORES.PERSISTED_STATE;

const unique = (values: readonly string[]): string[] => [...new Set(values)];

const isStorageValue = <S>(value: unknown): value is StorageValue<S> =>
  !!value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  "state" in value;

async function readMetadataRecord<S>(
  name: string
): Promise<SplitStorageValue<S> | null> {
  const db = await ensureIndexedDBInitialized();
  try {
    return await new Promise<SplitStorageValue<S> | null>((resolve, reject) => {
      const tx = db.transaction(METADATA_STORE, "readonly");
      const request = tx.objectStore(METADATA_STORE).get(name);
      request.onsuccess = () =>
        resolve(
          request.result && isStorageValue<S>(request.result)
            ? (request.result as SplitStorageValue<S>)
            : null
        );
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

async function readSplitRecord<S>(
  name: string,
  storeNames: readonly string[]
): Promise<{
  record: SplitStorageValue<S> | null;
  rows: SplitPersistRowsByStore;
}> {
  const db = await ensureIndexedDBInitialized();
  try {
    return await new Promise((resolve, reject) => {
      const names = unique([METADATA_STORE, ...storeNames]);
      const tx = db.transaction(names, "readonly");
      const rows: SplitPersistRowsByStore = {};
      let record: SplitStorageValue<S> | null = null;

      const metadataRequest = tx.objectStore(METADATA_STORE).get(name);
      metadataRequest.onsuccess = () => {
        record = isStorageValue<S>(metadataRequest.result)
          ? (metadataRequest.result as SplitStorageValue<S>)
          : null;
      };

      for (const storeName of storeNames) {
        const storeRows: SplitPersistRow[] = [];
        const request = tx.objectStore(storeName).openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) {
            const value = cursor.value;
            if (value && typeof value === "object" && !Array.isArray(value)) {
              storeRows.push({
                key: String(cursor.key),
                value: value as Record<string, unknown>,
              });
            }
            cursor.continue();
            return;
          }
          rows[storeName] = storeRows;
        };
      }

      tx.oncomplete = () => resolve({ record, rows });
      tx.onerror = () => reject(tx.error);
      tx.onabort = () =>
        reject(tx.error ?? new Error("Split persist read aborted"));
    });
  } finally {
    db.close();
  }
}

const createGeneration = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

function indexRows(
  storeNames: readonly string[],
  rows: Readonly<SplitPersistRowsByStore>
): Map<string, Map<string, SplitPersistRow>> {
  const indexed = new Map<string, Map<string, SplitPersistRow>>();
  for (const storeName of storeNames) {
    indexed.set(
      storeName,
      new Map((rows[storeName] ?? []).map((row) => [row.key, row]))
    );
  }
  return indexed;
}

function attachPersistedValues(
  rows: Map<string, Map<string, SplitPersistRow>>,
  persistedRows: Readonly<SplitPersistRowsByStore>
): Map<string, Map<string, SplitPersistRow>> {
  for (const [storeName, storeRows] of rows) {
    const persisted = new Map(
      (persistedRows[storeName] ?? []).map((row) => [row.key, row.value])
    );
    for (const [key, row] of storeRows) {
      const value = persisted.get(key);
      if (value) storeRows.set(key, { ...row, value });
    }
  }
  return rows;
}

function rowsEqual(
  previous: SplitPersistRow,
  next: SplitPersistRow
): boolean {
  return (
    Object.is(previous.revision, next.revision) &&
    Object.is(previous.secondaryRevision, next.secondaryRevision) &&
    previous.position === next.position
  );
}

async function readLegacyLocalStorage<S>(
  names: readonly string[]
): Promise<{ name: string; value: StorageValue<S> } | null> {
  if (typeof localStorage === "undefined") return null;
  for (const name of names) {
    try {
      const raw = localStorage.getItem(name);
      if (!raw) continue;
      const parsed: unknown = JSON.parse(raw);
      if (isStorageValue<S>(parsed)) return { name, value: parsed };
    } catch (error) {
      console.error(
        `[splitIndexedDBPersistStorage] Failed to parse legacy "${name}":`,
        error
      );
    }
  }
  return null;
}

/**
 * Zustand persistence backed by a small metadata snapshot plus dedicated IDB
 * entity stores. Existing store APIs remain synchronous/in-memory; hydration
 * reassembles the original shape, and writes update only changed entity rows.
 */
export function createSplitIndexedDBPersistStorage<S>(
  options: SplitIndexedDBPersistStorageOptions<S>
): PersistStorage<S> {
  const storeNames = unique(options.stores);
  const delayMs = options.delayMs ?? 500;
  const legacyNames = unique(options.legacyNames ?? []);
  const adapterEpoch = getPersistEpoch();

  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingName: string | null = null;
  let pendingValue: StorageValue<S> | null = null;
  let inFlight: Promise<void> = Promise.resolve();
  let writeError: unknown = null;
  let lastRows = new Map<string, Map<string, SplitPersistRow>>();
  let hasBaseline = false;
  let baselineGeneration: string | null = null;
  const hydratingNames = new Set<string>();
  const writesDuringHydration = new Set<string>();

  const cleanupLegacyStorage = async (canonicalName: string) => {
    if (!isPersistEpochCurrent(adapterEpoch)) return;
    const names = unique([canonicalName, ...legacyNames]);
    if (typeof localStorage !== "undefined") {
      for (const name of names) {
        if (!isPersistEpochCurrent(adapterEpoch)) return;
        try {
          localStorage.removeItem(name);
        } catch {
          // best-effort legacy cleanup
        }
      }
    }
  };

  const writeSnapshot = async (
    name: string,
    value: StorageValue<S>,
    replaceAll: boolean
  ): Promise<void> => {
    const split = await options.split(value.state);
    const nextRows = indexRows(storeNames, split.rows);
    const materializedRows = new Map<string, Map<string, Record<string, unknown>>>();

    for (const storeName of storeNames) {
      const previous = lastRows.get(storeName) ?? new Map();
      const next = nextRows.get(storeName) ?? new Map();
      const values = new Map<string, Record<string, unknown>>();
      for (const [key, row] of next) {
        const prior = previous.get(key);
        if (replaceAll || !hasBaseline || !prior || !rowsEqual(prior, row)) {
          values.set(
            key,
            row.materialize ? await row.materialize() : row.value
          );
        }
      }
      materializedRows.set(storeName, values);
    }

    if (!isPersistEpochCurrent(adapterEpoch)) return;
    const generation = createGeneration();
    const db = await ensureIndexedDBInitialized();
    if (!isPersistEpochCurrent(adapterEpoch)) {
      db.close();
      return;
    }

    try {
      await new Promise<void>((resolve, reject) => {
        const transactionStores = unique([METADATA_STORE, ...storeNames]);
        const tx = db.transaction(transactionStores, "readwrite");
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () =>
          reject(tx.error ?? new Error("Split persist transaction aborted"));

        try {
          const metadataStore = tx.objectStore(METADATA_STORE);
          const currentMetadataRequest = metadataStore.get(name);
          currentMetadataRequest.onsuccess = () => {
            try {
              if (!isPersistEpochCurrent(adapterEpoch)) {
                tx.abort();
                return;
              }
              const currentMetadata = isStorageValue<S>(
                currentMetadataRequest.result
              )
                ? (currentMetadataRequest.result as SplitStorageValue<S>)
                : null;
              const currentGeneration =
                currentMetadata?.__ryosSplitLayout?.generation ?? null;
              const replaceEntityStores =
                replaceAll ||
                !hasBaseline ||
                currentGeneration !== baselineGeneration;

              const metadata: SplitStorageValue<S> = {
                state: split.metadata,
                version: value.version,
                __ryosSplitLayout: {
                  version: options.layoutVersion,
                  generation,
                },
              };
              metadataStore.put(metadata, name);
              for (const legacyName of legacyNames) {
                metadataStore.delete(legacyName);
              }

              for (const storeName of storeNames) {
                const entityStore = tx.objectStore(storeName);
                const previous = lastRows.get(storeName) ?? new Map();
                const next = nextRows.get(storeName) ?? new Map();
                const materialized =
                  materializedRows.get(storeName) ?? new Map();

                if (replaceEntityStores) {
                  entityStore.clear();
                  for (const [key, row] of next) {
                    entityStore.put(
                      materialized.get(key) ??
                        previous.get(key)?.value ??
                        row.value,
                      key
                    );
                  }
                  continue;
                }

                for (const [key, row] of next) {
                  const prior = previous.get(key);
                  if (!prior || !rowsEqual(prior, row)) {
                    entityStore.put(
                      materialized.get(key) ?? row.value,
                      key
                    );
                  }
                }
                for (const key of previous.keys()) {
                  if (!next.has(key)) entityStore.delete(key);
                }
              }
            } catch (error) {
              tx.abort();
              reject(error);
            }
          };
        } catch (error) {
          tx.abort();
          reject(error);
        }
      });

      for (const [storeName, rows] of nextRows) {
        const previous = lastRows.get(storeName) ?? new Map();
        const materialized = materializedRows.get(storeName) ?? new Map();
        for (const [key, row] of rows) {
          rows.set(key, {
            ...row,
            value:
              materialized.get(key) ?? previous.get(key)?.value ?? row.value,
          });
        }
      }
      lastRows = nextRows;
      hasBaseline = true;
      baselineGeneration = generation;
      await cleanupLegacyStorage(name);
    } finally {
      db.close();
    }
  };

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

    inFlight = inFlight
      .then(() => writeSnapshot(name, value, false))
      .then(() => {
        writeError = null;
      })
      .catch((error) => {
        writeError = error;
        console.error(
          `[splitIndexedDBPersistStorage] Failed to write "${name}":`,
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
    if (pendingName !== null) clearPendingFlush(pendingName);
    pendingName = null;
    pendingValue = null;
    inFlight = Promise.resolve();
    writeError = null;
    lastRows = new Map();
    hasBaseline = false;
    baselineGeneration = null;
    hydratingNames.clear();
    writesDuringHydration.clear();
  };

  registerSettler(settle);
  registerAdapterResetter(resetForTests);

  return {
    getItem: async (name) => {
      if (pendingName === name && pendingValue !== null) return pendingValue;

      hydratingNames.add(name);
      try {
        let record = await readMetadataRecord<S>(name);
        let sourceName = name;

        if (!record) {
          for (const legacyName of legacyNames) {
            record = await readMetadataRecord<S>(legacyName);
            if (record) {
              sourceName = legacyName;
              break;
            }
          }
        }

        if (!record) {
          const legacy = await readLegacyLocalStorage<S>([
            name,
            ...legacyNames,
          ]);
          if (legacy) {
            sourceName = legacy.name;
            record = legacy.value;
          }
        }

        if (!record) return null;

        const splitVersion = record.__ryosSplitLayout?.version;
        if (splitVersion !== undefined) {
          const splitRecord = await readSplitRecord<S>(
            sourceName,
            storeNames
          );
          if (!splitRecord.record) return null;
          record = splitRecord.record;
          const mergedState = await options.merge(
            record.state,
            splitRecord.rows
          );
          const merged: StorageValue<S> = {
            state: mergedState,
            version: record.version,
          };
          const baseline = await options.split(mergedState);
          lastRows = attachPersistedValues(
            indexRows(storeNames, baseline.rows),
            splitRecord.rows
          );
          hasBaseline = true;
          baselineGeneration =
            record.__ryosSplitLayout?.generation ?? null;

          if (
            splitVersion !== options.layoutVersion ||
            sourceName !== name
          ) {
            await writeSnapshot(name, merged, true);
          }
          return merged;
        }

        // Let Zustand run its version migration before splitting old layouts.
        if (
          options.persistVersion !== undefined &&
          record.version !== options.persistVersion
        ) {
          return { state: record.state, version: record.version };
        }

        const legacyFull: StorageValue<S> = {
          state: record.state,
          version: record.version,
        };
        await writeSnapshot(name, legacyFull, true);
        return legacyFull;
      } catch (error) {
        console.error(
          `[splitIndexedDBPersistStorage] Failed to hydrate "${name}":`,
          error
        );
        return null;
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

      const db = await ensureIndexedDBInitialized();
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(
            unique([METADATA_STORE, ...storeNames]),
            "readwrite"
          );
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () =>
            reject(tx.error ?? new Error("Split persist removal aborted"));
          const metadataStore = tx.objectStore(METADATA_STORE);
          metadataStore.delete(name);
          for (const legacyName of legacyNames) {
            metadataStore.delete(legacyName);
          }
          for (const storeName of storeNames) {
            tx.objectStore(storeName).clear();
          }
        });
        await cleanupLegacyStorage(name);
        lastRows = new Map();
        hasBaseline = false;
      } catch (error) {
        console.error(
          `[splitIndexedDBPersistStorage] Failed to remove "${name}":`,
          error
        );
      } finally {
        db.close();
      }
    },
  };
}
