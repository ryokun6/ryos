import { STORES, dbOperations } from "@/utils/indexedDB";
import {
  getStoreForFile,
  type StoredContent,
} from "@/utils/indexedDBOperations";
import { getFileContentUuid } from "@/services/vfs/FileMetadataService";
import { ensureFileContentLoaded } from "@/stores/useFilesStore";

export type VfsContentStoreName =
  | typeof STORES.DOCUMENTS
  | typeof STORES.IMAGES
  | typeof STORES.BOOKS
  | typeof STORES.APPLETS
  | typeof STORES.TRASH;

export interface VfsStoredContent extends StoredContent {
  contentUrl?: string;
}

function isBlobLike(value: unknown): value is Blob {
  return (
    value instanceof Blob ||
    (typeof value === "object" &&
      value !== null &&
      typeof (value as Blob).arrayBuffer === "function" &&
      typeof (value as Blob).text === "function" &&
      typeof (value as Blob).size === "number")
  );
}

export async function readContentByKey<T extends StoredContent = StoredContent>(
  storeName: string,
  key: string
): Promise<T | undefined> {
  return dbOperations.get<T>(storeName, key);
}

export async function writeContentByKey<T extends StoredContent = StoredContent>(
  storeName: string,
  value: T,
  key: string
): Promise<void> {
  await dbOperations.put<T>(storeName, value, key);
}

export async function readContentForPath<T extends StoredContent = StoredContent>(
  path: string,
  options: { expectedStore?: VfsContentStoreName } = {}
): Promise<T | null> {
  const fileName = path.split("/").pop();
  const storeName = getStoreForFile(path, { name: fileName });
  if (!storeName) {
    return null;
  }
  if (options.expectedStore && storeName !== options.expectedStore) {
    return null;
  }

  const uuid = getFileContentUuid(path);
  if (!uuid) return null;
  let existing: T | undefined;
  try {
    existing = await readContentByKey<T>(storeName, uuid);
  } catch (error) {
    if (storeName !== STORES.BOOKS) {
      throw error;
    }
    const recovered = await ensureFileContentLoaded(path, uuid, {
      forceReload: true,
    });
    if (!recovered) {
      throw error;
    }
    return (await readContentByKey<T>(storeName, uuid)) ?? null;
  }
  if (existing) return existing;

  const loaded = await ensureFileContentLoaded(path, uuid);
  if (!loaded) return null;

  return (await readContentByKey<T>(storeName, uuid)) ?? null;
}

export async function readDocumentTextContent(path: string): Promise<string | null> {
  const item = await readContentForPath<StoredContent>(path, {
    expectedStore: STORES.DOCUMENTS,
  });
  const content = item?.content;
  if (content instanceof Blob) {
    return content.text();
  }
  return typeof content === "string" ? content : null;
}

export async function readImageBlobContent(path: string): Promise<Blob | null> {
  const item = await readContentForPath<StoredContent>(path, {
    expectedStore: STORES.IMAGES,
  });
  return isBlobLike(item?.content) ? item.content : null;
}

function blobFromBookContent(
  content: StoredContent["content"] | undefined
): Blob | null {
  if (content instanceof ArrayBuffer) {
    return new Blob([content], { type: "application/epub+zip" });
  }
  return isBlobLike(content) ? content : null;
}

async function isBlobReadable(blob: Blob): Promise<boolean> {
  try {
    const probe =
      typeof blob.slice === "function" ? blob.slice(0, Math.min(blob.size, 1)) : blob;
    await probe.arrayBuffer();
    return true;
  } catch {
    return false;
  }
}

export async function readBookBlobContent(path: string): Promise<Blob | null> {
  const item = await readContentForPath<StoredContent>(path, {
    expectedStore: STORES.BOOKS,
  });
  const blob = blobFromBookContent(item?.content);
  if (!blob) {
    return null;
  }
  if (item?.content instanceof ArrayBuffer || (await isBlobReadable(blob))) {
    return blob;
  }

  const uuid = getFileContentUuid(path);
  if (!uuid) return null;

  // Safari can throw "UnknownError: Internal error" when reading a Blob
  // previously persisted in IndexedDB. Only pay the reload cost after proving
  // the stored Blob is unreadable; bundled defaults can then recover from the
  // same-origin asset without re-fetching on every normal read.
  const recovered = await ensureFileContentLoaded(path, uuid, { forceReload: true });
  if (!recovered) return null;

  const recoveredItem = await readContentForPath<StoredContent>(path, {
    expectedStore: STORES.BOOKS,
  });
  return blobFromBookContent(recoveredItem?.content);
}

export async function readAppletTextContent(path: string): Promise<string | null> {
  const item = await readContentForPath<StoredContent>(path, {
    expectedStore: STORES.APPLETS,
  });
  const content = item?.content;
  if (content instanceof Blob) {
    return content.text();
  }
  return typeof content === "string" ? content : null;
}
