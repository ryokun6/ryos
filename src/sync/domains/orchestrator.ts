import { abortableFetch } from "@/utils/abortableFetch";
import { STORES } from "@/utils/indexedDB";
import { getApiUrl } from "@/utils/platform";
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
import type { SettingsSnapshotData } from "@/utils/cloudSyncSettingsMerge";
import {
  beginApplyingRemoteDomain,
  endApplyingRemoteDomain,
} from "@/utils/cloudSyncRemoteApplyState";
import { normalizeDeletionMarkerMap } from "@/utils/cloudSyncDeletionMarkers";
import type {
  BlobIndividualDomainDownloadPayload,
  BlobMonolithicDomainDownloadPayload,
  CloudSyncDomainDownloadPayload,
  DownloadCloudSyncResult,
  PreparedCloudSyncDomainWrite,
  RedisStateDomainDownloadPayload,
} from "@/sync/types";
import type {
  CalendarSnapshotData,
  ContactsSnapshotData,
  MapsSnapshotData,
  SongsSnapshotData,
  StickiesSnapshotData,
  TvSnapshotData,
  VideosSnapshotData,
} from "@ryos/shared/contracts/sync-snapshots";
import {
  type AnySnapshotData,
  type AuthContext,
  type CustomWallpapersSnapshotData,
  type FilesMetadataSnapshotData,
  type FilesStoreSnapshotData,
  authHeaders,
  downloadGzipJson,
  fetchRedisStateDomainSnapshot,
  getDomainFetchCacheKey,
  individualBlobReconcileCache,
  redisStateDomainSnapshotCache,
} from "./_shared";
import {
  applyFilesMetadataSnapshot,
  mergeFilesMetadataConflict,
  prepareFilesMetadataDomainWrite,
  serializeCustomWallpapersSnapshot,
  serializeFilesMetadataSnapshot,
  serializeIndexedDbStoreSnapshot,
} from "./files";
import {
  applyIndividualBlobDownload,
  applyMonolithicBlobSnapshotToIndividualDomain,
  getIndividualBlobDeletedKeys,
  serializeIndividualBlobDomainRecords,
  uploadIndividualBlobDomain,
  uploadMonolithicBlobDomain,
} from "./blob";
import {
  applySettingsSnapshot,
  mergeSettingsConflict,
  prepareSettingsDomainWrite,
  serializeSettingsSnapshot,
  type CloudSyncRedisUploadOptions,
} from "./settings";
import { applySongsSnapshot, mergeSongsConflict, serializeSongsSnapshot } from "./songs";
import { applyVideosSnapshot, mergeVideosConflict, serializeVideosSnapshot } from "./videos";
import { applyTvSnapshot, applyTvSnapshotWithGuard, mergeTvConflict, serializeTvSnapshot } from "./tv";
import { applyStickiesSnapshot, mergeStickiesConflict, serializeStickiesSnapshot } from "./stickies";
import { applyCalendarSnapshot, mergeCalendarConflict, serializeCalendarSnapshot } from "./calendar";
import { applyContactsSnapshot, mergeContactsConflict, serializeContactsSnapshot } from "./contacts";
import { applyMapsSnapshot, mergeMapsConflict, serializeMapsSnapshot } from "./maps";
import {
  cacheRedisStateDomainSnapshot,
  createWriteSyncVersion,
  fetchBlobDomainInfo,
  type DownloadCloudSyncOptions,
} from "./_shared";

export type { CloudSyncRedisUploadOptions };

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
    case "tv":
      return {
        domain,
        version: AUTO_SYNC_SNAPSHOT_VERSION,
        updatedAt,
        data: serializeTvSnapshot(),
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
    case "maps":
      return {
        domain,
        version: AUTO_SYNC_SNAPSHOT_VERSION,
        updatedAt,
        data: serializeMapsSnapshot(),
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
      case "tv":
        applyTvSnapshot(envelope.data as TvSnapshotData);
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
      case "maps":
        applyMapsSnapshot(envelope.data as MapsSnapshotData);
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
      return mergeSettingsConflict(
        localData as SettingsSnapshotData,
        remoteData as SettingsSnapshotData,
        remoteUpdatedAt
      );
    case "files-metadata":
      return mergeFilesMetadataConflict(localData, remoteData);
    case "stickies":
      return mergeStickiesConflict(localData, remoteData);
    case "calendar":
      return mergeCalendarConflict(localData, remoteData);
    case "contacts":
      return mergeContactsConflict(localData, remoteData);
    case "maps":
      return mergeMapsConflict(localData, remoteData);
    case "songs":
      return mergeSongsConflict(localData, remoteData);
    case "videos":
      return mergeVideosConflict(localData, remoteData);
    case "tv":
      return mergeTvConflict(localData, remoteData);
    default:
      return null;
  }
}

export function invalidateRedisStateSnapshotForUpload(
  username: string,
  domain: RedisSyncDomain
): void {
  redisStateDomainSnapshotCache.invalidate(
    `${username.toLowerCase()}:${domain}`
  );
}

export async function fetchPhysicalCloudSyncMetadata(): Promise<CloudSyncMetadataMap> {
  const consolidatedRes = await abortableFetch(getApiUrl("/api/sync/domains"), {
    method: "GET",
    headers: authHeaders(),
    timeout: 15000,
    throwOnHttpError: false,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });

  if (consolidatedRes.ok) {
    const consolidatedData = (await consolidatedRes.json()) as {
      physicalMetadata?: Partial<CloudSyncMetadataMap>;
    };
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
  }
  throw new Error("Failed to fetch consolidated sync metadata");
}

async function prepareRedisStateDomainWrite(
  domain: RedisSyncDomain,
  auth: AuthContext,
  providedDb?: IDBDatabase,
  uploadOptions?: CloudSyncRedisUploadOptions
): Promise<PreparedCloudSyncDomainWrite> {
  if (domain === "files-metadata") {
    return prepareFilesMetadataDomainWrite(auth, providedDb);
  }
  if (domain === "settings") {
    return prepareSettingsDomainWrite(auth, uploadOptions);
  }

  const envelope = await createCloudSyncEnvelope(domain, providedDb);
  let data = envelope.data;
  let baseMetadata = useCloudSyncStore.getState().remoteMetadata[domain];

  const remoteSnapshot = await fetchRedisStateDomainSnapshot(domain, auth);
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
      cacheRedisStateDomainSnapshot(domain, auth, {
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
  } else if (domain === "tv") {
    await applyTvSnapshotWithGuard(data as TvSnapshotData);
  }
}

export async function prepareCloudSyncDomainWrite(
  domain: CloudSyncDomain,
  auth: AuthContext,
  providedDb?: IDBDatabase,
  uploadOptions?: CloudSyncRedisUploadOptions
): Promise<PreparedCloudSyncDomainWrite> {
  if (isRedisSyncDomain(domain)) {
    return prepareRedisStateDomainWrite(domain, auth, providedDb, uploadOptions);
  }
  if (isBlobSyncDomain(domain)) {
    return isIndividualBlobSyncDomain(domain)
      ? uploadIndividualBlobDomain(domain, auth, providedDb)
      : uploadMonolithicBlobDomain(domain, auth, async (d, db) => {
          const envelope = await createCloudSyncEnvelope(d, db);
          return envelope;
        }, providedDb);
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

    beginApplyingRemoteDomain(domain);
    try {
      await applyIndividualBlobDownload(
        domain,
        remoteItems,
        remoteDeletedItems,
        options?.db
      );
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

  const { planIndividualBlobDownload } = await import("@/utils/cloudSyncIndividualBlobMerge");
  const { mergeDeletionMarkerMaps } = await import("@/utils/cloudSyncDeletionMarkers");

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
    const { getIndividualBlobKnownItems } = await import("@/utils/cloudSyncIndividualBlobState");
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
