import { STORES } from "@/utils/indexedDB";
import {
  deserializeStoreItem,
  serializeStoreItem,
  type IndexedDBStoreItem,
  type IndexedDBStoreItemWithKey,
} from "@/utils/storeItemSerialization";

// Item (de)serialization is a pure module shared with the cloud sync worker;
// re-exported here for the existing import sites.
export {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  base64ToBlob,
  blobToBase64,
  deserializeStoreItem,
  serializeStoreItem,
  serializeStoreItems,
  type IndexedDBStoreItem,
  type IndexedDBStoreItemWithKey,
} from "@/utils/storeItemSerialization";

export const MANUAL_BACKUP_VERSION = 6;

/**
 * User-owned IndexedDB data included in manual backups. Apple Music stores are
 * intentionally excluded because they are provider caches that can be rebuilt.
 * Sync v2 cursor/shadow state is also excluded because restored user data must
 * be reconciled against a fresh server snapshot.
 */
export const MANUAL_BACKUP_INDEXEDDB_STORES = [
  STORES.DOCUMENTS,
  STORES.IMAGES,
  STORES.BOOKS,
  STORES.BOOK_THUMBNAILS,
  STORES.TRASH,
  STORES.CUSTOM_WALLPAPERS,
  STORES.APPLETS,
  STORES.PERSISTED_STATE,
  STORES.SOUNDBOARD_AUDIO,
  STORES.CHATS_AI_MESSAGES,
  STORES.CHATS_ROOM_MESSAGES,
  STORES.TEXTEDIT_INSTANCES,
  STORES.VFS_ITEMS,
] as const;

export type ManualBackupIndexedDBStore =
  (typeof MANUAL_BACKUP_INDEXEDDB_STORES)[number];

export type ManualBackupIndexedDBData = Record<
  ManualBackupIndexedDBStore,
  IndexedDBStoreItemWithKey[]
>;

export const createEmptyManualBackupIndexedDBData =
  (): ManualBackupIndexedDBData =>
    Object.fromEntries(
      MANUAL_BACKUP_INDEXEDDB_STORES.map((storeName) => [storeName, []])
    ) as unknown as ManualBackupIndexedDBData;

export async function readStoreItemByKey(
  db: IDBDatabase,
  storeName: string,
  key: string
): Promise<IndexedDBStoreItemWithKey | null> {
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(storeName, "readonly");
      const store = transaction.objectStore(storeName);
      const request = store.get(key);
      request.onsuccess = () => {
        if (request.result === undefined || request.result === null) {
          resolve(null);
          return;
        }
        resolve({
          key,
          value: request.result as IndexedDBStoreItem,
        });
      };
      request.onerror = () => reject(request.error);
    } catch (error) {
      reject(error);
    }
  });
}

export async function readStoreItemsByKeys(
  db: IDBDatabase,
  storeName: string,
  keys: string[]
): Promise<IndexedDBStoreItemWithKey[]> {
  const unique = [...new Set(keys.filter(Boolean))];
  const results = await Promise.all(
    unique.map((key) => readStoreItemByKey(db, storeName, key))
  );
  return results.filter((item): item is IndexedDBStoreItemWithKey => item != null);
}

export async function readAndSerializeStoreItemByKey(
  db: IDBDatabase,
  storeName: string,
  key: string
): Promise<IndexedDBStoreItemWithKey | null> {
  const item = await readStoreItemByKey(db, storeName, key);
  return item ? serializeStoreItem(item) : null;
}

export async function readAndSerializeStoreItemsByKeys(
  db: IDBDatabase,
  storeName: string,
  keys: string[]
): Promise<IndexedDBStoreItemWithKey[]> {
  const unique = [...new Set(keys.filter(Boolean))];
  const results = await Promise.all(
    unique.map((k) => readAndSerializeStoreItemByKey(db, storeName, k))
  );
  return results.filter((x): x is IndexedDBStoreItemWithKey => x != null);
}

export async function readStoreItems(
  db: IDBDatabase,
  storeName: string
): Promise<IndexedDBStoreItemWithKey[]> {
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(storeName, "readonly");
      const store = transaction.objectStore(storeName);
      const items: IndexedDBStoreItemWithKey[] = [];
      const request = store.openCursor();

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          items.push({
            key: cursor.key as string,
            value: cursor.value as IndexedDBStoreItem,
          });
          cursor.continue();
          return;
        }

        resolve(items);
      };

      request.onerror = () => reject(request.error);
    } catch (error) {
      reject(error);
    }
  });
}

/** Read a transactionally consistent snapshot across multiple object stores. */
export async function readStoresAtomically(
  db: IDBDatabase,
  storeNames: readonly string[]
): Promise<Record<string, IndexedDBStoreItemWithKey[]>> {
  const names = [...new Set(storeNames)];
  if (names.length === 0) return {};

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(names, "readonly");
    const result: Record<string, IndexedDBStoreItemWithKey[]> = {};

    for (const storeName of names) {
      const items: IndexedDBStoreItemWithKey[] = [];
      result[storeName] = items;
      const request = transaction.objectStore(storeName).openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        items.push({
          key: String(cursor.key),
          value: cursor.value as IndexedDBStoreItem,
        });
        cursor.continue();
      };
    }

    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Backup read transaction aborted"));
  });
}

interface RestoreStoreOptions {
  mapValue?: (
    value: Record<string, unknown>,
    item: IndexedDBStoreItemWithKey
  ) => Record<string, unknown>;
}

export interface IndexedDBStoreRestore {
  storeName: string;
  items: IndexedDBStoreItemWithKey[];
  options?: RestoreStoreOptions;
}

/** Atomically replace multiple object stores in one IndexedDB transaction. */
export async function restoreStoreItemsAtomically(
  db: IDBDatabase,
  restores: readonly IndexedDBStoreRestore[]
): Promise<void> {
  if (restores.length === 0) return;

  const prepared = restores.map(({ storeName, items, options }) => ({
    storeName,
    items: items.map((item) => {
      const restoredValue = deserializeStoreItem(item);
      return {
        key: item.key,
        value: options?.mapValue
          ? options.mapValue(restoredValue, item)
          : restoredValue,
      };
    }),
  }));

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      prepared.map(({ storeName }) => storeName),
      "readwrite"
    );

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () =>
      reject(transaction.error || new Error("Restore transaction aborted"));

    try {
      for (const restore of prepared) {
        const store = transaction.objectStore(restore.storeName);
        store.clear();
        for (const item of restore.items) {
          store.put(item.value, item.key);
        }
      }
    } catch (error) {
      transaction.abort();
      reject(error);
    }
  });
}

export async function restoreStoreItems(
  db: IDBDatabase,
  storeName: string,
  items: IndexedDBStoreItemWithKey[],
  options?: RestoreStoreOptions
): Promise<void> {
  return restoreStoreItemsAtomically(db, [{ storeName, items, options }]);
}
