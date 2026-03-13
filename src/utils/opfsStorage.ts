import { ensureIndexedDBInitialized, STORES } from "./indexedDB";

export type StorageStoreName = (typeof STORES)[keyof typeof STORES];
export type StorageRecord = object;

export interface StorageItemWithKey<TValue = StorageRecord> {
  key: string;
  value: TValue;
}

type BlobFieldManifest = {
  fileName: string;
  type: string;
  size: number;
};

type StorageManifest = {
  data: Record<string, unknown>;
  blobs: Record<string, BlobFieldManifest>;
};

type StorageBackend = "opfs" | "indexeddb";
type IterableDirectoryHandle = FileSystemDirectoryHandle &
  AsyncIterable<FileSystemHandle>;

const OPFS_ROOT_DIRECTORY = "ryos-opfs-v1";
const MANIFEST_FILE_NAME = "manifest.json";

function isBlobValue(value: unknown): value is Blob {
  return typeof Blob !== "undefined" && value instanceof Blob;
}

function isDomExceptionWithName(
  error: unknown,
  name: string
): error is DOMException {
  return error instanceof DOMException && error.name === name;
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value);
}

function decodePathSegment(value: string): string {
  return decodeURIComponent(value);
}

function getBlobFileName(fieldName: string): string {
  return `${encodePathSegment(fieldName)}.blob`;
}

function isOpfsSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.storage !== "undefined" &&
    typeof navigator.storage.getDirectory === "function"
  );
}

function normalizeStorageKey(key: unknown, item?: unknown): string {
  if (typeof key === "string" && key.length > 0) {
    return key;
  }

  if (typeof key === "number" || typeof key === "bigint") {
    return String(key);
  }

  if (item && typeof item === "object") {
    const candidate = item as { key?: unknown; id?: unknown; name?: unknown };
    if (typeof candidate.key === "string" && candidate.key.length > 0) {
      return candidate.key;
    }
    if (typeof candidate.id === "string" && candidate.id.length > 0) {
      return candidate.id;
    }
    if (typeof candidate.name === "string" && candidate.name.length > 0) {
      return candidate.name;
    }
  }

  throw new Error("Storage key is required for browser content storage.");
}

async function getOpfsRootDirectory(
  create: boolean = true
): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(OPFS_ROOT_DIRECTORY, { create });
}

async function getOpfsStoreDirectory(
  storeName: string,
  create: boolean = true
): Promise<FileSystemDirectoryHandle> {
  const root = await getOpfsRootDirectory(create);
  return root.getDirectoryHandle(encodePathSegment(storeName), { create });
}

async function getOpfsRecordDirectory(
  storeName: string,
  key: string,
  create: boolean = true
): Promise<FileSystemDirectoryHandle> {
  const storeDirectory = await getOpfsStoreDirectory(storeName, create);
  return storeDirectory.getDirectoryHandle(encodePathSegment(key), { create });
}

async function readTextFile(fileHandle: FileSystemFileHandle): Promise<string> {
  const file = await fileHandle.getFile();
  return file.text();
}

async function writeTextFile(
  fileHandle: FileSystemFileHandle,
  content: string
): Promise<void> {
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(content);
  } finally {
    await writable.close();
  }
}

async function writeBlobFile(
  fileHandle: FileSystemFileHandle,
  content: Blob
): Promise<void> {
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(content);
  } finally {
    await writable.close();
  }
}

async function readOpfsManifest(
  storeName: string,
  key: string
): Promise<StorageManifest | null> {
  try {
    const recordDirectory = await getOpfsRecordDirectory(storeName, key, false);
    const manifestHandle = await recordDirectory.getFileHandle(
      MANIFEST_FILE_NAME,
      { create: false }
    );
    const content = await readTextFile(manifestHandle);
    return JSON.parse(content) as StorageManifest;
  } catch (error) {
    if (
      isDomExceptionWithName(error, "NotFoundError") ||
      isDomExceptionWithName(error, "TypeMismatchError")
    ) {
      return null;
    }
    throw error;
  }
}

async function writeOpfsItem(
  storeName: string,
  key: string,
  value: StorageRecord
): Promise<void> {
  const recordDirectory = await getOpfsRecordDirectory(storeName, key, true);
  const previousManifest = await readOpfsManifest(storeName, key);
  const data: Record<string, unknown> = {};
  const blobs: Record<string, BlobFieldManifest> = {};

  for (const [fieldName, fieldValue] of Object.entries(value)) {
    if (fieldValue === undefined) {
      continue;
    }

    if (isBlobValue(fieldValue)) {
      const blobFileName = getBlobFileName(fieldName);
      const fileHandle = await recordDirectory.getFileHandle(blobFileName, {
        create: true,
      });
      await writeBlobFile(fileHandle, fieldValue);
      blobs[fieldName] = {
        fileName: blobFileName,
        type: fieldValue.type,
        size: fieldValue.size,
      };
      continue;
    }

    data[fieldName] = fieldValue;
  }

  for (const [fieldName, blobMetadata] of Object.entries(
    previousManifest?.blobs ?? {}
  )) {
    if (blobs[fieldName]) {
      continue;
    }

    try {
      await recordDirectory.removeEntry(blobMetadata.fileName);
    } catch (error) {
      if (!isDomExceptionWithName(error, "NotFoundError")) {
        throw error;
      }
    }
  }

  const manifestHandle = await recordDirectory.getFileHandle(MANIFEST_FILE_NAME, {
    create: true,
  });
  await writeTextFile(
    manifestHandle,
    JSON.stringify({
      data,
      blobs,
    } satisfies StorageManifest)
  );
}

async function readOpfsItem<TValue = StorageRecord>(
  storeName: string,
  key: string
): Promise<TValue | undefined> {
  const manifest = await readOpfsManifest(storeName, key);
  if (!manifest) {
    return undefined;
  }

  const recordDirectory = await getOpfsRecordDirectory(storeName, key, false);
  const record: Record<string, unknown> = {
    ...manifest.data,
  };

  for (const [fieldName, blobMetadata] of Object.entries(manifest.blobs)) {
    const fileHandle = await recordDirectory.getFileHandle(blobMetadata.fileName, {
      create: false,
    });
    record[fieldName] = await fileHandle.getFile();
  }

  return record as TValue;
}

async function deleteOpfsItem(storeName: string, key: string): Promise<void> {
  try {
    const storeDirectory = await getOpfsStoreDirectory(storeName, false);
    await storeDirectory.removeEntry(encodePathSegment(key), { recursive: true });
  } catch (error) {
    if (
      isDomExceptionWithName(error, "NotFoundError") ||
      isDomExceptionWithName(error, "TypeMismatchError")
    ) {
      return;
    }
    throw error;
  }
}

async function clearOpfsStore(storeName: string): Promise<void> {
  try {
    const rootDirectory = await getOpfsRootDirectory(false);
    await rootDirectory.removeEntry(encodePathSegment(storeName), {
      recursive: true,
    });
  } catch (error) {
    if (
      isDomExceptionWithName(error, "NotFoundError") ||
      isDomExceptionWithName(error, "TypeMismatchError")
    ) {
      return;
    }
    throw error;
  }
}

async function listOpfsItems<TValue = StorageRecord>(
  storeName: string
): Promise<Array<StorageItemWithKey<TValue>>> {
  try {
    const storeDirectory = await getOpfsStoreDirectory(storeName, false);
    const items: Array<StorageItemWithKey<TValue>> = [];

    for await (const handle of storeDirectory as IterableDirectoryHandle) {
      if (handle.kind !== "directory") {
        continue;
      }

      const key = decodePathSegment(handle.name);
      const value = await readOpfsItem<TValue>(storeName, key);
      if (value !== undefined) {
        items.push({ key, value });
      }
    }

    return items;
  } catch (error) {
    if (
      isDomExceptionWithName(error, "NotFoundError") ||
      isDomExceptionWithName(error, "TypeMismatchError")
    ) {
      return [];
    }
    throw error;
  }
}

async function listOpfsKeys(storeName: string): Promise<string[]> {
  const items = await listOpfsItems(storeName);
  return items.map((item) => item.key);
}

async function withLegacyIndexedDb<TValue>(
  callback: (db: IDBDatabase) => Promise<TValue>
): Promise<TValue> {
  const db = await ensureIndexedDBInitialized();
  try {
    return await callback(db);
  } finally {
    db.close();
  }
}

async function readIndexedDbItem<TValue = StorageRecord>(
  storeName: string,
  key: string
): Promise<TValue | undefined> {
  return withLegacyIndexedDb<TValue | undefined>(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, "readonly");
        const store = transaction.objectStore(storeName);
        const request = store.get(key);

        request.onsuccess = () => resolve(request.result as TValue | undefined);
        request.onerror = () => reject(request.error);
      })
  );
}

async function writeIndexedDbItem(
  storeName: string,
  key: string,
  value: StorageRecord
): Promise<void> {
  return withLegacyIndexedDb<void>(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, "readwrite");
        const store = transaction.objectStore(storeName);
        const request = store.put(value, key);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      })
  );
}

async function deleteIndexedDbItem(storeName: string, key: string): Promise<void> {
  return withLegacyIndexedDb<void>(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, "readwrite");
        const store = transaction.objectStore(storeName);
        const request = store.delete(key);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      })
  );
}

async function clearIndexedDbStore(storeName: string): Promise<void> {
  return withLegacyIndexedDb<void>(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, "readwrite");
        const store = transaction.objectStore(storeName);
        const request = store.clear();

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      })
  );
}

async function listIndexedDbItems<TValue = StorageRecord>(
  storeName: string
): Promise<Array<StorageItemWithKey<TValue>>> {
  return withLegacyIndexedDb<Array<StorageItemWithKey<TValue>>>(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, "readonly");
        const store = transaction.objectStore(storeName);
        const items: Array<StorageItemWithKey<TValue>> = [];
        const request = store.openCursor();

        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
          if (!cursor) {
            resolve(items);
            return;
          }

          items.push({
            key: String(cursor.key),
            value: cursor.value as TValue,
          });
          cursor.continue();
        };

        request.onerror = () => reject(request.error);
      })
  );
}

async function listIndexedDbKeys(storeName: string): Promise<string[]> {
  const items = await listIndexedDbItems(storeName);
  return items.map((item) => item.key);
}

function getPrimaryStorageBackend(): StorageBackend {
  return isOpfsSupported() ? "opfs" : "indexeddb";
}

export function getContentStorageBackend(): StorageBackend {
  return getPrimaryStorageBackend();
}

export async function getStorageItem<TValue = StorageRecord>(
  storeName: string,
  key: string
): Promise<TValue | undefined> {
  if (getPrimaryStorageBackend() === "opfs") {
    return readOpfsItem<TValue>(storeName, key);
  }

  return readIndexedDbItem<TValue>(storeName, key);
}

export async function putStorageItem<TValue extends StorageRecord>(
  storeName: string,
  item: TValue,
  key?: unknown
): Promise<string> {
  const normalizedKey = normalizeStorageKey(key, item);

  if (getPrimaryStorageBackend() === "opfs") {
    await writeOpfsItem(storeName, normalizedKey, item);
  } else {
    await writeIndexedDbItem(storeName, normalizedKey, item);
  }

  return normalizedKey;
}

export async function deleteStorageItem(
  storeName: string,
  key: string
): Promise<void> {
  if (getPrimaryStorageBackend() === "opfs") {
    await deleteOpfsItem(storeName, key);
    return;
  }

  await deleteIndexedDbItem(storeName, key);
}

export async function clearStorageStore(storeName: string): Promise<void> {
  if (getPrimaryStorageBackend() === "opfs") {
    await clearOpfsStore(storeName);
    return;
  }

  await clearIndexedDbStore(storeName);
}

export async function listStorageItems<TValue = StorageRecord>(
  storeName: string
): Promise<Array<StorageItemWithKey<TValue>>> {
  if (getPrimaryStorageBackend() === "opfs") {
    return listOpfsItems<TValue>(storeName);
  }

  return listIndexedDbItems<TValue>(storeName);
}

export async function listStorageKeys(storeName: string): Promise<string[]> {
  if (getPrimaryStorageBackend() === "opfs") {
    return listOpfsKeys(storeName);
  }

  return listIndexedDbKeys(storeName);
}

export async function getStorageValues<TValue = StorageRecord>(
  storeName: string
): Promise<TValue[]> {
  const items = await listStorageItems<TValue>(storeName);
  return items.map((item) => item.value);
}

export async function storageItemExists(
  storeName: string,
  key: string
): Promise<boolean> {
  return (await getStorageItem(storeName, key)) !== undefined;
}

export async function replaceStorageStore<TValue extends StorageRecord>(
  storeName: string,
  items: Array<StorageItemWithKey<TValue>>
): Promise<void> {
  await clearStorageStore(storeName);
  for (const item of items) {
    await putStorageItem(storeName, item.value, item.key);
  }
}

export async function listLegacyIndexedDbItems<TValue = StorageRecord>(
  storeName: string
): Promise<Array<StorageItemWithKey<TValue>>> {
  return listIndexedDbItems<TValue>(storeName);
}

export async function getLegacyIndexedDbItem<TValue = StorageRecord>(
  storeName: string,
  key: string
): Promise<TValue | undefined> {
  return readIndexedDbItem<TValue>(storeName, key);
}

export async function putLegacyIndexedDbItem<TValue extends StorageRecord>(
  storeName: string,
  item: TValue,
  key?: unknown
): Promise<string> {
  const normalizedKey = normalizeStorageKey(key, item);
  await writeIndexedDbItem(storeName, normalizedKey, item);
  return normalizedKey;
}

export async function clearLegacyIndexedDbStore(
  storeName: string
): Promise<void> {
  await clearIndexedDbStore(storeName);
}
