import { ensureIndexedDBInitialized, STORES } from "@/utils/indexedDB";
import {
  useCloudSyncStore,
  type CloudSyncDeletionBucket,
} from "@/stores/useCloudSyncStore";
import { useDisplaySettingsStore } from "@/stores/useDisplaySettingsStore";
import type { IndividualBlobSyncDomain } from "@/utils/cloudSyncShared";
import type { DeletionMarkerMap } from "@/utils/cloudSyncDeletionMarkers";
import {
  deleteStoreItemsByKey,
  readStoreItems,
  serializeIndexedDbStoreRecords,
  serializeIndexedDbStoreSnapshot,
  serializeStoreItemRecords,
  upsertStoreItems,
  type FilesStoreSnapshotData,
  type SerializedStoreItemRecord,
  type StoreItemWithKey,
} from "@/utils/sync/engine/domains/indexedDbStoreSync";

export interface BlobSyncItemEnvelope {
  domain: IndividualBlobSyncDomain;
  key: string;
  version: number;
  updatedAt: string;
  data: StoreItemWithKey;
}

function getIndividualBlobStoreName(domain: IndividualBlobSyncDomain): string {
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

export async function serializeIndividualBlobDomainSnapshot(
  domain: IndividualBlobSyncDomain
): Promise<FilesStoreSnapshotData> {
  return serializeIndexedDbStoreSnapshot(getIndividualBlobStoreName(domain));
}

export async function serializeIndividualBlobDomainRecords(
  domain: IndividualBlobSyncDomain
): Promise<SerializedStoreItemRecord[]> {
  if (domain === "custom-wallpapers") {
    const db = await ensureIndexedDBInitialized();
    try {
      return await serializeStoreItemRecords(
        await readStoreItems(db, STORES.CUSTOM_WALLPAPERS)
      );
    } finally {
      db.close();
    }
  }

  return serializeIndexedDbStoreRecords(getIndividualBlobStoreName(domain));
}

async function finalizeCustomWallpaperSync(remoteKeys: Iterable<string>): Promise<void> {
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
  deletedKeys: DeletionMarkerMap = {}
): Promise<void> {
  const storeName = getIndividualBlobStoreName(domain);
  const db = await ensureIndexedDBInitialized();
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
    db.close();
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
  data: FilesStoreSnapshotData
): Promise<void> {
  const changedItems = Object.fromEntries(
    data.map((item) => [item.key, item])
  ) as Record<string, StoreItemWithKey>;

  await applyIndividualBlobDomain(
    domain,
    [],
    changedItems,
    getIndividualBlobDeletedKeys(domain)
  );
}
