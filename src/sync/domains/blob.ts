import { STORES } from "@/utils/indexedDB";
import {
  DEFAULT_WALLPAPER_PATH,
  useDisplaySettingsStore,
} from "@/stores/useDisplaySettingsStore";
import { useCloudSyncStore, type CloudSyncDeletionBucket } from "@/stores/useCloudSyncStore";
import {
  AUTO_SYNC_SNAPSHOT_VERSION,
  type BlobSyncDomain,
  type IndividualBlobSyncDomain,
} from "@/utils/cloudSyncShared";
import type { DeletionMarkerMap } from "@/utils/cloudSyncDeletionMarkers";
import { mergeDeletionMarkerMaps } from "@/utils/cloudSyncDeletionMarkers";
import {
  getIndividualBlobKnownItems,
  setIndividualBlobKnownItems,
} from "@/utils/cloudSyncIndividualBlobState";
import {
  planIndividualBlobDownload,
  planIndividualBlobUpload,
} from "@/utils/cloudSyncIndividualBlobMerge";
import { readStoreItems } from "@/utils/indexedDBBackup";
import type { IndexedDBStoreItemWithKey as StoreItemWithKey } from "@/utils/indexedDBBackup";
import { uploadBlobWithStorageInstruction } from "@/utils/storageUpload";
import { requestBlobUploadInstruction as requestBlobUploadInstructionFromTransport } from "@/sync/transport";
import type { PreparedCloudSyncDomainWrite } from "@/sync/types";
import {
  serializeCustomWallpapersRecords,
  serializeIndexedDbStoreRecords,
} from "./files";
import {
  type AuthContext,
  type BlobSyncItemEnvelope,
  type FilesStoreSnapshotData,
  createWriteSyncVersion,
  deleteStoreItemsByKey,
  fetchBlobDomainInfo,
  getIndividualBlobStoreName,
  getIndexedDbHandle,
  gzipJson,
  serializeStoreItemRecords,
  upsertStoreItems,
} from "./_shared";

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

function pruneDeletedKeysForExistingRecords(
  domain: IndividualBlobSyncDomain,
  records: Awaited<ReturnType<typeof serializeStoreItemRecords>>
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
) {
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
        currentWallpaper: DEFAULT_WALLPAPER_PATH,
        wallpaperSource: DEFAULT_WALLPAPER_PATH,
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

export async function uploadMonolithicBlobDomain(
  domain: BlobSyncDomain,
  auth: AuthContext,
  createEnvelope: (domain: BlobSyncDomain, db?: IDBDatabase) => Promise<{
    data: unknown;
    updatedAt: string;
    version: number;
  }>,
  providedDb?: IDBDatabase
): Promise<PreparedCloudSyncDomainWrite> {
  const envelope = await createEnvelope(domain, providedDb);
  const remoteInfo = await fetchBlobDomainInfo(domain, auth).catch(() => null);
  const dataItems = Array.isArray(envelope.data) ? envelope.data.length : "N/A";
  console.log(`[CloudSync:blob] ${domain}: serialized ${dataItems} items`);
  const compressed = await gzipJson(envelope);
  console.log(`[CloudSync:blob] ${domain}: compressed to ${compressed.length} bytes`);

  const uploadInstruction = await requestBlobUploadInstructionFromTransport(domain);
  const uploadResult = await uploadBlobWithStorageInstruction(
    new Blob([compressed], { type: "application/gzip" }),
    uploadInstruction
  );

  return {
    domain,
    payload: {
      domain,
      storageUrl: uploadResult.storageUrl,
      updatedAt: envelope.updatedAt,
      version: envelope.version,
      totalSize: compressed.length,
      syncVersion: createWriteSyncVersion(
        domain,
        remoteInfo?.metadata || useCloudSyncStore.getState().remoteMetadata[domain]
      ),
    },
  };
}

export async function uploadIndividualBlobDomain(
  domain: IndividualBlobSyncDomain,
  auth: AuthContext,
  providedDb?: IDBDatabase
): Promise<PreparedCloudSyncDomainWrite> {
  const updatedAt = new Date().toISOString();
  const localRecords = await serializeIndividualBlobDomainRecords(domain, providedDb);
  const deletedItems = pruneDeletedKeysForExistingRecords(domain, localRecords);
  const knownItems = getIndividualBlobKnownItems(domain);
  const remoteInfo = await fetchBlobDomainInfo(domain, auth);
  const remoteItems =
    remoteInfo?.mode === "individual" ? remoteInfo.items || {} : {};
  const uploadPlan = planIndividualBlobUpload(
    localRecords,
    remoteItems,
    knownItems,
    deletedItems
  );
  const nextItems: Record<
    string,
    {
      updatedAt: string;
      signature: string;
      size: number;
      storageUrl: string;
    }
  > = {};
  let uploadedCount = 0;
  const nextKnownItems = {
    ...uploadPlan.nextKnownItems,
  };

  for (const [key, item] of Object.entries(uploadPlan.preservedRemoteItems)) {
    nextItems[key] = {
      updatedAt: item.updatedAt,
      signature: item.signature,
      size: item.size,
      storageUrl: item.storageUrl,
    };
  }

  for (const record of uploadPlan.itemsToUpload) {
    const uploadInstruction = await requestBlobUploadInstructionFromTransport(
      domain,
      record.item.key
    );
    const itemEnvelope: BlobSyncItemEnvelope = {
      domain,
      key: record.item.key,
      version: AUTO_SYNC_SNAPSHOT_VERSION,
      updatedAt,
      data: record.item,
    };
    const compressed = await gzipJson(itemEnvelope);
    const uploadResult = await uploadBlobWithStorageInstruction(
      new Blob([compressed], { type: "application/gzip" }),
      uploadInstruction
    );

    nextItems[record.item.key] = {
      updatedAt,
      signature: record.signature,
      size: compressed.length,
      storageUrl: uploadResult.storageUrl,
    };
    nextKnownItems[record.item.key] = {
      signature: record.signature,
      updatedAt,
    };
    uploadedCount += 1;
  }

  console.log(
    `[CloudSync:blob] ${domain}: uploaded ${uploadedCount}/${uploadPlan.itemsToUpload.length} individual items`
  );
  return {
    domain,
    payload: {
      domain,
      updatedAt,
      version: AUTO_SYNC_SNAPSHOT_VERSION,
      totalSize: Object.values(nextItems).reduce((sum, item) => sum + item.size, 0),
      items: nextItems,
      deletedItems,
      syncVersion: createWriteSyncVersion(
        domain,
        remoteInfo?.metadata || useCloudSyncStore.getState().remoteMetadata[domain]
      ),
    },
    onCommitted: async () => {
      setIndividualBlobKnownItems(domain, nextKnownItems);
    },
  };
}

export async function applyIndividualBlobDownload(
  domain: IndividualBlobSyncDomain,
  remoteItems: Record<string, import("@/utils/cloudSyncShared").CloudSyncBlobItemDownloadMetadata>,
  remoteDeletedItems: DeletionMarkerMap,
  providedDb?: IDBDatabase
): Promise<void> {
  const localDeletedItems = getIndividualBlobDeletedKeys(domain);
  const effectiveDeletedItems = mergeDeletionMarkerMaps(
    localDeletedItems,
    remoteDeletedItems
  );
  const localRecords = await serializeIndividualBlobDomainRecords(domain, providedDb);
  const knownItems = getIndividualBlobKnownItems(domain);
  const changedItems: Record<string, StoreItemWithKey> = {};
  const downloadPlan = planIndividualBlobDownload(
    localRecords,
    remoteItems,
    knownItems,
    effectiveDeletedItems
  );

  useCloudSyncStore
    .getState()
    .mergeDeletedKeys(getIndividualBlobDeletionBucket(domain), remoteDeletedItems);

  const { downloadGzipJson } = await import("./_shared");
  for (const itemKey of downloadPlan.itemKeysToDownload) {
    const itemMetadata = remoteItems[itemKey];
    const itemEnvelope = await downloadGzipJson<BlobSyncItemEnvelope>(
      itemMetadata.downloadUrl
    );
    changedItems[itemKey] = itemEnvelope.data;
  }

  const nextKnownItems = {
    ...downloadPlan.nextKnownItems,
  };
  for (const itemKey of downloadPlan.itemKeysToDownload) {
    nextKnownItems[itemKey] = {
      signature: remoteItems[itemKey].signature,
      updatedAt: remoteItems[itemKey].updatedAt,
    };
  }

  await applyIndividualBlobDomain(
    domain,
    downloadPlan.keysToDelete,
    changedItems,
    effectiveDeletedItems,
    providedDb
  );
  setIndividualBlobKnownItems(domain, nextKnownItems);
}
