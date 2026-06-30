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

export async function restoreStoreItems(
  db: IDBDatabase,
  storeName: string,
  items: IndexedDBStoreItemWithKey[],
  options?: {
    mapValue?: (
      value: Record<string, unknown>,
      item: IndexedDBStoreItemWithKey
    ) => Record<string, unknown>;
  }
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () =>
      reject(transaction.error || new Error(`Transaction aborted: ${storeName}`));

    const clearRequest = store.clear();

    clearRequest.onsuccess = () => {
      try {
        for (const item of items) {
          const restoredValue = deserializeStoreItem(item);
          const finalValue = options?.mapValue
            ? options.mapValue(restoredValue, item)
            : restoredValue;
          store.put(finalValue, item.key);
        }
      } catch (error) {
        transaction.abort();
        reject(error);
      }
    };

    clearRequest.onerror = () => reject(clearRequest.error);
  });
}
