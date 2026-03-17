/**
 * IndexedDB Operations Utility Module
 *
 * Centralized helpers for IndexedDB operations used throughout ryOS.
 * Extracts common patterns from stores and hooks so they do not open
 * ad-hoc transactions inline.
 */

import { ensureIndexedDBInitialized, STORES } from "./indexedDB";

export interface StoredContent {
  name: string;
  content: string | Blob;
}

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

const waitForRequest = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const waitForTransaction = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () =>
      reject(transaction.error || new Error("IndexedDB transaction aborted"));
  });

const withObjectStore = async <T>(
  storeName: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore, transaction: IDBTransaction) => Promise<T>
): Promise<T> => {
  const db = await ensureIndexedDBInitialized();

  try {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    return await action(store, transaction);
  } finally {
    db.close();
  }
};

async function getAll<T>(storeName: string): Promise<T[]> {
  try {
    return await withObjectStore(storeName, "readonly", (store) =>
      waitForRequest(store.getAll() as IDBRequest<T[]>)
    );
  } catch (error) {
    console.error(`Error getting all items from ${storeName}:`, error);
    return [];
  }
}

async function getAllKeys(storeName: string): Promise<string[]> {
  try {
    const keys = await withObjectStore(storeName, "readonly", (store) =>
      waitForRequest(store.getAllKeys() as IDBRequest<IDBValidKey[]>)
    );
    return keys.map((key) => String(key));
  } catch (error) {
    console.error(`Error getting all keys from ${storeName}:`, error);
    return [];
  }
}

async function get<T>(
  storeName: string,
  key: IDBValidKey
): Promise<T | undefined> {
  try {
    return await withObjectStore(storeName, "readonly", (store) =>
      waitForRequest(store.get(key) as IDBRequest<T | undefined>)
    );
  } catch (error) {
    console.error(`Error getting item "${String(key)}" from ${storeName}:`, error);
    return undefined;
  }
}

async function put<T>(
  storeName: string,
  item: T,
  key?: IDBValidKey
): Promise<void> {
  return withObjectStore(storeName, "readwrite", async (store, transaction) => {
    if (key === undefined) {
      await waitForRequest(store.put(item) as IDBRequest<IDBValidKey>);
    } else {
      await waitForRequest(store.put(item, key) as IDBRequest<IDBValidKey>);
    }
    await waitForTransaction(transaction);
  });
}

async function remove(storeName: string, key: IDBValidKey): Promise<void> {
  return withObjectStore(storeName, "readwrite", async (store, transaction) => {
    await waitForRequest(store.delete(key) as IDBRequest<undefined>);
    await waitForTransaction(transaction);
  });
}

async function clear(storeName: string): Promise<void> {
  return withObjectStore(storeName, "readwrite", async (store, transaction) => {
    await waitForRequest(store.clear() as IDBRequest<undefined>);
    await waitForTransaction(transaction);
  });
}

export const dbOperations = {
  getAll,
  getAllKeys,
  get,
  put,
  delete: remove,
  clear,
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
  return (await dbOperations.get(storeName, uuid)) !== undefined;
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
  if (files.length === 0) return;

  await withObjectStore(storeName, "readwrite", async (store, transaction) => {
    for (const file of files) {
      store.put(
        { name: file.name, content: file.content } as StoredContent,
        file.uuid
      );
    }

    await waitForTransaction(transaction);
  });
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

  await withObjectStore(storeName, "readwrite", async (store, transaction) => {
    for (const uuid of uuids) {
      store.delete(uuid);
    }

    await waitForTransaction(transaction);
  });
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
