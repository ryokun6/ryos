import { v4 as uuidv4 } from "uuid";
import { ensureIndexedDBInitialized } from "@/utils/indexedDB";

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

/** Object stores included in full ryOS backup (local + cloud). */
export const BACKUP_INDEXEDDB_STORES = [
  "documents",
  "images",
  "trash",
  "custom_wallpapers",
  "applets",
] as const;

export type BackupIndexedDBStoreName = (typeof BACKUP_INDEXEDDB_STORES)[number];

export const RYOS_FULL_BACKUP_FORMAT_VERSION = 3;

export interface RyOSFullBackup {
  localStorage: Record<string, string | null>;
  indexedDB: Record<BackupIndexedDBStoreName, IndexedDBStoreItemWithKey[]>;
  timestamp: string;
  version: number;
}

export function createEmptyRyOSFullBackup(): RyOSFullBackup {
  return {
    localStorage: {},
    indexedDB: {
      documents: [],
      images: [],
      trash: [],
      custom_wallpapers: [],
      applets: [],
    },
    timestamp: new Date().toISOString(),
    version: RYOS_FULL_BACKUP_FORMAT_VERSION,
  };
}

/** Migrate v1 backup entries for documents/images (uuid + contentUrl). */
export function upgradeLegacyBackupStoreValue(
  backupVersion: number,
  storeName: string,
  value: Record<string, unknown>
): Record<string, unknown> {
  if (
    backupVersion >= 2 ||
    (storeName !== "documents" && storeName !== "images")
  ) {
    return value;
  }

  const nextValue = { ...value };
  if (!nextValue.uuid) {
    nextValue.uuid = uuidv4();
  }
  if (!nextValue.contentUrl && nextValue.content instanceof Blob) {
    nextValue.contentUrl = URL.createObjectURL(nextValue.content);
  }
  return nextValue;
}

export interface CollectFullRyOSBackupOptions {
  /** e.g. local backup alert */
  onIndexedDBBackupError?: (error: unknown) => void;
  logPrefix?: string;
  onAfterLocalStorageSnapshot?: () => void;
  onBeforeIndexedDBSerialize?: () => void;
}

/**
 * Collect localStorage + IndexedDB. On IndexedDB failure, logs (and optional
 * callback) and returns backup with empty IDB stores — same as prior Control Panel behavior.
 */
export async function collectFullRyOSBackupPayload(
  options?: CollectFullRyOSBackupOptions
): Promise<RyOSFullBackup> {
  const backup = createEmptyRyOSFullBackup();

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      backup.localStorage[key] = localStorage.getItem(key);
    }
  }
  options?.onAfterLocalStorageSnapshot?.();

  const prefix = options?.logPrefix ?? "";
  try {
    options?.onBeforeIndexedDBSerialize?.();
    const db = await ensureIndexedDBInitialized();
    try {
      const serializedStores = await Promise.all(
        BACKUP_INDEXEDDB_STORES.map(async (storeName) => [
          storeName,
          await serializeStoreItems(await readStoreItems(db, storeName)),
        ] as const)
      );
      for (const [storeName, items] of serializedStores) {
        backup.indexedDB[storeName] = items;
      }
    } finally {
      db.close();
    }
  } catch (error) {
    console.error(`${prefix}Error backing up IndexedDB:`, error);
    options?.onIndexedDBBackupError?.(error);
  }

  return backup;
}

export type RyosBackupParseErrorVariant = "cloud" | "local";

export function parseRyosFullBackupObject(
  parsed: unknown,
  variant: RyosBackupParseErrorVariant
): RyOSFullBackup {
  const msg =
    variant === "cloud"
      ? "Invalid backup format"
      : "Invalid backup format. Missing required backup data.";
  if (!parsed || typeof parsed !== "object") {
    throw new Error(msg);
  }
  const b = parsed as Record<string, unknown>;
  if (
    !b.localStorage ||
    typeof b.localStorage !== "object" ||
    typeof b.timestamp !== "string"
  ) {
    throw new Error(msg);
  }
  return parsed as RyOSFullBackup;
}

/** Gzip UTF-8 JSON (or any string); returns raw gzip bytes. */
export async function gzipUtf8String(data: string): Promise<Uint8Array> {
  if (typeof CompressionStream === "undefined") {
    throw new Error("CompressionStream API not available in this browser");
  }
  const encoder = new TextEncoder();
  const inputData = encoder.encode(data);
  const readableStream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(inputData);
      controller.close();
    },
  });
  const compressedStream = readableStream.pipeThrough(
    new CompressionStream("gzip")
  );
  const chunks: Uint8Array[] = [];
  const reader = compressedStream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  return combined;
}

export async function ungzipToUtf8String(
  compressed: BufferSource
): Promise<string> {
  const u8 =
    compressed instanceof ArrayBuffer
      ? new Uint8Array(compressed)
      : new Uint8Array(
          compressed.buffer,
          compressed.byteOffset,
          compressed.byteLength
        );
  const compressedResponse = new Response(u8);
  const body = compressedResponse.body;
  if (!body) {
    throw new Error("Failed to create stream from compressed data");
  }
  const decompressedStream = body.pipeThrough(new DecompressionStream("gzip"));
  return new Response(decompressedStream).text();
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const binaryStr = atob(base64);
  const out = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    out[i] = binaryStr.charCodeAt(i);
  }
  return out;
}

export async function ungzipBase64GzipPayload(
  base64Gzip: string
): Promise<string> {
  return ungzipToUtf8String(base64ToUint8Array(base64Gzip));
}
