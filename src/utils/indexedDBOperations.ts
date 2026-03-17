/**
 * IndexedDB Operations Utility Module
 * 
 * Centralized helpers for IndexedDB operations used throughout ryOS.
 * Extracts common patterns from useFilesStore and other stores.
 */

import { ensureIndexedDBInitialized, STORES } from "./indexedDB";

// Structure for content stored in IndexedDB
export interface StoredContent {
  name: string;
  content: string | Blob;
}

type StorePutRecord<T> = {
  key?: IDBValidKey;
  value: T;
};

const withDatabase = async <T>(
  operation: (db: IDBDatabase) => Promise<T>
): Promise<T> => {
  const db = await ensureIndexedDBInitialized();
  try {
    return await operation(db);
  } finally {
    db.close();
  }
};

const IMAGE_FILE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
]);

const APPLET_FILE_EXTENSIONS = new Set(["app", "html", "htm"]);

const IMAGE_FILE_TYPES = new Set([
  "image",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
]);

const APPLET_FILE_TYPES = new Set(["html", "htm", "app", "applet"]);

const getExtension = (value?: string): string => {
  if (!value) return "";
  const normalized = value.split("?")[0];
  return normalized.split(".").pop()?.toLowerCase() || "";
};

export const dbOperations = {
  async getAll<T>(storeName: string): Promise<T[]> {
    return withDatabase(
      (db) =>
        new Promise<T[]>((resolve, reject) => {
          try {
            const transaction = db.transaction(storeName, "readonly");
            const store = transaction.objectStore(storeName);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result as T[]);
            request.onerror = () => reject(request.error);
          } catch (error) {
            reject(error);
          }
        })
    );
  },

  async getAllKeys(storeName: string): Promise<string[]> {
    return withDatabase(
      (db) =>
        new Promise<string[]>((resolve, reject) => {
          try {
            const transaction = db.transaction(storeName, "readonly");
            const store = transaction.objectStore(storeName);
            const request = store.getAllKeys();

            request.onsuccess = () => resolve(request.result as string[]);
            request.onerror = () => reject(request.error);
          } catch (error) {
            reject(error);
          }
        })
    );
  },

  async get<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
    return withDatabase(
      (db) =>
        new Promise<T | undefined>((resolve, reject) => {
          try {
            const transaction = db.transaction(storeName, "readonly");
            const store = transaction.objectStore(storeName);
            const request = store.get(key);

            request.onsuccess = () => resolve(request.result as T | undefined);
            request.onerror = () => reject(request.error);
          } catch (error) {
            reject(error);
          }
        })
    );
  },

  async has(storeName: string, key: IDBValidKey): Promise<boolean> {
    return withDatabase(
      (db) =>
        new Promise<boolean>((resolve, reject) => {
          try {
            const transaction = db.transaction(storeName, "readonly");
            const store = transaction.objectStore(storeName);
            const request = store.getKey(key);

            request.onsuccess = () => resolve(request.result !== undefined);
            request.onerror = () => reject(request.error);
          } catch (error) {
            reject(error);
          }
        })
    );
  },

  async getExistingKeys(
    storeName: string,
    keys: readonly IDBValidKey[]
  ): Promise<Set<string>> {
    if (keys.length === 0) {
      return new Set();
    }

    return withDatabase(
      (db) =>
        new Promise<Set<string>>((resolve, reject) => {
          try {
            const transaction = db.transaction(storeName, "readonly");
            const store = transaction.objectStore(storeName);
            const existingKeys = new Set<string>();
            let remaining = keys.length;

            const finish = () => {
              remaining -= 1;
              if (remaining === 0) {
                resolve(existingKeys);
              }
            };

            for (const key of keys) {
              const request = store.getKey(key);
              request.onsuccess = () => {
                if (request.result !== undefined) {
                  existingKeys.add(String(key));
                }
                finish();
              };
              request.onerror = () => reject(request.error);
            }
          } catch (error) {
            reject(error);
          }
        })
    );
  },

  async put<T>(storeName: string, item: T, key?: IDBValidKey): Promise<void> {
    return withDatabase(
      (db) =>
        new Promise<void>((resolve, reject) => {
          try {
            const transaction = db.transaction(storeName, "readwrite");
            const store = transaction.objectStore(storeName);
            const request = key === undefined ? store.put(item) : store.put(item, key);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
          } catch (error) {
            reject(error);
          }
        })
    );
  },

  async putMany<T>(
    storeName: string,
    records: readonly StorePutRecord<T>[]
  ): Promise<void> {
    if (records.length === 0) {
      return;
    }

    return withDatabase(
      (db) =>
        new Promise<void>((resolve, reject) => {
          try {
            const transaction = db.transaction(storeName, "readwrite");
            const store = transaction.objectStore(storeName);

            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () =>
              reject(transaction.error || new Error(`Transaction aborted: ${storeName}`));

            for (const record of records) {
              if (record.key === undefined) {
                store.put(record.value);
              } else {
                store.put(record.value, record.key);
              }
            }
          } catch (error) {
            reject(error);
          }
        })
    );
  },

  async delete(storeName: string, key: IDBValidKey): Promise<void> {
    return withDatabase(
      (db) =>
        new Promise<void>((resolve, reject) => {
          try {
            const transaction = db.transaction(storeName, "readwrite");
            const store = transaction.objectStore(storeName);
            const request = store.delete(key);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
          } catch (error) {
            reject(error);
          }
        })
    );
  },

  async clear(storeName: string): Promise<void> {
    return withDatabase(
      (db) =>
        new Promise<void>((resolve, reject) => {
          try {
            const transaction = db.transaction(storeName, "readwrite");
            const store = transaction.objectStore(storeName);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
          } catch (error) {
            reject(error);
          }
        })
    );
  },
};

/**
 * Save file content to IndexedDB.
 * @param uuid - Unique identifier for the content
 * @param name - Filename
 * @param content - Content to store (string or Blob)
 * @param storeName - Which store to use (STORES.DOCUMENTS, STORES.IMAGES, etc.)
 */
export async function saveFileContent(
  uuid: string,
  name: string,
  content: string | Blob,
  storeName: string
): Promise<void> {
  await dbOperations.put(storeName, { name, content } as StoredContent, uuid);
}

/**
 * Load file content from IndexedDB.
 * @param uuid - Unique identifier for the content
 * @param storeName - Which store to load from
 * @returns The stored content or null if not found
 */
export async function loadFileContent(
  uuid: string,
  storeName: string
): Promise<StoredContent | null> {
  return (await dbOperations.get<StoredContent>(storeName, uuid)) ?? null;
}

/**
 * Delete file content from IndexedDB.
 * @param uuid - Unique identifier for the content to delete
 * @param storeName - Which store to delete from
 */
export async function deleteFileContent(
  uuid: string,
  storeName: string
): Promise<void> {
  await dbOperations.delete(storeName, uuid);
}

/**
 * Check if content exists in IndexedDB.
 * @param uuid - Unique identifier for the content
 * @param storeName - Which store to check
 */
export async function contentExists(
  uuid: string,
  storeName: string
): Promise<boolean> {
  return dbOperations.has(storeName, uuid);
}

/**
 * Batch save multiple files to IndexedDB.
 * More efficient than individual saves for multiple files.
 * @param files - Array of files to save
 * @param storeName - Which store to save to
 */
export async function batchSaveFileContent(
  files: Array<{ uuid: string; name: string; content: string | Blob }>,
  storeName: string
): Promise<void> {
  await dbOperations.putMany(
    storeName,
    files.map((file) => ({
      key: file.uuid,
      value: { name: file.name, content: file.content } as StoredContent,
    }))
  );
}

/**
 * Batch delete multiple files from IndexedDB.
 * @param uuids - Array of UUIDs to delete
 * @param storeName - Which store to delete from
 */
export async function batchDeleteFileContent(
  uuids: string[],
  storeName: string
): Promise<void> {
  if (uuids.length === 0) return;

  await withDatabase(
    (db) =>
      new Promise<void>((resolve, reject) => {
        try {
          const transaction = db.transaction(storeName, "readwrite");
          const store = transaction.objectStore(storeName);

          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () =>
            reject(transaction.error || new Error(`Transaction aborted: ${storeName}`));

          for (const uuid of uuids) {
            store.delete(uuid);
          }
        } catch (error) {
          reject(error);
        }
      })
  );
}

/**
 * Get the appropriate store name for a file path.
 * @param filePath - The file path to determine store for
 * @returns The store name or null if path doesn't match known patterns
 */
export function getStoreForPath(filePath: string): string | null {
  return getStoreForFile(filePath);
}

export function getStoreForFile(
  filePath: string,
  options: { name?: string; type?: string } = {}
): string | null {
  if (filePath.startsWith("/Documents/")) return STORES.DOCUMENTS;
  if (filePath.startsWith("/Images/")) return STORES.IMAGES;
  if (filePath.startsWith("/Applets/")) return STORES.APPLETS;
  if (!filePath.startsWith("/Downloads/")) return null;

  const extension = getExtension(options.name || filePath);
  const normalizedType = options.type?.toLowerCase() || "";

  if (
    IMAGE_FILE_TYPES.has(normalizedType) ||
    IMAGE_FILE_EXTENSIONS.has(extension)
  ) {
    return STORES.IMAGES;
  }

  if (
    APPLET_FILE_TYPES.has(normalizedType) ||
    APPLET_FILE_EXTENSIONS.has(extension)
  ) {
    return STORES.APPLETS;
  }

  return STORES.DOCUMENTS;
}

/**
 * Calculate the size of content in bytes.
 * @param content - String or Blob content
 */
export function getContentSize(content: string | Blob): number {
  if (content instanceof Blob) {
    return content.size;
  }
  // For strings, use TextEncoder to get accurate byte count
  return new TextEncoder().encode(content).length;
}

// Re-export STORES for convenience
export { STORES } from "./indexedDB";
