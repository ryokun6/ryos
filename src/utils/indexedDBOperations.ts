/**
 * File-content store routing for the ryOS virtual file system: which
 * IndexedDB object store (and cloud-sync blob namespace) a file's content
 * lives in. Reads and writes go through `src/services/vfs`.
 */

import { STORES } from "./indexedDB";
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

// Re-export STORES for convenience
export { STORES } from "./indexedDB";
