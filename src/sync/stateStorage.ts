import {
  SYNC_NAMESPACES,
  type SyncNamespace,
} from "@/shared/sync2/namespaces";
import { ensureIndexedDBInitialized, STORES } from "@/utils/indexedDB";
import {
  clearPendingFlush,
  ensureLifecycleFlush,
  isPersistWritesHalted,
  registerAdapterResetter,
  registerPendingFlush,
  registerSettler,
} from "@/utils/persistWriteQueue";

const LEGACY_STORAGE_PREFIX = "ryos:sync2:state:";
const WRITE_DELAY_MS = 250;
const STORE = STORES.SYNC2_STATE;

export interface ShadowEntry {
  /** HLC of the last synced value. */
  t: string;
  /** Content hash of the last synced doc (cyrb53 or sha256 for blob docs). */
  h: string;
}

export interface PersistedSyncState {
  cursor: number | null;
  lastHlc: string | null;
  shadow: Record<string, ShadowEntry>;
  dirty: SyncNamespace[];
  localReconcileRequired: boolean;
}

const validNamespaces = new Set<string>(SYNC_NAMESPACES);
const pendingStates = new Map<string, PersistedSyncState>();
const writeTimers = new Map<string, ReturnType<typeof setTimeout>>();
let inFlight: Promise<void> = Promise.resolve();
let writeError: unknown = null;

function recordKey(username: string): string {
  return username.toLowerCase();
}

function legacyStorageKey(username: string): string {
  return `${LEGACY_STORAGE_PREFIX}${recordKey(username)}`;
}

function removeLegacyState(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // IndexedDB is authoritative once migration commits.
  }
}

function queueName(key: string): string {
  return `sync2-state:${key}`;
}

export function createEmptyPersistedSyncState(): PersistedSyncState {
  return {
    cursor: null,
    lastHlc: null,
    shadow: {},
    dirty: [],
    localReconcileRequired: false,
  };
}

function normalizeShadow(value: unknown): Record<string, ShadowEntry> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const shadow: Record<string, ShadowEntry> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (
      key.length > 0 &&
      entry &&
      typeof entry === "object" &&
      !Array.isArray(entry)
    ) {
      const candidate = entry as Record<string, unknown>;
      if (typeof candidate.t === "string" && typeof candidate.h === "string") {
        shadow[key] = { t: candidate.t, h: candidate.h };
      }
    }
  }
  return shadow;
}

export function normalizePersistedSyncState(
  value: unknown
): PersistedSyncState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return createEmptyPersistedSyncState();
  }
  const candidate = value as Record<string, unknown>;
  return {
    cursor:
      typeof candidate.cursor === "number" && Number.isFinite(candidate.cursor)
        ? candidate.cursor
        : null,
    lastHlc:
      typeof candidate.lastHlc === "string" ? candidate.lastHlc : null,
    shadow: normalizeShadow(candidate.shadow),
    dirty: Array.isArray(candidate.dirty)
      ? [
          ...new Set(
            candidate.dirty.filter(
              (namespace): namespace is SyncNamespace =>
                typeof namespace === "string" &&
                validNamespaces.has(namespace)
            )
          ),
        ]
      : [],
    localReconcileRequired: candidate.localReconcileRequired === true,
  };
}

function clonePersistedSyncState(
  state: PersistedSyncState
): PersistedSyncState {
  return {
    cursor: state.cursor,
    lastHlc: state.lastHlc,
    shadow: Object.fromEntries(
      Object.entries(state.shadow).map(([key, entry]) => [key, { ...entry }])
    ),
    dirty: [...state.dirty],
    localReconcileRequired: state.localReconcileRequired,
  };
}

async function readRecord(key: string): Promise<unknown> {
  const db = await ensureIndexedDBInitialized();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, "readonly");
      const request = transaction.objectStore(STORE).get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

interface StoredSyncStateRecord {
  key: string;
  value: unknown;
}

async function readAllRecords(): Promise<StoredSyncStateRecord[]> {
  const db = await ensureIndexedDBInitialized();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, "readonly");
      const records: StoredSyncStateRecord[] = [];
      const request = transaction.objectStore(STORE).openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve(records);
          return;
        }
        records.push({
          key: String(cursor.key),
          value: cursor.value,
        });
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

async function writeRecord(
  key: string,
  state: PersistedSyncState
): Promise<void> {
  const db = await ensureIndexedDBInitialized();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).put(state, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

async function deleteRecord(key: string): Promise<void> {
  const db = await ensureIndexedDBInitialized();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).delete(key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

function writeNow(key: string): boolean {
  const timer = writeTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    writeTimers.delete(key);
  }
  if (isPersistWritesHalted()) {
    pendingStates.delete(key);
    clearPendingFlush(queueName(key));
    return false;
  }
  const state = pendingStates.get(key);
  if (!state) return false;
  pendingStates.delete(key);
  clearPendingFlush(queueName(key));
  inFlight = inFlight
    .then(() => writeRecord(key, state))
    .then(() => {
      writeError = null;
    })
    .catch((error) => {
      writeError = error;
      console.warn("[sync2] Failed to persist sync state:", error);
    });
  return true;
}

async function settleWrites(): Promise<void> {
  await inFlight;
  if (writeError) throw writeError;
}

async function persistMigration(
  key: string,
  state: PersistedSyncState
): Promise<boolean> {
  if (isPersistWritesHalted()) return false;
  pendingStates.set(key, clonePersistedSyncState(state));
  registerPendingFlush(queueName(key), () => writeNow(key));
  if (!writeNow(key)) return false;
  try {
    await settleWrites();
    return true;
  } catch {
    return false;
  }
}

function resetWriterForTests(): void {
  for (const timer of writeTimers.values()) clearTimeout(timer);
  for (const key of pendingStates.keys()) clearPendingFlush(queueName(key));
  writeTimers.clear();
  pendingStates.clear();
  inFlight = Promise.resolve();
  writeError = null;
}

registerSettler(settleWrites);
registerAdapterResetter(resetWriterForTests);

export async function loadPersistedSyncState(
  username: string
): Promise<PersistedSyncState> {
  const key = recordKey(username);
  const pending = pendingStates.get(key);
  if (pending) return clonePersistedSyncState(pending);
  await inFlight;

  try {
    const stored = await readRecord(key);
    if (stored !== undefined && stored !== null) {
      return normalizePersistedSyncState(stored);
    }
  } catch (error) {
    console.warn("[sync2] Failed to read sync state from IndexedDB:", error);
  }

  if (typeof localStorage === "undefined") {
    return createEmptyPersistedSyncState();
  }

  const legacyKey = legacyStorageKey(username);
  let raw: string | null;
  try {
    raw = localStorage.getItem(legacyKey);
  } catch {
    return createEmptyPersistedSyncState();
  }
  if (!raw) return createEmptyPersistedSyncState();

  let migrated: PersistedSyncState;
  try {
    migrated = normalizePersistedSyncState(JSON.parse(raw));
  } catch (error) {
    console.warn("[sync2] Failed to parse legacy sync state:", error);
    return createEmptyPersistedSyncState();
  }

  if (await persistMigration(key, migrated)) {
    removeLegacyState(legacyKey);
  } else if (!isPersistWritesHalted()) {
    console.warn("[sync2] Failed to migrate sync state to IndexedDB");
  }
  return migrated;
}

export function schedulePersistedSyncState(
  username: string,
  state: PersistedSyncState
): void {
  if (isPersistWritesHalted()) return;
  const key = recordKey(username);
  ensureLifecycleFlush();
  pendingStates.set(key, clonePersistedSyncState(state));
  registerPendingFlush(queueName(key), () => writeNow(key));
  if (writeTimers.has(key)) return;
  writeTimers.set(
    key,
    setTimeout(() => writeNow(key), WRITE_DELAY_MS)
  );
}

export async function persistSyncStateNow(
  username: string,
  state: PersistedSyncState
): Promise<void> {
  if (isPersistWritesHalted()) return;
  const key = recordKey(username);
  pendingStates.set(key, clonePersistedSyncState(state));
  registerPendingFlush(queueName(key), () => writeNow(key));
  writeNow(key);
  await settleWrites();
}

export async function deletePersistedSyncState(
  username: string
): Promise<void> {
  const key = recordKey(username);
  const timer = writeTimers.get(key);
  if (timer) clearTimeout(timer);
  writeTimers.delete(key);
  pendingStates.delete(key);
  clearPendingFlush(queueName(key));
  await inFlight;
  await deleteRecord(key);
  try {
    localStorage.removeItem(legacyStorageKey(username));
  } catch {
    // Best-effort cleanup for tests and partially migrated installations.
  }
}

export async function getPersistedSyncShadowKeys(options: {
  excludeUsername?: string;
} = {}): Promise<Set<string>> {
  await inFlight;
  const excludedKey = options.excludeUsername
    ? recordKey(options.excludeUsername)
    : null;
  const keys = new Set<string>();
  const storedRecords = await readAllRecords();
  const storedUsers = new Set(storedRecords.map((record) => record.key));
  for (const record of storedRecords) {
    if (record.key === excludedKey) continue;
    const state = normalizePersistedSyncState(record.value);
    for (const key of Object.keys(state.shadow)) keys.add(key);
  }
  for (const [username, state] of pendingStates) {
    if (username === excludedKey) continue;
    for (const key of Object.keys(state.shadow)) keys.add(key);
  }

  if (isPersistWritesHalted()) return keys;
  if (typeof localStorage === "undefined") return keys;
  const legacyKeys = Array.from(
    { length: localStorage.length },
    (_, index) => localStorage.key(index)
  ).filter(
    (key): key is string =>
      typeof key === "string" && key.startsWith(LEGACY_STORAGE_PREFIX)
  );
  for (const legacyKey of legacyKeys) {
    const username = legacyKey.slice(LEGACY_STORAGE_PREFIX.length);
    if (!username) continue;
    if (storedUsers.has(username)) {
      removeLegacyState(legacyKey);
      continue;
    }
    const raw = localStorage.getItem(legacyKey);
    if (!raw) continue;
    let state: PersistedSyncState;
    try {
      state = normalizePersistedSyncState(JSON.parse(raw));
    } catch {
      continue;
    }
    if (username !== excludedKey) {
      for (const key of Object.keys(state.shadow)) keys.add(key);
    }
    if (await persistMigration(username, state)) {
      removeLegacyState(legacyKey);
      storedUsers.add(username);
    } else if (!isPersistWritesHalted()) {
      console.warn("[sync2] Failed to migrate inactive sync state");
    }
  }
  return keys;
}
