import { STORES } from "@/utils/indexedDB";
import { fetchConsolidatedCloudSyncMetadata } from "@/api/sync";
import { useCloudSyncStore } from "@/stores/useCloudSyncStore";
import {
  AUTO_SYNC_SNAPSHOT_VERSION,
  isRedisSyncDomain,
  isBlobSyncDomain,
  isIndividualBlobSyncDomain,
  REDIS_SYNC_DOMAINS,
  BLOB_SYNC_DOMAINS,
  type CloudSyncDomain,
  type CloudSyncDomainMetadata,
  type CloudSyncEnvelope,
  type CloudSyncMetadataMap,
  type RedisSyncDomain,
  type IndividualBlobSyncDomain,
  createEmptyCloudSyncMetadataMap,
} from "@/utils/cloudSyncShared";
import {
  getNextSyncClientVersion,
  getSyncClientId,
} from "@/sync/state";
import {
  fetchBlobDomainPayload,
  fetchRedisDomainSnapshot,
  requestBlobUploadInstruction as requestBlobUploadInstructionFromTransport,
} from "@/sync/transport";
import type { CloudSyncWriteVersion } from "@/utils/cloudSyncVersion";
import type { BlobSyncDomain } from "@/utils/cloudSyncShared";
import {
  mergeDeletionMarkerMaps,
  normalizeDeletionMarkerMap,
} from "@/utils/cloudSyncDeletionMarkers";
import { mergeFilesMetadataSnapshots } from "@/utils/cloudSyncFileMerge";
import {
  beginApplyingRemoteDomain,
  endApplyingRemoteDomain,
} from "@/utils/cloudSyncRemoteApplyState";
import { mergeSettingsSnapshotData } from "@/utils/cloudSyncSettingsMerge";
import {
  getIndividualBlobKnownItems,
  setIndividualBlobKnownItems,
} from "@/utils/cloudSyncIndividualBlobState";
import {
  planIndividualBlobDownload,
  planIndividualBlobUpload,
} from "@/utils/cloudSyncIndividualBlobMerge";
import { uploadBlobWithStorageInstruction } from "@/utils/storageUpload";
import type {
  BlobIndividualDomainDownloadPayload,
  BlobMonolithicDomainDownloadPayload,
  CloudSyncDomainDownloadPayload,
  DownloadCloudSyncResult,
  PreparedCloudSyncDomainWrite,
  RedisStateDomainDownloadPayload,
} from "@/sync/types";
import type { SettingsSnapshotData } from "@/utils/cloudSyncSettingsMerge";
import {
  SYNC_DOMAIN_FETCH_BURST_MS,
  blobDomainInfoCache,
  createBurstFetchCache,
  downloadGzipJson,
  gzipJson,
  individualBlobReconcileCache,
  serializeIndexedDbStoreSnapshot,
  type BlobDomainInfoResponse,
  type BlobSyncItemEnvelope,
  type StoreItemWithKey,
  getIndividualBlobDeletionBucket,
} from "./blob-shared";
import {
  applyFilesMetadataSnapshot,
  applyIndividualBlobDomain,
  applyMonolithicBlobSnapshotToIndividualDomain,
  getIndividualBlobDeletedKeys,
  serializeCustomWallpapersSnapshot,
  serializeFilesMetadataSnapshot,
  serializeIndividualBlobDomainRecords,
  pruneDeletedKeysForExistingRecords,
  type CustomWallpapersSnapshotData,
  type FilesMetadataSnapshotData,
  type FilesStoreSnapshotData,
} from "./files";
import { applySettingsSnapshot, serializeSettingsSnapshot } from "./settings";
import {
  applySongsSnapshot,
  mergeSongsSnapshots,
  serializeSongsSnapshot,
  type SongsSnapshotData,
} from "./songs";
import {
  applyVideosSnapshot,
  mergeVideosSnapshots,
  serializeVideosSnapshot,
  type VideosSnapshotData,
} from "./videos";
import {
  mergeStickiesSnapshots,
  serializeStickiesSnapshot,
  applyStickiesSnapshot,
  type StickiesSnapshotData,
} from "./stickies";
import {
  mergeCalendarSnapshots,
  serializeCalendarSnapshot,
  applyCalendarSnapshot,
  type CalendarSnapshotData,
} from "./calendar";
import {
  mergeContactsSnapshots,
  serializeContactsSnapshot,
  applyContactsSnapshot,
  type ContactsSnapshotData,
} from "./contacts";

export type { SettingsSnapshotData } from "@/utils/cloudSyncSettingsMerge";

type AuthContext = {
  username: string;
  isAuthenticated: boolean;
};

type AnySnapshotData =
  | SettingsSnapshotData
  | FilesMetadataSnapshotData
  | FilesStoreSnapshotData
  | SongsSnapshotData
  | VideosSnapshotData
  | StickiesSnapshotData
  | CalendarSnapshotData
  | ContactsSnapshotData
  | CustomWallpapersSnapshotData;

type RedisStateDomainSnapshot = {
  data: AnySnapshotData;
  metadata: CloudSyncDomainMetadata;
};

interface DownloadCloudSyncOptions {
  shouldApply?: (metadata: CloudSyncDomainMetadata) => boolean;
  db?: IDBDatabase;
}

const redisStateDomainSnapshotCache = createBurstFetchCache<
  RedisStateDomainSnapshot | null
>(SYNC_DOMAIN_FETCH_BURST_MS);

function getDomainFetchCacheKey(auth: AuthContext, domain: string): string {
  return `${auth.username.toLowerCase()}:${domain}`;
}

function cacheRedisStateDomainSnapshot(
  domain: RedisSyncDomain,
  auth: AuthContext,
  value: RedisStateDomainSnapshot | null
): void {
  redisStateDomainSnapshotCache.set(getDomainFetchCacheKey(auth, domain), value);
}

function createWriteSyncVersion(
  domain: CloudSyncDomain,
  baseMetadata: CloudSyncDomainMetadata | null | undefined
): CloudSyncWriteVersion {
  return {
    clientId: getSyncClientId(),
    clientVersion: getNextSyncClientVersion(domain),
    baseServerVersion: baseMetadata?.syncVersion?.serverVersion ?? null,
    knownClientVersions: baseMetadata?.syncVersion?.clientVersions || {},
  };
}

async function createCloudSyncEnvelope(
  domain: CloudSyncDomain,
  providedDb?: IDBDatabase
): Promise<CloudSyncEnvelope<AnySnapshotData>> {
  const updatedAt = new Date().toISOString();

  switch (domain) {
    case "settings":
      return {
        domain,
        version: AUTO_SYNC_SNAPSHOT_VERSION,
        updatedAt,
        data: serializeSettingsSnapshot(),
      };
    case "files-metadata":
      return {
        domain,
        version: AUTO_SYNC_SNAPSHOT_VERSION,
        updatedAt,
        data: await serializeFilesMetadataSnapshot(providedDb),
      };
    case "files-images":
      return {
        domain,
        version: AUTO_SYNC_SNAPSHOT_VERSION,
        updatedAt,
        data: await serializeIndexedDbStoreSnapshot(STORES.IMAGES, providedDb),
      };
    case "files-trash":
      return {
        domain,
        version: AUTO_SYNC_SNAPSHOT_VERSION,
        updatedAt,
        data: await serializeIndexedDbStoreSnapshot(STORES.TRASH, providedDb),
      };
    case "files-applets":
      return {
        domain,
        version: AUTO_SYNC_SNAPSHOT_VERSION,
        updatedAt,
        data: await serializeIndexedDbStoreSnapshot(STORES.APPLETS, providedDb),
      };
    case "songs":
      return {
        domain,
        version: AUTO_SYNC_SNAPSHOT_VERSION,
        updatedAt,
        data: serializeSongsSnapshot(),
      };
    case "videos":
      return {
        domain,
        version: AUTO_SYNC_SNAPSHOT_VERSION,
        updatedAt,
        data: serializeVideosSnapshot(),
      };
    case "stickies":
      return {
        domain,
        version: AUTO_SYNC_SNAPSHOT_VERSION,
        updatedAt,
        data: serializeStickiesSnapshot(),
      };
    case "calendar":
      return {
        domain,
        version: AUTO_SYNC_SNAPSHOT_VERSION,
        updatedAt,
        data: serializeCalendarSnapshot(),
      };
    case "contacts":
      return {
        domain,
        version: AUTO_SYNC_SNAPSHOT_VERSION,
        updatedAt,
        data: serializeContactsSnapshot(),
      };
    case "custom-wallpapers":
      return {
        domain,
        version: AUTO_SYNC_SNAPSHOT_VERSION,
        updatedAt,
        data: await serializeCustomWallpapersSnapshot(providedDb),
      };
  }
}

async function applyCloudSyncEnvelope(
  envelope: CloudSyncEnvelope<AnySnapshotData>,
  providedDb?: IDBDatabase
): Promise<void> {
  beginApplyingRemoteDomain(envelope.domain);
  try {
    switch (envelope.domain) {
      case "settings":
        await applySettingsSnapshot(
          envelope.data as SettingsSnapshotData,
          envelope.updatedAt,
          providedDb
        );
        return;
      case "files-metadata":
        await applyFilesMetadataSnapshot(
          envelope.data as FilesMetadataSnapshotData,
          providedDb
        );
        return;
      case "files-images":
        await applyMonolithicBlobSnapshotToIndividualDomain(
          "files-images",
          envelope.data as FilesStoreSnapshotData,
          providedDb
        );
        return;
      case "files-trash":
        await applyMonolithicBlobSnapshotToIndividualDomain(
          "files-trash",
          envelope.data as FilesStoreSnapshotData,
          providedDb
        );
        return;
      case "files-applets":
        await applyMonolithicBlobSnapshotToIndividualDomain(
          "files-applets",
          envelope.data as FilesStoreSnapshotData,
          providedDb
        );
        return;
      case "songs":
        applySongsSnapshot(envelope.data as SongsSnapshotData);
        return;
      case "videos":
        applyVideosSnapshot(envelope.data as VideosSnapshotData);
        return;
      case "stickies":
        applyStickiesSnapshot(envelope.data as StickiesSnapshotData);
        return;
      case "calendar":
        applyCalendarSnapshot(envelope.data as CalendarSnapshotData);
        return;
      case "contacts":
        applyContactsSnapshot(envelope.data as ContactsSnapshotData);
        return;
      case "custom-wallpapers":
        await applyMonolithicBlobSnapshotToIndividualDomain(
          "custom-wallpapers",
          envelope.data as CustomWallpapersSnapshotData,
          providedDb
        );
        return;
    }
  } finally {
    endApplyingRemoteDomain(envelope.domain);
  }
}

function mergeRedisStateConflict(
  domain: RedisSyncDomain,
  localData: AnySnapshotData,
  remoteData: AnySnapshotData,
  remoteUpdatedAt: string
): AnySnapshotData | null {
  switch (domain) {
    case "settings":
      return mergeSettingsSnapshotData(
        localData as SettingsSnapshotData,
        remoteData as SettingsSnapshotData,
        null,
        remoteUpdatedAt
      );
    case "files-metadata":
      return mergeFilesMetadataSnapshots(
        localData as FilesMetadataSnapshotData,
        remoteData as FilesMetadataSnapshotData
      );
    case "stickies":
      return mergeStickiesSnapshots(
        localData as StickiesSnapshotData,
        remoteData as StickiesSnapshotData
      );
    case "calendar":
      return mergeCalendarSnapshots(
        localData as CalendarSnapshotData,
        remoteData as CalendarSnapshotData
      );
    case "contacts":
      return mergeContactsSnapshots(
        localData as ContactsSnapshotData,
        remoteData as ContactsSnapshotData
      );
    case "songs":
      return mergeSongsSnapshots(
        localData as SongsSnapshotData,
        remoteData as SongsSnapshotData
      );
    case "videos":
      return mergeVideosSnapshots(
        localData as VideosSnapshotData,
        remoteData as VideosSnapshotData
      );
    default:
      return null;
  }
}

async function fetchRedisStateDomainSnapshot(
  domain: RedisSyncDomain,
  _auth: AuthContext
): Promise<RedisStateDomainSnapshot | null> {
  return redisStateDomainSnapshotCache.get(
    getDomainFetchCacheKey(_auth, domain),
    async () => {
      const result = await fetchRedisDomainSnapshot(domain);
      if (!result) {
        return null;
      }

      return {
        data: result.data as AnySnapshotData,
        metadata: result.metadata,
      };
    }
  );
}

async function fetchBlobDomainInfo(
  domain: BlobSyncDomain,
  _auth: AuthContext
): Promise<BlobDomainInfoResponse | null> {
  return blobDomainInfoCache.get(
    getDomainFetchCacheKey(_auth, domain),
    async () => (await fetchBlobDomainPayload(domain)) as BlobDomainInfoResponse | null
  );
}

async function prepareRedisStateDomainWrite(
  domain: RedisSyncDomain,
  _auth: AuthContext,
  providedDb?: IDBDatabase
): Promise<PreparedCloudSyncDomainWrite> {
  const envelope = await createCloudSyncEnvelope(domain, providedDb);
  let data = envelope.data;
  let baseMetadata = useCloudSyncStore.getState().remoteMetadata[domain];

  const remoteSnapshot = await fetchRedisStateDomainSnapshot(domain, _auth);
  if (remoteSnapshot?.data) {
    const merged = mergeRedisStateConflict(
      domain,
      envelope.data,
      remoteSnapshot.data,
      remoteSnapshot.metadata.updatedAt
    );
    if (merged) {
      data = merged;
      baseMetadata = remoteSnapshot.metadata;
    }
  }

  return {
    domain,
    payload: {
      domain,
      data,
      updatedAt: envelope.updatedAt,
      version: envelope.version,
      syncVersion: createWriteSyncVersion(domain, baseMetadata),
    },
    onCommitted: async (metadata) => {
      cacheRedisStateDomainSnapshot(domain, _auth, {
        data,
        metadata,
      });
      await applyResolvedRedisUploadLocally(domain, data, metadata.updatedAt);
    },
  };
}

export async function applyResolvedRedisUploadLocally(
  domain: RedisSyncDomain,
  data: AnySnapshotData,
  updatedAt: string
): Promise<void> {
  if (domain === "settings") {
    await applySettingsSnapshot(data as SettingsSnapshotData, updatedAt);
  }
}

async function uploadMonolithicBlobDomain(
  domain: BlobSyncDomain,
  _auth: AuthContext,
  providedDb?: IDBDatabase
): Promise<PreparedCloudSyncDomainWrite> {
  const envelope = await createCloudSyncEnvelope(domain, providedDb);
  const remoteInfo = await fetchBlobDomainInfo(domain, _auth).catch(() => null);
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

async function uploadIndividualBlobDomain(
  domain: IndividualBlobSyncDomain,
  _auth: AuthContext,
  providedDb?: IDBDatabase
): Promise<PreparedCloudSyncDomainWrite> {
  const updatedAt = new Date().toISOString();
  const localRecords = await serializeIndividualBlobDomainRecords(domain, providedDb);
  const deletedItems = pruneDeletedKeysForExistingRecords(domain, localRecords);
  const knownItems = getIndividualBlobKnownItems(domain);
  const remoteInfo = await fetchBlobDomainInfo(domain, _auth);
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

export async function fetchPhysicalCloudSyncMetadata(): Promise<CloudSyncMetadataMap> {
  const consolidatedData = await fetchConsolidatedCloudSyncMetadata();
  if (consolidatedData.physicalMetadata) {
    const merged = createEmptyCloudSyncMetadataMap();
    for (const domain of [...BLOB_SYNC_DOMAINS, ...REDIS_SYNC_DOMAINS]) {
      const entry =
        consolidatedData.physicalMetadata[
          domain as keyof typeof consolidatedData.physicalMetadata
        ];
      if (entry) {
        merged[domain] = entry as CloudSyncDomainMetadata;
      }
    }
    return merged;
  }
  throw new Error("Failed to fetch consolidated sync metadata");
}

export async function prepareCloudSyncDomainWrite(
  domain: CloudSyncDomain,
  _auth: AuthContext,
  providedDb?: IDBDatabase
): Promise<PreparedCloudSyncDomainWrite> {
  if (isRedisSyncDomain(domain)) {
    return prepareRedisStateDomainWrite(domain, _auth, providedDb);
  }
  if (isBlobSyncDomain(domain)) {
    return isIndividualBlobSyncDomain(domain)
      ? uploadIndividualBlobDomain(domain, _auth, providedDb)
      : uploadMonolithicBlobDomain(domain, _auth, providedDb);
  }
  throw new Error(`Unknown sync domain: ${domain}`);
}

export async function applyDownloadedCloudSyncDomainPayload(
  domain: CloudSyncDomain,
  payload: CloudSyncDomainDownloadPayload,
  options?: DownloadCloudSyncOptions
): Promise<DownloadCloudSyncResult> {
  if (options?.shouldApply && !options.shouldApply(payload.metadata)) {
    return {
      metadata: payload.metadata,
      applied: false,
    };
  }

  if (isRedisSyncDomain(domain)) {
    const redisPayload = payload as RedisStateDomainDownloadPayload;
    const envelope: CloudSyncEnvelope<AnySnapshotData> = {
      domain,
      version: redisPayload.metadata.version,
      updatedAt: redisPayload.metadata.updatedAt,
      data: redisPayload.data as AnySnapshotData,
    };

    await applyCloudSyncEnvelope(envelope, options?.db);
    return {
      metadata: redisPayload.metadata,
      applied: true,
    };
  }

  if (!isBlobSyncDomain(domain)) {
    throw new Error(`Unknown sync domain: ${domain}`);
  }

  const data =
    payload as BlobMonolithicDomainDownloadPayload | BlobIndividualDomainDownloadPayload;

  if (isIndividualBlobSyncDomain(domain) && "mode" in data && data.mode === "individual") {
    const remoteItems = data.items || {};
    const remoteDeletedItems = normalizeDeletionMarkerMap(data.deletedItems);
    const localDeletedItems = getIndividualBlobDeletedKeys(domain);
    const effectiveDeletedItems = mergeDeletionMarkerMaps(
      localDeletedItems,
      remoteDeletedItems
    );
    const localRecords = await serializeIndividualBlobDomainRecords(
      domain,
      options?.db
    );
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

    beginApplyingRemoteDomain(domain);
    try {
      await applyIndividualBlobDomain(
        domain,
        downloadPlan.keysToDelete,
        changedItems,
        effectiveDeletedItems,
        options?.db
      );
      setIndividualBlobKnownItems(domain, nextKnownItems);
    } finally {
      endApplyingRemoteDomain(domain);
    }
    return {
      metadata: data.metadata,
      applied: true,
    };
  }

  const monolithicData = data as BlobMonolithicDomainDownloadPayload;
  const downloadUrl = monolithicData.downloadUrl || monolithicData.blobUrl;
  if (!downloadUrl) {
    throw new Error("Sync download response was invalid.");
  }

  const envelope = await downloadGzipJson<CloudSyncEnvelope<AnySnapshotData>>(downloadUrl);
  await applyCloudSyncEnvelope(envelope, options?.db);
  return {
    metadata: data.metadata,
    applied: true,
  };
}

export async function individualBlobDomainNeedsLocalReconcile(
  domain: IndividualBlobSyncDomain,
  auth: AuthContext,
  providedDb?: IDBDatabase
): Promise<boolean> {
  const data = await fetchBlobDomainInfo(domain, auth);
  if (!data?.metadata || data.mode !== "individual") {
    return false;
  }
  const reconcileCacheKey = `${getDomainFetchCacheKey(
    auth,
    domain
  )}:${data.metadata.updatedAt}:${data.metadata.syncVersion?.serverVersion || 0}`;

  return individualBlobReconcileCache.get(reconcileCacheKey, async () => {
    const remoteItems = data.items || {};
    const remoteDeletedItems = normalizeDeletionMarkerMap(data.deletedItems);
    const localDeletedItems = getIndividualBlobDeletedKeys(domain);
    const effectiveDeletedItems = mergeDeletionMarkerMaps(
      localDeletedItems,
      remoteDeletedItems
    );
    const localRecords = await serializeIndividualBlobDomainRecords(
      domain,
      providedDb
    );
    const knownItems = getIndividualBlobKnownItems(domain);
    const plan = planIndividualBlobDownload(
      localRecords,
      remoteItems,
      knownItems,
      effectiveDeletedItems
    );
    return plan.itemKeysToDownload.length > 0 || plan.keysToDelete.length > 0;
  });
}
