import { STORES } from "@/utils/indexedDB";
import { useDisplaySettingsStore } from "@/stores/useDisplaySettingsStore";
import { useFilesStore, type FileSystemItem } from "@/stores/useFilesStore";
import { useCloudSyncStore } from "@/stores/useCloudSyncStore";
import {
  readStoreItems,
  serializeStoreItems,
  type IndexedDBStoreItemWithKey as StoreItemWithKey,
} from "@/utils/indexedDBBackup";
import {
  mergeDeletionMarkerMaps,
  normalizeDeletionMarkerMap,
  type DeletionMarkerMap,
} from "@/utils/cloudSyncDeletionMarkers";
import {
  mergeFilesMetadataSnapshots,
  type FilesMetadataSyncSnapshot,
} from "@/utils/cloudSyncFileMerge";
import type { IndividualBlobSyncDomain } from "@/utils/cloudSyncShared";
import {
  applyIndexedDbStoreSnapshot,
  deleteStoreItemsByKey,
  getIndexedDbHandle,
  getIndividualBlobDeletionBucket,
  getIndividualBlobStoreName,
  serializeIndexedDbStoreRecords,
  serializeIndexedDbStoreSnapshot,
  serializeStoreItemRecords,
  upsertStoreItems,
  type SerializedStoreItemRecord,
} from "./blob-shared";

export type FilesStoreSnapshotData = StoreItemWithKey[];
export type CustomWallpapersSnapshotData = StoreItemWithKey[];

export interface FilesMetadataSnapshotData {
  items: Record<string, FileSystemItem>;
  libraryState: "uninitialized" | "loaded" | "cleared";
  documents?: FilesStoreSnapshotData;
  deletedPaths?: DeletionMarkerMap;
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

export async function serializeCustomWallpapersSnapshot(
  providedDb?: IDBDatabase
): Promise<CustomWallpapersSnapshotData> {
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

export async function serializeFilesMetadataSnapshot(
  providedDb?: IDBDatabase
): Promise<FilesMetadataSnapshotData> {
  const filesState = useFilesStore.getState();
  const deletionMarkers = useCloudSyncStore.getState().deletionMarkers;

  return {
    items: filesState.items,
    libraryState: filesState.libraryState,
    documents: await serializeIndexedDbStoreSnapshot(
      STORES.DOCUMENTS,
      providedDb
    ),
    deletedPaths: deletionMarkers.fileMetadataPaths,
  };
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
  data: FilesStoreSnapshotData,
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

export async function applyFilesMetadataSnapshot(
  data: FilesMetadataSnapshotData,
  providedDb?: IDBDatabase
): Promise<void> {
  const remoteDeletedPaths = normalizeDeletionMarkerMap(data.deletedPaths);
  const cloudSyncState = useCloudSyncStore.getState();
  const localDeletedPaths = cloudSyncState.deletionMarkers.fileMetadataPaths;
  const localSnapshot: FilesMetadataSyncSnapshot = {
    items: useFilesStore.getState().items,
    libraryState: useFilesStore.getState().libraryState,
    documents: await serializeIndexedDbStoreSnapshot(STORES.DOCUMENTS, providedDb),
    deletedPaths: localDeletedPaths,
  };
  const mergedSnapshot = mergeFilesMetadataSnapshots(localSnapshot, {
    ...data,
    deletedPaths: remoteDeletedPaths,
  });
  const effectiveDeletedPaths = mergeDeletionMarkerMaps(
    localDeletedPaths,
    remoteDeletedPaths
  );
  const prunedDeletedPaths = Object.keys(effectiveDeletedPaths).filter(
    (path) => !mergedSnapshot.deletedPaths?.[path]
  );

  cloudSyncState.mergeDeletedKeys("fileMetadataPaths", remoteDeletedPaths);
  cloudSyncState.clearDeletedKeys("fileMetadataPaths", prunedDeletedPaths);

  useFilesStore.setState({
    items: mergedSnapshot.items,
    libraryState: mergedSnapshot.libraryState,
  });

  await applyIndexedDbStoreSnapshot(
    STORES.DOCUMENTS,
    mergedSnapshot.documents || [],
    providedDb
  );
}
