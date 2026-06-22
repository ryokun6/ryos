export interface IndexedDBStoreItem {
  [key: string]: unknown;
}

export interface IndexedDBStoreItemWithKey {
  key: string;
  value: IndexedDBStoreItem;
}

export const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () =>
      reject(reader.error || new Error("Failed to serialize blob"));
    reader.readAsDataURL(blob);
  });

export const base64ToBlob = (dataUrl: string): Blob => {
  const [meta, base64] = dataUrl.split(",");
  const mimeMatch = meta.match(/data:(.*);base64/);
  const mime = mimeMatch ? mimeMatch[1] : "application/octet-stream";
  const binary = atob(base64);
  const array = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new Blob([array], { type: mime });
};

export async function readAndSerializeStoreItemByKey(
  db: IDBDatabase,
  storeName: string,
  key: string
): Promise<IndexedDBStoreItemWithKey | null> {
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(storeName, "readonly");
      const store = transaction.objectStore(storeName);
      const request = store.get(key);
      request.onsuccess = async () => {
        if (request.result === undefined || request.result === null) {
          resolve(null);
          return;
        }
        const item: IndexedDBStoreItemWithKey = {
          key,
          value: request.result as IndexedDBStoreItem,
        };
        resolve(await serializeStoreItem(item));
      };
      request.onerror = () => reject(request.error);
    } catch (error) {
      reject(error);
    }
  });
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
