import { ensureIndexedDBInitialized, STORES } from "@/utils/indexedDB";
import { useDisplaySettingsStore } from "@/stores/useDisplaySettingsStore";
import {
  useCloudSyncStore,
  type CloudSyncDeletionBucket,
} from "@/stores/useCloudSyncStore";
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
  IndividualBlobSyncDomain,
} from "@/utils/cloudSyncShared";
import type { DeletionMarkerMap } from "@/utils/cloudSyncDeletionMarkers";

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

function assertCompressionSupport(): void {
  if (
    typeof CompressionStream === "undefined" ||
    typeof DecompressionStream === "undefined"
  ) {
    throw new Error("Cloud sync requires browser compression support.");
  }
}

async function computeSyncSignature(value: unknown): Promise<string> {
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
    if (done) break;
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

export async function serializeCustomWallpapersSnapshot(
  providedDb?: IDBDatabase
): Promise<StoreItemWithKey[]> {
  const { db, shouldClose } = await getIndexedDbHandle(providedDb);
  try {
    return await serializeStoreItems(
      await readStoreItems(db, STORES.CUSTOM_WALLPAPERS)
    );
  } finally {
    if (shouldClose) {
      db.close();
    }
  }
}

export async function serializeCustomWallpapersRecords(
  providedDb?: IDBDatabase
): Promise<SerializedStoreItemRecord[]> {
  const { db, shouldClose } = await getIndexedDbHandle(providedDb);
  try {
    return await serializeStoreItemRecords(
      await readStoreItems(db, STORES.CUSTOM_WALLPAPERS)
    );
  } finally {
    if (shouldClose) {
      db.close();
    }
  }
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

export function getIndividualBlobStoreName(
  domain: IndividualBlobSyncDomain
): string {
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

export function getIndividualBlobDeletedKeys(
  domain: IndividualBlobSyncDomain
): DeletionMarkerMap {
  const deletionMarkers = useCloudSyncStore.getState().deletionMarkers;

  switch (domain) {
    case "files-images":
      return deletionMarkers.fileImageKeys;
    case "files-trash":
      return deletionMarkers.fileTrashKeys;
    case "files-applets":
      return deletionMarkers.fileAppletKeys;
    case "custom-wallpapers":
      return deletionMarkers.customWallpaperKeys;
  }
}

export function pruneDeletedKeysForExistingRecords(
  domain: IndividualBlobSyncDomain,
  records: SerializedStoreItemRecord[]
): DeletionMarkerMap {
  const deletedKeys = getIndividualBlobDeletedKeys(domain);
  if (Object.keys(deletedKeys).length === 0 || records.length === 0) {
    return deletedKeys;
  }

  const existingKeys = new Set(records.map((record) => record.item.key));
  const staleDeletedKeys = Object.keys(deletedKeys).filter((key) =>
    existingKeys.has(key)
  );

  if (staleDeletedKeys.length > 0) {
    useCloudSyncStore
      .getState()
      .clearDeletedKeys(getIndividualBlobDeletionBucket(domain), staleDeletedKeys);
  }

  return Object.fromEntries(
    Object.entries(deletedKeys).filter(([key]) => !existingKeys.has(key))
  );
}

export async function serializeIndividualBlobDomainRecords(
  domain: IndividualBlobSyncDomain,
  providedDb?: IDBDatabase
): Promise<SerializedStoreItemRecord[]> {
  switch (domain) {
    case "files-images":
      return serializeIndexedDbStoreRecords(STORES.IMAGES, providedDb);
    case "files-trash":
      return serializeIndexedDbStoreRecords(STORES.TRASH, providedDb);
    case "files-applets":
      return serializeIndexedDbStoreRecords(STORES.APPLETS, providedDb);
    case "custom-wallpapers":
      return serializeCustomWallpapersRecords(providedDb);
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

async function finalizeCustomWallpaperSync(
  remoteKeys: Iterable<string>
): Promise<void> {
  const remoteKeySet = new Set(remoteKeys);
  const displayStore = useDisplaySettingsStore.getState();
  const current = displayStore.currentWallpaper;

  if (current?.startsWith("indexeddb://")) {
    const id = current.substring("indexeddb://".length);
    if (remoteKeySet.has(id)) {
      await displayStore.setWallpaper(current);
    } else {
      useDisplaySettingsStore.setState({
        currentWallpaper: "/wallpapers/photos/aqua/water.jpg",
        wallpaperSource: "/wallpapers/photos/aqua/water.jpg",
      });
    }
  }

  displayStore.bumpCustomWallpapersRevision();
}

export async function applyIndividualBlobDomain(
  domain: IndividualBlobSyncDomain,
  keysToDelete: string[],
  changedItems: Record<string, StoreItemWithKey>,
  deletedKeys: DeletionMarkerMap = {},
  providedDb?: IDBDatabase
): Promise<void> {
  const storeName = getIndividualBlobStoreName(domain);
  const { db, shouldClose } = await getIndexedDbHandle(providedDb);
  let existingKeys = new Set<string>();

  try {
    const existingItems = await readStoreItems(db, storeName);
    existingKeys = new Set(existingItems.map((item) => item.key));

    await deleteStoreItemsByKey(db, storeName, keysToDelete);
    await upsertStoreItems(
      db,
      storeName,
      Object.values(changedItems).filter((item) => !deletedKeys[item.key])
    );
  } finally {
    if (shouldClose) {
      db.close();
    }
  }

  if (domain === "custom-wallpapers") {
    const finalKeySet = new Set(
      Array.from(existingKeys).filter((key) => !keysToDelete.includes(key))
    );
    for (const item of Object.values(changedItems)) {
      if (!deletedKeys[item.key]) {
        finalKeySet.add(item.key);
      }
    }
    await finalizeCustomWallpaperSync(finalKeySet);
  }
}

export async function applyMonolithicBlobSnapshotToIndividualDomain(
  domain: IndividualBlobSyncDomain,
  data: StoreItemWithKey[],
  providedDb?: IDBDatabase
): Promise<void> {
  const changedItems = Object.fromEntries(
    data.map((item) => [item.key, item])
  ) as Record<string, StoreItemWithKey>;

  await applyIndividualBlobDomain(
    domain,
    [],
    changedItems,
    getIndividualBlobDeletedKeys(domain),
    providedDb
  );
}
