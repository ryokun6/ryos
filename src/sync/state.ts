import {
  CLOUD_SYNC_DOMAINS,
  type CloudSyncDomain,
} from "@/utils/cloudSyncShared";

const CLIENT_ID_STORAGE_KEY = "ryos:cloud-sync:client-id";
const CLIENT_VERSION_STORAGE_KEY = "ryos:cloud-sync:client-versions";
const LOCAL_CHANGE_STORAGE_KEY = "ryos:cloud-sync:last-local-change-at";
const SETTINGS_TIMESTAMP_STORAGE_KEY =
  "ryos:cloud-sync:settings-section-timestamps";

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
export type SettingsSectionTimestampMap = Partial<
  Record<SettingsSyncSection, string>
>;

type LocalChangeTimestampMap = Partial<Record<CloudSyncDomain, string>>;

const activeRemoteApplySections = new Set<SettingsSyncSection>();
let inMemoryClientId: string | null = null;

function readJsonStorage<T>(
  key: string,
  fallback: T,
  parser?: (value: unknown) => T
): T {
  if (typeof localStorage === "undefined") {
    return fallback;
  }

  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }

    const parsed = JSON.parse(raw) as unknown;
    return parser ? parser(parsed) : (parsed as T);
  } catch {
    return fallback;
  }
}

function writeJsonStorage(key: string, value: unknown): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(key, JSON.stringify(value));
}

function createClientId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeClientVersions(
  value: unknown
): Partial<Record<CloudSyncDomain, number>> {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Partial<Record<CloudSyncDomain, unknown>>).filter(
      ([domain, version]) =>
        typeof domain === "string" &&
        typeof version === "number" &&
        Number.isFinite(version) &&
        Number.isInteger(version) &&
        version >= 0
    )
  ) as Partial<Record<CloudSyncDomain, number>>;
}

function readLocalChangeState(): LocalChangeTimestampMap {
  return readJsonStorage(LOCAL_CHANGE_STORAGE_KEY, {}, (value) => {
    if (!value || typeof value !== "object") {
      return {};
    }

    const parsed = value as Record<string, unknown>;
    return Object.fromEntries(
      CLOUD_SYNC_DOMAINS.reduce<[CloudSyncDomain, string][]>((acc, domain) => {
        const timestamp = parsed[domain];
        if (typeof timestamp === "string") {
          acc.push([domain, timestamp]);
        }
        return acc;
      }, [])
    );
  });
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

function readSettingsSectionTimestampMap(): SettingsSectionTimestampMap {
  return readJsonStorage(
    SETTINGS_TIMESTAMP_STORAGE_KEY,
    {},
    normalizeSettingsSectionTimestampMap
  );
}

export function getSyncClientId(): string {
  if (inMemoryClientId) {
    return inMemoryClientId;
  }

  if (typeof localStorage === "undefined") {
    inMemoryClientId = createClientId();
    return inMemoryClientId;
  }

  const persistedClientId = localStorage.getItem(CLIENT_ID_STORAGE_KEY);
  if (persistedClientId) {
    inMemoryClientId = persistedClientId;
    return inMemoryClientId;
  }

  inMemoryClientId = createClientId();
  localStorage.setItem(CLIENT_ID_STORAGE_KEY, inMemoryClientId);
  return inMemoryClientId;
}

export function getNextSyncClientVersion(domain: CloudSyncDomain): number {
  const versions = readJsonStorage(
    CLIENT_VERSION_STORAGE_KEY,
    {} as Partial<Record<CloudSyncDomain, number>>,
    normalizeClientVersions
  );
  const nextVersion = (versions[domain] || 0) + 1;
  versions[domain] = nextVersion;
  writeJsonStorage(CLIENT_VERSION_STORAGE_KEY, versions);
  return nextVersion;
}

export function getPersistedLocalChangeAt(domain: CloudSyncDomain): string | null {
  return readLocalChangeState()[domain] || null;
}

export function setPersistedLocalChangeAt(
  domain: CloudSyncDomain,
  timestamp: string
): void {
  if (!timestamp) {
    return;
  }

  const state = readLocalChangeState();
  state[domain] = timestamp;
  writeJsonStorage(LOCAL_CHANGE_STORAGE_KEY, state);
}

export function getSettingsSectionTimestampMap(): SettingsSectionTimestampMap {
  return readSettingsSectionTimestampMap();
}

export function markSettingsSectionChanged(
  section: SettingsSyncSection,
  changedAt: string = new Date().toISOString()
): void {
  const timestamps = readSettingsSectionTimestampMap();
  timestamps[section] = changedAt;
  writeJsonStorage(SETTINGS_TIMESTAMP_STORAGE_KEY, timestamps);
}

export function setSettingsSectionTimestamps(
  nextTimestamps: SettingsSectionTimestampMap
): void {
  const timestamps = readSettingsSectionTimestampMap();

  for (const section of SETTINGS_SYNC_SECTIONS) {
    const nextTimestamp = nextTimestamps[section];
    if (typeof nextTimestamp === "string" && nextTimestamp.length > 0) {
      timestamps[section] = nextTimestamp;
    }
  }

  writeJsonStorage(SETTINGS_TIMESTAMP_STORAGE_KEY, timestamps);
}

export function getLatestSettingsSectionTimestamp(): string | null {
  const timestamps = readSettingsSectionTimestampMap();
  let latest: string | null = null;
  let latestMs = 0;

  for (const timestamp of Object.values(timestamps)) {
    const parsed = new Date(timestamp).getTime();
    if (Number.isFinite(parsed) && parsed > latestMs) {
      latestMs = parsed;
      latest = timestamp;
    }
  }

  return latest;
}

export function beginApplyingRemoteSettingsSections(
  sections: Iterable<SettingsSyncSection>
): void {
  for (const section of sections) {
    activeRemoteApplySections.add(section);
  }
}

export function endApplyingRemoteSettingsSections(
  sections: Iterable<SettingsSyncSection>
): void {
  for (const section of sections) {
    activeRemoteApplySections.delete(section);
  }
}

export function isApplyingRemoteSettingsSection(
  section: SettingsSyncSection
): boolean {
  return activeRemoteApplySections.has(section);
}
