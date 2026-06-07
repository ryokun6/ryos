import {
  getCloudSyncServerVersion,
  normalizeCloudSyncVersionState,
  type CloudSyncVersionState,
} from "./cloudSyncVersion";

export const CLOUD_SYNC_DELETION_BUCKETS = [
  "calendarTodoIds",
  "calendarEventIds",
  "calendarIds",
  "stickyNoteIds",
  "contactIds",
  "fileMetadataPaths",
  "fileImageKeys",
  "fileTrashKeys",
  "fileAppletKeys",
  "customWallpaperKeys",
  "songTrackIds",
  "tvCustomChannelIds",
  "mapsFavoriteIds",
] as const;

export type CloudSyncDeletionBucket =
  (typeof CLOUD_SYNC_DELETION_BUCKETS)[number];

export const CLOUD_SYNC_DOMAIN_DESCRIPTORS = [
  {
    domain: "settings",
    category: "settings",
    storage: "redis",
    uploadDebounceMs: 2500,
    maxUploadDebounceMs: 8_000,
  },
  {
    domain: "files-metadata",
    category: "files",
    storage: "redis",
    uploadDebounceMs: 8000,
    maxUploadDebounceMs: 15_000,
    deletionBuckets: ["fileMetadataPaths"],
  },
  {
    domain: "files-images",
    category: "files",
    storage: "blob",
    uploadDebounceMs: 8000,
    maxUploadDebounceMs: 15_000,
    deletionBuckets: ["fileImageKeys"],
  },
  {
    domain: "files-trash",
    category: "files",
    storage: "blob",
    uploadDebounceMs: 5000,
    maxUploadDebounceMs: 10_000,
    deletionBuckets: ["fileTrashKeys"],
  },
  {
    domain: "files-applets",
    category: "files",
    storage: "blob",
    uploadDebounceMs: 8000,
    maxUploadDebounceMs: 15_000,
    deletionBuckets: ["fileAppletKeys"],
  },
  {
    domain: "songs",
    category: "songs",
    storage: "redis",
    uploadDebounceMs: 4000,
    maxUploadDebounceMs: 10_000,
    deletionBuckets: ["songTrackIds"],
  },
  {
    domain: "videos",
    category: "videos",
    storage: "redis",
    uploadDebounceMs: 4000,
    maxUploadDebounceMs: 10_000,
  },
  {
    domain: "tv",
    category: "tv",
    storage: "redis",
    uploadDebounceMs: 3000,
    maxUploadDebounceMs: 8_000,
    deletionBuckets: ["tvCustomChannelIds"],
  },
  {
    domain: "stickies",
    category: "stickies",
    storage: "redis",
    uploadDebounceMs: 3000,
    maxUploadDebounceMs: 8_000,
    deletionBuckets: ["stickyNoteIds"],
  },
  {
    domain: "calendar",
    category: "calendar",
    storage: "redis",
    uploadDebounceMs: 4000,
    maxUploadDebounceMs: 10_000,
    deletionBuckets: ["calendarTodoIds", "calendarEventIds", "calendarIds"],
  },
  {
    domain: "contacts",
    category: "contacts",
    storage: "redis",
    uploadDebounceMs: 3000,
    maxUploadDebounceMs: 8_000,
    deletionBuckets: ["contactIds"],
  },
  {
    domain: "maps",
    category: "maps",
    storage: "redis",
    uploadDebounceMs: 3000,
    maxUploadDebounceMs: 8_000,
    deletionBuckets: ["mapsFavoriteIds"],
  },
  {
    domain: "custom-wallpapers",
    category: "files",
    storage: "blob",
    uploadDebounceMs: 8000,
    maxUploadDebounceMs: 15_000,
    deletionBuckets: ["customWallpaperKeys"],
  },
] as const;

export type CloudSyncDomain =
  (typeof CLOUD_SYNC_DOMAIN_DESCRIPTORS)[number]["domain"];
export type CloudSyncCategory =
  (typeof CLOUD_SYNC_DOMAIN_DESCRIPTORS)[number]["category"];
export type CloudSyncStorageKind =
  (typeof CLOUD_SYNC_DOMAIN_DESCRIPTORS)[number]["storage"];

export const CLOUD_SYNC_DOMAINS = CLOUD_SYNC_DOMAIN_DESCRIPTORS.map(
  (descriptor) => descriptor.domain
) as readonly CloudSyncDomain[];

export function getCloudSyncRemoteApplyDomains(
  domains: readonly CloudSyncDomain[] = CLOUD_SYNC_DOMAINS
): CloudSyncDomain[] {
  const orderedDomains = [...domains];
  const settingsIndex = orderedDomains.indexOf("settings");
  const customWallpapersIndex = orderedDomains.indexOf("custom-wallpapers");

  // Apply wallpaper blobs before settings so indexeddb:// wallpaper references
  // can resolve during the same first-sync batch.
  if (settingsIndex === -1 || customWallpapersIndex === -1) {
    return orderedDomains;
  }

  if (customWallpapersIndex > settingsIndex) {
    const [customWallpapersDomain] = orderedDomains.splice(customWallpapersIndex, 1);
    orderedDomains.splice(settingsIndex, 0, customWallpapersDomain);
  }

  return orderedDomains;
}

export const CLOUD_SYNC_REMOTE_APPLY_DOMAINS = getCloudSyncRemoteApplyDomains();

export type CloudSyncDomainDescriptor =
  (typeof CLOUD_SYNC_DOMAIN_DESCRIPTORS)[number];

export function getCloudSyncDomainDescriptor(
  domain: CloudSyncDomain
): CloudSyncDomainDescriptor {
  return CLOUD_SYNC_DOMAIN_DESCRIPTORS.find(
    (descriptor) => descriptor.domain === domain
  ) as CloudSyncDomainDescriptor;
}

export type FileCloudSyncDomain = Extract<
  CloudSyncDomain,
  | "files-metadata"
  | "files-images"
  | "files-trash"
  | "files-applets"
  | "custom-wallpapers"
>;

export const FILE_SYNC_DOMAINS = CLOUD_SYNC_DOMAIN_DESCRIPTORS.filter(
  (descriptor) => descriptor.category === "files"
).map((descriptor) => descriptor.domain) as readonly FileCloudSyncDomain[];

export type RedisSyncDomain = Extract<
  CloudSyncDomain,
  | "settings"
  | "files-metadata"
  | "songs"
  | "videos"
  | "tv"
  | "stickies"
  | "calendar"
  | "contacts"
  | "maps"
>;

export const REDIS_SYNC_DOMAINS = CLOUD_SYNC_DOMAIN_DESCRIPTORS.filter(
  (descriptor) => descriptor.storage === "redis"
).map((descriptor) => descriptor.domain) as readonly RedisSyncDomain[];

export type BlobSyncDomain = Extract<
  CloudSyncDomain,
  "files-images" | "files-trash" | "files-applets" | "custom-wallpapers"
>;

export const BLOB_SYNC_DOMAINS = CLOUD_SYNC_DOMAIN_DESCRIPTORS.filter(
  (descriptor) => descriptor.storage === "blob"
).map((descriptor) => descriptor.domain) as readonly BlobSyncDomain[];

export const INDIVIDUAL_BLOB_SYNC_DOMAINS = BLOB_SYNC_DOMAINS;

export type IndividualBlobSyncDomain = BlobSyncDomain;

export function isRedisSyncDomain(domain: CloudSyncDomain): domain is RedisSyncDomain {
  return (REDIS_SYNC_DOMAINS as readonly string[]).includes(domain);
}

export function isBlobSyncDomain(domain: CloudSyncDomain): domain is BlobSyncDomain {
  return (BLOB_SYNC_DOMAINS as readonly string[]).includes(domain);
}

export function isIndividualBlobSyncDomain(
  domain: CloudSyncDomain
): domain is IndividualBlobSyncDomain {
  return (INDIVIDUAL_BLOB_SYNC_DOMAINS as readonly string[]).includes(domain);
}

export interface CloudSyncDomainMetadata {
  updatedAt: string;
  version: number;
  totalSize: number;
  createdAt: string;
  syncVersion?: CloudSyncVersionState | null;
}

export interface CloudSyncBlobItemMetadata {
  updatedAt: string;
  signature: string;
  size: number;
  storageUrl?: string;
  blobUrl?: string;
  syncVersion?: CloudSyncVersionState | null;
}

export interface CloudSyncBlobItemDownloadMetadata {
  updatedAt: string;
  signature: string;
  size: number;
  storageUrl: string;
  downloadUrl: string;
}

export type CloudSyncMetadataMap = Record<
  CloudSyncDomain,
  CloudSyncDomainMetadata | null
>;

export interface CloudSyncEnvelope<TData> {
  domain: CloudSyncDomain;
  version: number;
  updatedAt: string;
  data: TData;
}

export interface ShouldApplyRemoteUpdateParams {
  remoteUpdatedAt: string | null | undefined;
  remoteSyncVersion?: CloudSyncVersionState | null;
  lastAppliedRemoteAt?: string | null;
  lastUploadedAt?: string | null;
  lastLocalChangeAt?: string | null;
  hasPendingUpload?: boolean;
  lastKnownServerVersion?: number | null;
}

export const AUTO_SYNC_SNAPSHOT_VERSION = 1;

/** Channel name for realtime sync notifications (Pusher/local). */
export function getSyncChannelName(username: string): string {
  return `sync-${username.toLowerCase().replace(/[^a-z0-9_\-.]/g, "_")}`;
}

export function isCloudSyncDomain(value: unknown): value is CloudSyncDomain {
  return (
    typeof value === "string" &&
    CLOUD_SYNC_DOMAINS.includes(value as CloudSyncDomain)
  );
}

export function isFileCloudSyncDomain(
  value: CloudSyncDomain
): value is FileCloudSyncDomain {
  return FILE_SYNC_DOMAINS.includes(value as FileCloudSyncDomain);
}

export function getCloudSyncCategory(
  domain: CloudSyncDomain
): CloudSyncCategory {
  return getCloudSyncDomainDescriptor(domain).category;
}

export function createEmptyCloudSyncMetadataMap(): CloudSyncMetadataMap {
  return Object.fromEntries(
    CLOUD_SYNC_DOMAINS.map((domain) => [domain, null])
  ) as CloudSyncMetadataMap;
}

export function parseCloudSyncTimestamp(
  value: string | null | undefined
): number {
  if (!value) {
    return 0;
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function hasUnsyncedLocalChanges(
  lastLocalChangeAt: string | null | undefined,
  lastUploadedAt: string | null | undefined,
  lastAppliedRemoteAt: string | null | undefined = null,
  hasPendingUpload: boolean = false
): boolean {
  if (hasPendingUpload) {
    return true;
  }

  const newestAcknowledgedLocalTime = Math.max(
    parseCloudSyncTimestamp(lastUploadedAt),
    parseCloudSyncTimestamp(lastAppliedRemoteAt)
  );

  return parseCloudSyncTimestamp(lastLocalChangeAt) > newestAcknowledgedLocalTime;
}

export function shouldApplyRemoteUpdate({
  remoteUpdatedAt,
  remoteSyncVersion,
  lastAppliedRemoteAt,
  lastUploadedAt,
  lastLocalChangeAt,
  hasPendingUpload = false,
  lastKnownServerVersion,
}: ShouldApplyRemoteUpdateParams): boolean {
  const remoteServerVersion = getCloudSyncServerVersion(remoteSyncVersion);
  const remoteTime = parseCloudSyncTimestamp(remoteUpdatedAt);

  if (remoteServerVersion === 0 && remoteTime === 0) {
    return false;
  }

  if (
    hasUnsyncedLocalChanges(
      lastLocalChangeAt,
      lastUploadedAt,
      lastAppliedRemoteAt,
      hasPendingUpload
    )
  ) {
    return false;
  }

  if (remoteServerVersion > 0) {
    const shouldApplyByVersion =
      remoteServerVersion > (lastKnownServerVersion || 0);

    return shouldApplyByVersion;
  }

  const newestKnownLocalTime = Math.max(
    parseCloudSyncTimestamp(lastAppliedRemoteAt),
    parseCloudSyncTimestamp(lastUploadedAt)
  );

  return remoteTime > newestKnownLocalTime;
}

export function shouldRecheckRemoteAfterLocalSync(
  params: ShouldApplyRemoteUpdateParams
): boolean {
  const {
    remoteUpdatedAt,
    remoteSyncVersion,
    lastAppliedRemoteAt,
    lastUploadedAt,
    lastLocalChangeAt,
    hasPendingUpload = false,
    lastKnownServerVersion,
  } = params;

  if (
    !hasUnsyncedLocalChanges(
      lastLocalChangeAt,
      lastUploadedAt,
      lastAppliedRemoteAt,
      hasPendingUpload
    )
  ) {
    return false;
  }

  const remoteServerVersion = getCloudSyncServerVersion(remoteSyncVersion);
  const remoteTime = parseCloudSyncTimestamp(remoteUpdatedAt);

  if (remoteServerVersion === 0 && remoteTime === 0) {
    return false;
  }

  if (remoteServerVersion > 0) {
    return remoteServerVersion > (lastKnownServerVersion || 0);
  }

  const newestKnownLocalTime = Math.max(
    parseCloudSyncTimestamp(lastAppliedRemoteAt),
    parseCloudSyncTimestamp(lastUploadedAt)
  );

  return remoteTime > newestKnownLocalTime;
}

export function getLatestCloudSyncTimestamp(
  values: Array<string | null | undefined>
): string | null {
  let latestValue: string | null = null;
  let latestTimestamp = 0;

  for (const value of values) {
    const parsed = parseCloudSyncTimestamp(value);
    if (parsed > latestTimestamp && value) {
      latestTimestamp = parsed;
      latestValue = value;
    }
  }

  return latestValue;
}

function normalizeMetadataEntry(
  value: unknown
): CloudSyncDomainMetadata | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<CloudSyncDomainMetadata>;

  if (
    typeof candidate.updatedAt !== "string" ||
    typeof candidate.createdAt !== "string"
  ) {
    return null;
  }

  return {
    updatedAt: candidate.updatedAt,
    createdAt: candidate.createdAt,
    version:
      typeof candidate.version === "number" && Number.isFinite(candidate.version)
        ? candidate.version
        : AUTO_SYNC_SNAPSHOT_VERSION,
    totalSize:
      typeof candidate.totalSize === "number" &&
      Number.isFinite(candidate.totalSize)
        ? candidate.totalSize
        : 0,
    syncVersion: normalizeCloudSyncVersionState(candidate.syncVersion),
  };
}

export function normalizeCloudSyncMetadataMap(
  value: unknown
): CloudSyncMetadataMap {
  const normalized = createEmptyCloudSyncMetadataMap();

  if (!value || typeof value !== "object") {
    return normalized;
  }

  const candidate = value as Partial<Record<CloudSyncDomain, unknown>>;

  for (const domain of CLOUD_SYNC_DOMAINS) {
    normalized[domain] = normalizeMetadataEntry(candidate[domain]);
  }

  return normalized;
}
