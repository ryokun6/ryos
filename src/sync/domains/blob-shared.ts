import { ensureIndexedDBInitialized, STORES } from "@/utils/indexedDB";
import {
  deserializeStoreItem,
  readStoreItems,
  restoreStoreItems,
  serializeStoreItem,
  serializeStoreItems,
  type IndexedDBStoreItemWithKey as StoreItemWithKey,
} from "@/utils/indexedDBBackup";
import type {
  BlobSyncDomain,
  CloudSyncBlobItemDownloadMetadata,
  CloudSyncDomainMetadata,
  IndividualBlobSyncDomain,
} from "@/utils/cloudSyncShared";
import type { CloudSyncDeletionBucket } from "@/stores/useCloudSyncStore";
import type { DeletionMarkerMap } from "@/utils/cloudSyncDeletionMarkers";

export type { StoreItemWithKey };

export interface SerializedStoreItemRecord {
  item: StoreItemWithKey;
  signature: string;
}

export interface BlobSyncItemEnvelope {
  domain: BlobSyncDomain;
  key: string;
  version: number;
  updatedAt: string;
  data: StoreItemWithKey;
}

export interface IndividualBlobDomainResponse {
  mode?: "individual";
  items?: Record<string, CloudSyncBlobItemDownloadMetadata>;
  metadata?: CloudSyncDomainMetadata;
  deletedItems?: DeletionMarkerMap;
}

export interface BlobDomainInfoResponse extends IndividualBlobDomainResponse {
  downloadUrl?: string;
  blobUrl?: string;
}

interface BurstFetchCacheEntry<T> {
  promise: Promise<T> | null;
  value?: T;
  hasValue: boolean;
  expiresAt: number;
}

export const SYNC_DOMAIN_FETCH_BURST_MS = 1500;

export function createBurstFetchCache<T>(burstMs: number) {
  const entries = new Map<string, BurstFetchCacheEntry<T>>();

  return {
    get(key: string, loader: () => Promise<T>): Promise<T> {
      const now = Date.now();
      const existing = entries.get(key);

      if (existing?.hasValue && existing.expiresAt > now) {
        return Promise.resolve(existing.value as T);
      }

      if (existing?.promise) {
        return existing.promise;
      }

      const nextEntry: BurstFetchCacheEntry<T> =
        existing ?? {
          promise: null,
          value: undefined,
          hasValue: false,
          expiresAt: 0,
        };

      const promise = loader()
        .then((value) => {
          nextEntry.promise = null;
          nextEntry.value = value;
          nextEntry.hasValue = true;
          nextEntry.expiresAt = Date.now() + burstMs;
          entries.set(key, nextEntry);
          return value;
        })
        .catch((error) => {
          nextEntry.promise = null;
          if (nextEntry.hasValue && nextEntry.expiresAt > Date.now()) {
            entries.set(key, nextEntry);
          } else {
            entries.delete(key);
          }
          throw error;
        });

      nextEntry.promise = promise;
      entries.set(key, nextEntry);
      return promise;
    },
    set(key: string, value: T): void {
      entries.set(key, {
        promise: null,
        value,
        hasValue: true,
        expiresAt: Date.now() + burstMs,
      });
    },
    invalidate(key: string): void {
      entries.delete(key);
    },
  };
}

export const blobDomainInfoCache = createBurstFetchCache<BlobDomainInfoResponse | null>(
  SYNC_DOMAIN_FETCH_BURST_MS
);

export const individualBlobReconcileCache = createBurstFetchCache<boolean>(
  SYNC_DOMAIN_FETCH_BURST_MS
);

export async function getIndexedDbHandle(providedDb?: IDBDatabase): Promise<{
  db: IDBDatabase;
  shouldClose: boolean;
}> {
  if (providedDb) {
    return {
      db: providedDb,
      shouldClose: false,
    };
  }

  return {
    db: await ensureIndexedDBInitialized(),
    shouldClose: true,
  };
}

export function assertCompressionSupport(): void {
  if (
    typeof CompressionStream === "undefined" ||
    typeof DecompressionStream === "undefined"
  ) {
    throw new Error("Cloud sync requires browser compression support.");
  }
}

export async function computeSyncSignature(value: unknown): Promise<string> {
  const payload = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", payload);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export async function serializeStoreItemRecords(
  items: StoreItemWithKey[]
): Promise<SerializedStoreItemRecord[]> {
  return Promise.all(
    items.map(async (item) => {
      const serializedItem = await serializeStoreItem(item);
      return {
        item: serializedItem,
        signature: await computeSyncSignature(serializedItem),
      };
    })
  );
}

export async function upsertStoreItems(
  db: IDBDatabase,
  storeName: string,
  items: StoreItemWithKey[]
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () =>
      reject(transaction.error || new Error(`Transaction aborted: ${storeName}`));

    try {
      for (const item of items) {
        store.put(deserializeStoreItem(item), item.key);
      }
    } catch (error) {
      transaction.abort();
      reject(error);
    }
  });
}

export async function deleteStoreItemsByKey(
  db: IDBDatabase,
  storeName: string,
  keys: string[]
): Promise<void> {
  if (keys.length === 0) {
    return;
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () =>
      reject(transaction.error || new Error(`Transaction aborted: ${storeName}`));

    try {
      for (const key of keys) {
        store.delete(key);
      }
    } catch (error) {
      transaction.abort();
      reject(error);
    }
  });
}

export async function gzipJson(value: unknown): Promise<Uint8Array> {
  assertCompressionSupport();
  const encoder = new TextEncoder();
  const inputData = encoder.encode(JSON.stringify(value));
  const readableStream = new ReadableStream({
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
    const { done, value: chunk } = await reader.read();
    if (done) {
      break;
    }
    if (chunk) {
      chunks.push(chunk);
    }
  }

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  return combined;
}

export async function downloadGzipJson<T>(downloadUrl: string): Promise<T> {
  const blobResponse = await fetch(downloadUrl);
  if (!blobResponse.ok) {
    throw new Error(`Failed to fetch sync blob from CDN: ${blobResponse.status}`);
  }

  const compressedBuf = await blobResponse.arrayBuffer();
  const compressedBlob = new Blob([compressedBuf], { type: "application/gzip" });
  const decompressedStream = compressedBlob
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  const jsonString = await new Response(decompressedStream).text();
  return JSON.parse(jsonString) as T;
}

export async function serializeIndexedDbStoreSnapshot(
  storeName: string,
  providedDb?: IDBDatabase
): Promise<StoreItemWithKey[]> {
  const { db, shouldClose } = await getIndexedDbHandle(providedDb);

  try {
    const items = await readStoreItems(db, storeName);
    return await serializeStoreItems(items);
  } finally {
    if (shouldClose) {
      db.close();
    }
  }
}

export async function serializeIndexedDbStoreRecords(
  storeName: string,
  providedDb?: IDBDatabase
): Promise<SerializedStoreItemRecord[]> {
  const { db, shouldClose } = await getIndexedDbHandle(providedDb);

  try {
    return await serializeStoreItemRecords(await readStoreItems(db, storeName));
  } finally {
    if (shouldClose) {
      db.close();
    }
  }
}

export function getIndividualBlobStoreName(domain: IndividualBlobSyncDomain): string {
  switch (domain) {
    case "files-images":
      return STORES.IMAGES;
    case "files-trash":
      return STORES.TRASH;
    case "files-applets":
      return STORES.APPLETS;
    case "custom-wallpapers":
      return STORES.CUSTOM_WALLPAPERS;
  }
}

export function getIndividualBlobDeletionBucket(
  domain: IndividualBlobSyncDomain
): CloudSyncDeletionBucket {
  switch (domain) {
    case "files-images":
      return "fileImageKeys";
    case "files-trash":
      return "fileTrashKeys";
    case "files-applets":
      return "fileAppletKeys";
    case "custom-wallpapers":
      return "customWallpaperKeys";
  }
}

export async function applyIndexedDbStoreSnapshot(
  storeName: string,
  data: StoreItemWithKey[],
  providedDb?: IDBDatabase
): Promise<void> {
  const { db, shouldClose } = await getIndexedDbHandle(providedDb);

  try {
    await restoreStoreItems(db, storeName, data);
  } finally {
    if (shouldClose) {
      db.close();
    }
  }
}
