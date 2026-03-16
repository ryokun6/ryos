import {
  CLOUD_SYNC_DOMAINS,
  type CloudSyncDomain,
} from "@/utils/cloudSyncShared";
import {
  getLogicalCloudSyncDomainPhysicalParts,
  LOGICAL_CLOUD_SYNC_DOMAINS,
  type LogicalCloudSyncDomain,
} from "@/utils/syncLogicalDomains";

export const SETTINGS_SYNC_SECTIONS = [
  "theme",
  "language",
  "display",
  "audio",
  "aiModel",
  "ipod",
  "dock",
  "dashboard",
] as const;

export type SettingsSyncSection = (typeof SETTINGS_SYNC_SECTIONS)[number];

export type SettingsSectionTimestampMap = Partial<Record<SettingsSyncSection, string>>;

export interface IndividualBlobKnownItem {
  signature: string;
  updatedAt: string;
}

export type IndividualBlobKnownItemMap = Record<string, IndividualBlobKnownItem>;

export interface IndividualBlobKnownState {
  "files-images": IndividualBlobKnownItemMap;
  "files-trash": IndividualBlobKnownItemMap;
  "files-applets": IndividualBlobKnownItemMap;
  "custom-wallpapers": IndividualBlobKnownItemMap;
}

export type LogicalDirtyState = Partial<
  Record<LogicalCloudSyncDomain, CloudSyncDomain[]>
>;

export interface CloudSyncPersistedMetadataState {
  clientId: string | null;
  clientVersions: Partial<Record<CloudSyncDomain, number>>;
  localChangeAt: Partial<Record<CloudSyncDomain, string>>;
  settingsSectionTimestamps: SettingsSectionTimestampMap;
  languageInitialized: boolean | null;
  individualBlobKnownItems: IndividualBlobKnownState;
  logicalDirtyParts: LogicalDirtyState;
}

export function createEmptyIndividualBlobKnownState(): IndividualBlobKnownState {
  return {
    "files-images": {},
    "files-trash": {},
    "files-applets": {},
    "custom-wallpapers": {},
  };
}

export function createEmptyCloudSyncPersistedMetadataState(): CloudSyncPersistedMetadataState {
  return {
    clientId: null,
    clientVersions: {},
    localChangeAt: {},
    settingsSectionTimestamps: {},
    languageInitialized: null,
    individualBlobKnownItems: createEmptyIndividualBlobKnownState(),
    logicalDirtyParts: {},
  };
}

export function normalizeSettingsSectionTimestampMap(
  value: unknown
): SettingsSectionTimestampMap {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      ([key, timestamp]) =>
        (SETTINGS_SYNC_SECTIONS as readonly string[]).includes(key) &&
        typeof timestamp === "string" &&
        timestamp.length > 0
    )
  ) as SettingsSectionTimestampMap;
}

function normalizeClientVersions(
  value: unknown
): Partial<Record<CloudSyncDomain, number>> {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      ([domain, version]) =>
        (CLOUD_SYNC_DOMAINS as readonly string[]).includes(domain) &&
        typeof version === "number" &&
        Number.isFinite(version) &&
        Number.isInteger(version) &&
        version >= 0
    )
  ) as Partial<Record<CloudSyncDomain, number>>;
}

function normalizeLocalChangeAt(
  value: unknown
): Partial<Record<CloudSyncDomain, string>> {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      ([domain, timestamp]) =>
        (CLOUD_SYNC_DOMAINS as readonly string[]).includes(domain) &&
        typeof timestamp === "string" &&
        timestamp.length > 0
    )
  ) as Partial<Record<CloudSyncDomain, string>>;
}

function normalizeKnownItemMap(value: unknown): IndividualBlobKnownItemMap {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      ([key, item]) =>
        typeof key === "string" &&
        key.length > 0 &&
        typeof item === "object" &&
        item !== null &&
        typeof (item as IndividualBlobKnownItem).signature === "string" &&
        typeof (item as IndividualBlobKnownItem).updatedAt === "string"
    )
  ) as IndividualBlobKnownItemMap;
}

export function normalizeIndividualBlobKnownState(
  value: unknown
): IndividualBlobKnownState {
  const candidate =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  return {
    "files-images": normalizeKnownItemMap(candidate["files-images"]),
    "files-trash": normalizeKnownItemMap(candidate["files-trash"]),
    "files-applets": normalizeKnownItemMap(candidate["files-applets"]),
    "custom-wallpapers": normalizeKnownItemMap(candidate["custom-wallpapers"]),
  };
}

export function normalizeLogicalDirtyState(value: unknown): LogicalDirtyState {
  if (!value || typeof value !== "object") {
    return {};
  }

  const normalized: LogicalDirtyState = {};

  for (const logicalDomain of LOGICAL_CLOUD_SYNC_DOMAINS) {
    const rawParts = (value as Record<string, unknown>)[logicalDomain];
    if (!Array.isArray(rawParts)) {
      continue;
    }

    const allowedParts = new Set(
      getLogicalCloudSyncDomainPhysicalParts(logicalDomain)
    );
    const uniqueParts = Array.from(
      new Set(
        rawParts.filter(
          (part): part is CloudSyncDomain =>
            typeof part === "string" && allowedParts.has(part as CloudSyncDomain)
        )
      )
    );

    if (uniqueParts.length > 0) {
      normalized[logicalDomain] = uniqueParts;
    }
  }

  return normalized;
}

export function normalizeCloudSyncPersistedMetadataState(
  value: unknown
): CloudSyncPersistedMetadataState {
  const candidate =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  return {
    clientId:
      typeof candidate.clientId === "string" && candidate.clientId.length > 0
        ? candidate.clientId
        : null,
    clientVersions: normalizeClientVersions(candidate.clientVersions),
    localChangeAt: normalizeLocalChangeAt(candidate.localChangeAt),
    settingsSectionTimestamps: normalizeSettingsSectionTimestampMap(
      candidate.settingsSectionTimestamps
    ),
    languageInitialized:
      typeof candidate.languageInitialized === "boolean"
        ? candidate.languageInitialized
        : null,
    individualBlobKnownItems: normalizeIndividualBlobKnownState(
      candidate.individualBlobKnownItems
    ),
    logicalDirtyParts: normalizeLogicalDirtyState(candidate.logicalDirtyParts),
  };
}
