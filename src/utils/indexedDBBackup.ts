import { STORES } from "@/utils/indexedDB";

export interface IndexedDBStoreItem {
  [key: string]: unknown;
}

export interface IndexedDBStoreItemWithKey {
  key: string;
  value: IndexedDBStoreItem;
}

export const MANUAL_BACKUP_VERSION = 5;

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

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    let chunk = "";
    const end = Math.min(offset + chunkSize, bytes.length);
    for (let index = offset; index < end; index += 1) {
      chunk += String.fromCharCode(bytes[index]);
    }
    chunks.push(chunk);
  }
  return btoa(chunks.join(""));
};

export const blobToBase64 = async (blob: Blob): Promise<string> => {
  const base64 = arrayBufferToBase64(await blob.arrayBuffer());
  return `data:${blob.type || "application/octet-stream"};base64,${base64}`;
};

export const base64ToBlob = (dataUrl: string): Blob => {
  const [meta, base64] = dataUrl.split(",");
  const mimeMatch = meta.match(/data:(.*);base64/);
  const mime = mimeMatch ? mimeMatch[1] : "application/octet-stream";
  const binary = atob(base64);
  const array = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new Blob([array], { type: mime });
};

const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0)).buffer;
};

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

export async function serializeStoreItem(
  item: IndexedDBStoreItemWithKey
): Promise<IndexedDBStoreItemWithKey> {
  const serializedValue: Record<string, unknown> = {
    ...item.value,
  };

  for (const key of Object.keys(item.value)) {
    if (item.value[key] instanceof Blob) {
      serializedValue[key] = await blobToBase64(item.value[key] as Blob);
      serializedValue[`_isBlob_${key}`] = true;
    } else if (item.value[key] instanceof ArrayBuffer) {
      serializedValue[key] = arrayBufferToBase64(
        item.value[key] as ArrayBuffer
      );
      serializedValue[`_isArrayBuffer_${key}`] = true;
    }
  }

  return {
    key: item.key,
    value: serializedValue,
  };
}

export async function serializeStoreItems(
  items: IndexedDBStoreItemWithKey[]
): Promise<IndexedDBStoreItemWithKey[]> {
  return Promise.all(items.map((item) => serializeStoreItem(item)));
}

export function deserializeStoreItem(
  item: IndexedDBStoreItemWithKey
): Record<string, unknown> {
  const restoredValue: Record<string, unknown> = {
    ...item.value,
  };

  for (const key of Object.keys(item.value)) {
    const isBlobKey = `_isBlob_${key}`;
    if (item.value[isBlobKey] === true && typeof item.value[key] === "string") {
      restoredValue[key] = base64ToBlob(item.value[key] as string);
      delete restoredValue[isBlobKey];
    }
    const isArrayBufferKey = `_isArrayBuffer_${key}`;
    if (
      item.value[isArrayBufferKey] === true &&
      typeof item.value[key] === "string"
    ) {
      restoredValue[key] = base64ToArrayBuffer(item.value[key] as string);
      delete restoredValue[isArrayBufferKey];
    }
  }

  return restoredValue;
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
