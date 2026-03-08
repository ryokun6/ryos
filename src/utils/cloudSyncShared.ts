export const CLOUD_SYNC_DOMAINS = [
  "settings",
  "files-metadata",
  "files-images",
  "files-trash",
  "files-applets",
  "songs",
  "videos",
  "stickies",
  "calendar",
  "contacts",
  "custom-wallpapers",
] as const;

export type CloudSyncDomain = (typeof CLOUD_SYNC_DOMAINS)[number];
export type CloudSyncCategory =
  | "files"
  | "settings"
  | "songs"
  | "videos"
  | "stickies"
  | "calendar"
  | "contacts";

export const FILE_SYNC_DOMAINS = [
  "files-metadata",
  "files-images",
  "files-trash",
  "files-applets",
] as const;

export type FileCloudSyncDomain = (typeof FILE_SYNC_DOMAINS)[number];

export const REDIS_SYNC_DOMAINS = [
  "settings",
  "files-metadata",
  "songs",
  "videos",
  "stickies",
  "calendar",
  "contacts",
] as const;

export type RedisSyncDomain = (typeof REDIS_SYNC_DOMAINS)[number];

export const BLOB_SYNC_DOMAINS = [
  "files-images",
  "files-trash",
  "files-applets",
  "custom-wallpapers",
] as const;

export type BlobSyncDomain = (typeof BLOB_SYNC_DOMAINS)[number];

export function isRedisSyncDomain(domain: CloudSyncDomain): domain is RedisSyncDomain {
  return (REDIS_SYNC_DOMAINS as readonly string[]).includes(domain);
}

export function isBlobSyncDomain(domain: CloudSyncDomain): domain is BlobSyncDomain {
  return (BLOB_SYNC_DOMAINS as readonly string[]).includes(domain);
}

export interface CloudSyncDomainMetadata {
  updatedAt: string;
  version: number;
  totalSize: number;
  createdAt: string;
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
  lastAppliedRemoteAt?: string | null;
  lastUploadedAt?: string | null;
  lastLocalChangeAt?: string | null;
  hasPendingUpload?: boolean;
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
  if (isFileCloudSyncDomain(domain)) {
    return "files";
  }

  switch (domain) {
    case "settings":
    case "custom-wallpapers":
      return "settings";
    case "songs":
      return "songs";
    case "videos":
      return "videos";
    case "stickies":
      return "stickies";
    case "calendar":
      return "calendar";
    case "contacts":
      return "contacts";
  }
}

export function createEmptyCloudSyncMetadataMap(): CloudSyncMetadataMap {
  return {
    settings: null,
    "files-metadata": null,
    "files-images": null,
    "files-trash": null,
    "files-applets": null,
    songs: null,
    videos: null,
    stickies: null,
    calendar: null,
    contacts: null,
    "custom-wallpapers": null,
  };
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
  hasPendingUpload: boolean = false
): boolean {
  if (hasPendingUpload) {
    return true;
  }

  return (
    parseCloudSyncTimestamp(lastLocalChangeAt) >
    parseCloudSyncTimestamp(lastUploadedAt)
  );
}

export function shouldApplyRemoteUpdate({
  remoteUpdatedAt,
  lastAppliedRemoteAt,
  lastUploadedAt,
  lastLocalChangeAt,
  hasPendingUpload = false,
}: ShouldApplyRemoteUpdateParams): boolean {
  const remoteTime = parseCloudSyncTimestamp(remoteUpdatedAt);

  if (remoteTime === 0) {
    return false;
  }

  if (
    hasUnsyncedLocalChanges(lastLocalChangeAt, lastUploadedAt, hasPendingUpload)
  ) {
    return false;
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
