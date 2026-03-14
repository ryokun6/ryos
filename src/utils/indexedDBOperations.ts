/**
 * Browser content storage operations utility module.
 *
 * Centralized helpers for persisted file-content operations used throughout ryOS.
 * The primary backend is OPFS, with legacy IndexedDB fallback/compatibility.
 */

import { STORES } from "./indexedDB";
import {
  deleteStorageItem,
  getStorageItem,
  putStorageItem,
  storageItemExists,
} from "./opfsStorage";

// Structure for content stored in persisted browser content storage
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

/**
 * Save file content to persisted browser storage.
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
  await putStorageItem(storeName, { name, content } as StoredContent, uuid);
}

/**
 * Load file content from persisted browser storage.
 * @param uuid - Unique identifier for the content
 * @param storeName - Which store to load from
 * @returns The stored content or null if not found
 */
export async function loadFileContent(
  uuid: string,
  storeName: string
): Promise<StoredContent | null> {
  return (await getStorageItem<StoredContent>(storeName, uuid)) ?? null;
}

/**
 * Delete file content from persisted browser storage.
 * @param uuid - Unique identifier for the content to delete
 * @param storeName - Which store to delete from
 */
export async function deleteFileContent(
  uuid: string,
  storeName: string
): Promise<void> {
  await deleteStorageItem(storeName, uuid);
}

/**
 * Check if content exists in persisted browser storage.
 * @param uuid - Unique identifier for the content
 * @param storeName - Which store to check
 */
export async function contentExists(
  uuid: string,
  storeName: string
): Promise<boolean> {
  return storageItemExists(storeName, uuid);
}

/**
 * Batch save multiple files to persisted browser storage.
 * More efficient than individual saves for multiple files.
 * @param files - Array of files to save
 * @param storeName - Which store to save to
 */
export async function batchSaveFileContent(
  files: Array<{ uuid: string; name: string; content: string | Blob }>,
  storeName: string
): Promise<void> {
  if (files.length === 0) return;

  for (const file of files) {
    await putStorageItem(
      storeName,
      { name: file.name, content: file.content } as StoredContent,
      file.uuid
    );
  }
}

/**
 * Batch delete multiple files from persisted browser storage.
 * @param uuids - Array of UUIDs to delete
 * @param storeName - Which store to delete from
 */
export async function batchDeleteFileContent(
  uuids: string[],
  storeName: string
): Promise<void> {
  if (uuids.length === 0) return;

  for (const uuid of uuids) {
    await deleteStorageItem(storeName, uuid);
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
