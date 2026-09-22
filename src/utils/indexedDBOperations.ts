/**
 * IndexedDB Operations Utility Module
 * 
 * Centralized helpers for IndexedDB operations used throughout ryOS.
 * Extracts common patterns from useFilesStore and other stores.
 */

import { ensureIndexedDBInitialized, STORES } from "./indexedDB";
import type { SyncBlobNamespace } from "@/shared/sync2/namespaces";
import { canPathHaveContent } from "@/services/vfs/pathPolicy";

export const FILE_CONTENT_STORES = [STORES.DOCUMENTS, STORES.IMAGES, STORES.BOOKS, STORES.APPLETS, STORES.TRASH] as const;
export type FileContentStore = (typeof FILE_CONTENT_STORES)[number];

/** Content namespaces belong to storage, independently of a file's folder. */
export function getBlobNamespaceForContentStore(storeName: string): SyncBlobNamespace | null {
  switch (storeName) {
    case STORES.IMAGES: return "images";
    case STORES.BOOKS: return "books";
    case STORES.APPLETS: return "applets";
    case STORES.TRASH: return "trash";
    default: return null;
  }
}

export function getFileContentSyncKey(path: string, metadata: { uuid?: string; name?: string; type?: string; contentStore?: FileContentStore; status?: string; isDirectory?: boolean } = {}): string | null {
  if (!metadata.uuid) return null;
  const storeName = getStoreForFile(path, metadata);
  if (storeName === STORES.DOCUMENTS) return `files/doc:${metadata.uuid}`;
  const namespace = storeName && getBlobNamespaceForContentStore(storeName);
  return namespace ? `${namespace}/item:${metadata.uuid}` : null;
}

// Structure for content stored in IndexedDB
export interface StoredContent {
  name: string;
  content: string | Blob | ArrayBuffer;
}

const IMAGE_FILE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "svg",
]);

const APPLET_FILE_EXTENSIONS = new Set(["app", "html", "htm"]);

const BOOK_FILE_EXTENSIONS = new Set(["epub"]);

const BOOK_FILE_TYPES = new Set([
  "epub",
  "book",
  "application/epub+zip",
]);

const IMAGE_FILE_TYPES = new Set([
  "image",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "svg",
]);

const APPLET_FILE_TYPES = new Set(["html", "htm", "app", "applet"]);

const getExtension = (value?: string): string => {
  if (!value) return "";
  const normalized = value.split("?")[0];
  return normalized.split(".").pop()?.toLowerCase() || "";
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
  return getStoreForFile(filePath);
}

export function getStoreForFile(
  filePath: string,
  options: { name?: string; type?: string; contentStore?: FileContentStore; status?: string; isDirectory?: boolean } = {}
): string | null {
  if (options.isDirectory) return null;
  // Do not allow a content pointer to make a virtual tree writable/readable.
  if (!filePath.startsWith("/Applets/") && !canPathHaveContent(filePath)) return null;
  // Reader-first compatibility: no writer creates contentStore yet. A supplied
  // address is authoritative; invalid addresses must never fall back elsewhere.
  if (options.contentStore !== undefined) {
    return FILE_CONTENT_STORES.includes(options.contentStore) ? options.contentStore : null;
  }
  if (options.status === "trashed") return STORES.TRASH;
  if (filePath.startsWith("/Documents/")) return STORES.DOCUMENTS;
  if (filePath.startsWith("/Images/")) return STORES.IMAGES;
  if (filePath.startsWith("/Books/")) return STORES.BOOKS;
  if (filePath.startsWith("/Applets/")) return STORES.APPLETS;
  // Virtual/special subtrees (/Applications, /Music, /Videos, /Sites,
  // /Trash, /Desktop, ...) carry no user content.
  if (!canPathHaveContent(filePath)) return null;

  // Everything else (/Downloads, user-created root folders, root-level
  // files) routes by extension/MIME type. This routing depends only on the
  // filename, so it resolves identically on every device (cloud sync reads
  // content back through this same function).
  const extension = getExtension(options.name || filePath);
  const normalizedType = options.type?.toLowerCase() || "";

  if (
    IMAGE_FILE_TYPES.has(normalizedType) ||
    IMAGE_FILE_EXTENSIONS.has(extension)
  ) {
    return STORES.IMAGES;
  }

  if (
    BOOK_FILE_TYPES.has(normalizedType) ||
    BOOK_FILE_EXTENSIONS.has(extension)
  ) {
    return STORES.BOOKS;
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
