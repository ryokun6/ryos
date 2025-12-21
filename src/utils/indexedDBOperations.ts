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
  let db: IDBDatabase | null = null;
  try {
    db = await ensureIndexedDBInitialized();
    await new Promise<void>((resolve, reject) => {
      const tx = db!.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      const putReq = store.put({ name, content } as StoredContent, uuid);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    });
  } finally {
    if (db) db.close();
  }
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
  let db: IDBDatabase | null = null;
  try {
    db = await ensureIndexedDBInitialized();
    const result = await new Promise<StoredContent | null>((resolve, reject) => {
      const tx = db!.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const req = store.get(uuid);
      req.onsuccess = () => resolve(req.result as StoredContent | null);
      req.onerror = () => reject(req.error);
    });
    return result;
  } finally {
    if (db) db.close();
  }
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
  let db: IDBDatabase | null = null;
  try {
    db = await ensureIndexedDBInitialized();
    await new Promise<void>((resolve, reject) => {
      const tx = db!.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      const deleteReq = store.delete(uuid);
      deleteReq.onsuccess = () => resolve();
      deleteReq.onerror = () => reject(deleteReq.error);
    });
  } finally {
    if (db) db.close();
  }
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
  let db: IDBDatabase | null = null;
  try {
    db = await ensureIndexedDBInitialized();
    const exists = await new Promise<boolean>((resolve) => {
      const tx = db!.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const req = store.get(uuid);
      req.onsuccess = () => resolve(!!req.result);
      req.onerror = () => resolve(false);
    });
    return exists;
  } finally {
    if (db) db.close();
  }
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
  
  let db: IDBDatabase | null = null;
  try {
    db = await ensureIndexedDBInitialized();
    await new Promise<void>((resolve, reject) => {
      const tx = db!.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      
      for (const file of files) {
        store.put({ name: file.name, content: file.content } as StoredContent, file.uuid);
      }
      
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    if (db) db.close();
  }
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
  
  let db: IDBDatabase | null = null;
  try {
    db = await ensureIndexedDBInitialized();
    await new Promise<void>((resolve, reject) => {
      const tx = db!.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      
      for (const uuid of uuids) {
        store.delete(uuid);
      }
      
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    if (db) db.close();
  }
}

/**
 * Get the appropriate store name for a file path.
 * @param filePath - The file path to determine store for
 * @returns The store name or null if path doesn't match known patterns
 */
export function getStoreForPath(filePath: string): string | null {
  if (filePath.startsWith("/Documents/")) return STORES.DOCUMENTS;
  if (filePath.startsWith("/Images/")) return STORES.IMAGES;
  if (filePath.startsWith("/Applets/")) return STORES.APPLETS;
  return null;
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
