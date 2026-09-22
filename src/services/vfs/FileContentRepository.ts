import { STORES, dbOperations } from "@/utils/indexedDB";
import {
  getStoreForFile,
  getBlobNamespaceForContentStore,
  type StoredContent,
} from "@/utils/indexedDBOperations";
import { getFileContentUuid, getFileMetadata } from "@/services/vfs/FileMetadataService";
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
  options: { expectedStore?: VfsContentStoreName; localOnly?: boolean } = {}
): Promise<T | null> {
  // A recovery can rotate a UUID or change its address. Resolve again after
  // I/O, rather than accidentally reading that UUID from the previous store.
  for (let attempt = 0; attempt < 2; attempt++) {
    const metadata = getFileMetadata(path);
    const storeName = getStoreForFile(path, metadata ?? {});
    const uuid = metadata?.uuid;
    if (!storeName || !uuid || (options.expectedStore && storeName !== options.expectedStore)) return null;
    const stillCurrent = () => {
      const current = getFileMetadata(path);
      return current?.uuid === uuid && getStoreForFile(path, current) === storeName;
    };
    const namespace = getBlobNamespaceForContentStore(storeName);
    if (!options.localOnly && namespace) {
      const { getActiveCloudSyncEngine } = await import("@/sync/engine");
      const engine = getActiveCloudSyncEngine();
      if (engine?.hasPendingBlob(namespace, uuid)) {
        if (!(await engine.ensureBlobItemLocal(namespace, uuid, { path }))) return null;
        if (!stillCurrent()) continue;
      }
    }
    let existing: T | undefined;
    try { existing = await readContentByKey<T>(storeName, uuid); }
    catch (error) {
      if (options.localOnly) throw error;
      if (!(await ensureFileContentLoaded(path, uuid, { forceReload: true }))) throw error;
      continue;
    }
    if (!stillCurrent()) continue;
    if (existing) return existing;
    if (options.localOnly || !(await ensureFileContentLoaded(path, uuid))) return null;
  }
  return null;
}

export async function readDocumentTextContent(path: string): Promise<string | null> {
  const item = await readContentForPath<StoredContent>(path);
  const content = item?.content;
  if (content instanceof Blob) {
    return content.text();
  }
  if (content instanceof ArrayBuffer) return new TextDecoder().decode(content);
  return typeof content === "string" ? content : null;
}

export async function readImageBlobContent(path: string): Promise<Blob | null> {
  const item = await readContentForPath<StoredContent>(path);
  if (item?.content instanceof ArrayBuffer) {
    const extension = (item.name || path).split(".").pop()?.toLowerCase() ?? "";
    const mimeTypes: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", bmp: "image/bmp" };
    return new Blob([item.content], { type: mimeTypes[extension] ?? "application/octet-stream" });
  }
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

export async function readBookBlobContent(path: string, options: { localOnly?: boolean } = {}): Promise<Blob | null> {
  const item = await readContentForPath<StoredContent>(path, {
    localOnly: options.localOnly,
  });
  const blob = blobFromBookContent(item?.content);
  if (!blob) {
    return null;
  }
  if (item?.content instanceof ArrayBuffer || (await isBlobReadable(blob))) {
    return blob;
  }

  if (options.localOnly) return null;
  const uuid = getFileContentUuid(path);
  if (!uuid) return null;

  // Safari can throw "UnknownError: Internal error" when reading a Blob
  // previously persisted in IndexedDB. Only pay the reload cost after proving
  // the stored Blob is unreadable; bundled defaults can then recover from the
  // same-origin asset without re-fetching on every normal read.
  const recovered = await ensureFileContentLoaded(path, uuid, { forceReload: true });
  if (!recovered) return null;

  const recoveredItem = await readContentForPath<StoredContent>(path, {
    localOnly: options.localOnly,
  });
  return blobFromBookContent(recoveredItem?.content);
}

export async function readAppletTextContent(path: string): Promise<string | null> {
  const item = await readContentForPath<StoredContent>(path);
  const content = item?.content;
  if (content instanceof Blob) {
    return content.text();
  }
  if (content instanceof ArrayBuffer) return new TextDecoder().decode(content);
  return typeof content === "string" ? content : null;
}
