import {
  type CloudSyncDomain,
  type CloudSyncDomainMetadata,
  type CloudSyncMetadataMap,
  getLatestCloudSyncTimestamp,
  parseCloudSyncTimestamp,
} from "@/utils/cloudSyncShared";

export const LOGICAL_CLOUD_SYNC_DOMAINS = [
  "files",
  "settings",
  "songs",
  "videos",
  "tv",
  "stickies",
  "calendar",
  "contacts",
  "maps",
] as const;

export type LogicalCloudSyncDomain = (typeof LOGICAL_CLOUD_SYNC_DOMAINS)[number];

export const LOGICAL_TO_PHYSICAL_CLOUD_SYNC_DOMAINS: Record<
  LogicalCloudSyncDomain,
  CloudSyncDomain[]
> = {
  settings: ["settings"],
  files: [
    "files-images",
    "files-trash",
    "files-applets",
    "files-metadata",
    "custom-wallpapers",
  ],
  songs: ["songs"],
  videos: ["videos"],
  tv: ["tv"],
  stickies: ["stickies"],
  calendar: ["calendar"],
  contacts: ["contacts"],
  maps: ["maps"],
};

export interface LogicalCloudSyncDomainMetadata {
  updatedAt: string;
  createdAt: string;
  totalSize: number;
  parts: Partial<Record<CloudSyncDomain, CloudSyncDomainMetadata>>;
}

export type LogicalCloudSyncMetadataMap = Record<
  LogicalCloudSyncDomain,
  LogicalCloudSyncDomainMetadata | null
>;

export function isLogicalCloudSyncDomain(
  value: unknown
): value is LogicalCloudSyncDomain {
  return (
    typeof value === "string" &&
    (LOGICAL_CLOUD_SYNC_DOMAINS as readonly string[]).includes(value)
  );
}

export function createEmptyLogicalCloudSyncMetadataMap(): LogicalCloudSyncMetadataMap {
  return {
    files: null,
    settings: null,
    songs: null,
    videos: null,
    tv: null,
    stickies: null,
    calendar: null,
    contacts: null,
    maps: null,
  };
}

export function getLogicalCloudSyncDomainPhysicalParts(
  domain: LogicalCloudSyncDomain
): CloudSyncDomain[] {
  return LOGICAL_TO_PHYSICAL_CLOUD_SYNC_DOMAINS[domain];
}

export function isLogicalCloudSyncDomainEnabled(
  isPhysicalDomainEnabled: (domain: CloudSyncDomain) => boolean,
  domain: LogicalCloudSyncDomain
): boolean {
  return getLogicalCloudSyncDomainPhysicalParts(domain).some((partDomain) =>
    isPhysicalDomainEnabled(partDomain)
  );
}

export function getLogicalCloudSyncDomainForPhysical(
  domain: CloudSyncDomain
): LogicalCloudSyncDomain {
  for (const logicalDomain of LOGICAL_CLOUD_SYNC_DOMAINS) {
    if (LOGICAL_TO_PHYSICAL_CLOUD_SYNC_DOMAINS[logicalDomain].includes(domain)) {
      return logicalDomain;
    }
  }

  throw new Error(`No logical sync domain registered for ${domain}`);
}

export function aggregateLogicalCloudSyncMetadata(
  metadata: CloudSyncMetadataMap
): LogicalCloudSyncMetadataMap {
  const aggregated = createEmptyLogicalCloudSyncMetadataMap();

  for (const logicalDomain of LOGICAL_CLOUD_SYNC_DOMAINS) {
    const partMetadata = LOGICAL_TO_PHYSICAL_CLOUD_SYNC_DOMAINS[logicalDomain]
      .map((domain) => metadata[domain])
      .filter((entry): entry is CloudSyncDomainMetadata => Boolean(entry));

    if (partMetadata.length === 0) {
      aggregated[logicalDomain] = null;
      continue;
    }

    const latestUpdatedAt =
      getLatestCloudSyncTimestamp(partMetadata.map((entry) => entry.updatedAt)) ||
      partMetadata[0].updatedAt;
    const earliestCreatedAt = [...partMetadata]
      .sort(
        (left, right) =>
          parseCloudSyncTimestamp(left.createdAt) -
          parseCloudSyncTimestamp(right.createdAt)
      )[0]?.createdAt || partMetadata[0].createdAt;

    aggregated[logicalDomain] = {
      updatedAt: latestUpdatedAt,
      createdAt: earliestCreatedAt,
      totalSize: partMetadata.reduce((sum, entry) => sum + entry.totalSize, 0),
      parts: Object.fromEntries(
        LOGICAL_TO_PHYSICAL_CLOUD_SYNC_DOMAINS[logicalDomain]
          .map((domain) => [domain, metadata[domain]])
          .filter((entry): entry is [CloudSyncDomain, CloudSyncDomainMetadata] =>
            Boolean(entry[1])
          )
      ),
    };
  }

  return aggregated;
}

