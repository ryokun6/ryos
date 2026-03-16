import { useCloudSyncStore } from "@/stores/useCloudSyncStore";
import {
  getPersistedLanguageInitializationState,
  setPersistedLanguageInitializationState,
} from "@/lib/languageConfig";
import type { CloudSyncDomain } from "@/utils/cloudSyncShared";
import {
  createEmptyCloudSyncPersistedMetadataState,
  normalizeCloudSyncPersistedMetadataState,
  normalizeSettingsSectionTimestampMap,
  SETTINGS_SYNC_SECTIONS,
  type CloudSyncPersistedMetadataState,
  type SettingsSectionTimestampMap,
  type SettingsSyncSection,
} from "@/utils/sync/engine/state/syncStateSchema";

const LEGACY_CLIENT_ID_STORAGE_KEY = "ryos:cloud-sync:client-id";
const LEGACY_CLIENT_VERSION_STORAGE_KEY = "ryos:cloud-sync:client-versions";
const LEGACY_SETTINGS_TIMESTAMP_STORAGE_KEY =
  "ryos:cloud-sync:settings-section-timestamps";
const LEGACY_LOCAL_CHANGE_STORAGE_KEY = "ryos:cloud-sync:last-local-change-at";

const activeRemoteApplySections = new Set<SettingsSyncSection>();

let hasHydratedLegacyState = false;

function readLocalStorageValue(key: string): string | null {
  if (typeof localStorage === "undefined") {
    return null;
  }

  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function removeLocalStorageValue(key: string): void {
  if (typeof localStorage === "undefined") {
    return;
  }

  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage cleanup failures.
  }
}

function readLegacyJsonValue(key: string): unknown {
  const raw = readLocalStorageValue(key);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readLegacyPersistedMetadata(): Partial<CloudSyncPersistedMetadataState> {
  const clientId = readLocalStorageValue(LEGACY_CLIENT_ID_STORAGE_KEY);
  const languageInitialized = getPersistedLanguageInitializationState();

  return normalizeCloudSyncPersistedMetadataState({
    clientId: clientId && clientId.length > 0 ? clientId : null,
    clientVersions: readLegacyJsonValue(LEGACY_CLIENT_VERSION_STORAGE_KEY),
    localChangeAt: readLegacyJsonValue(LEGACY_LOCAL_CHANGE_STORAGE_KEY),
    settingsSectionTimestamps: normalizeSettingsSectionTimestampMap(
      readLegacyJsonValue(LEGACY_SETTINGS_TIMESTAMP_STORAGE_KEY)
    ),
    languageInitialized,
  });
}

function clearLegacyCloudSyncSidecars(): void {
  removeLocalStorageValue(LEGACY_CLIENT_ID_STORAGE_KEY);
  removeLocalStorageValue(LEGACY_CLIENT_VERSION_STORAGE_KEY);
  removeLocalStorageValue(LEGACY_SETTINGS_TIMESTAMP_STORAGE_KEY);
  removeLocalStorageValue(LEGACY_LOCAL_CHANGE_STORAGE_KEY);
}

function mergePersistedMetadata(
  current: CloudSyncPersistedMetadataState,
  incoming: Partial<CloudSyncPersistedMetadataState>
): CloudSyncPersistedMetadataState {
  return {
    clientId: current.clientId || incoming.clientId || null,
    clientVersions: {
      ...(incoming.clientVersions || {}),
      ...current.clientVersions,
    },
    localChangeAt: {
      ...(incoming.localChangeAt || {}),
      ...current.localChangeAt,
    },
    settingsSectionTimestamps: {
      ...(incoming.settingsSectionTimestamps || {}),
      ...current.settingsSectionTimestamps,
    },
    languageInitialized:
      current.languageInitialized ?? incoming.languageInitialized ?? null,
    individualBlobKnownItems: {
      ...(incoming.individualBlobKnownItems ||
        createEmptyCloudSyncPersistedMetadataState().individualBlobKnownItems),
      ...current.individualBlobKnownItems,
    },
    logicalDirtyParts: {
      ...(incoming.logicalDirtyParts || {}),
      ...current.logicalDirtyParts,
    },
  };
}

function hydrateLegacyStateIfNeeded(): void {
  if (hasHydratedLegacyState) {
    return;
  }

  hasHydratedLegacyState = true;

  const legacyState = readLegacyPersistedMetadata();
  const hasLegacyData =
    Boolean(legacyState.clientId) ||
    Object.keys(legacyState.clientVersions || {}).length > 0 ||
    Object.keys(legacyState.localChangeAt || {}).length > 0 ||
    Object.keys(legacyState.settingsSectionTimestamps || {}).length > 0 ||
    legacyState.languageInitialized !== null;

  if (!hasLegacyData) {
    return;
  }

  const store = useCloudSyncStore.getState();
  const merged = mergePersistedMetadata(store.persistedMetadata, legacyState);
  store.updatePersistedMetadata(() => merged);
  clearLegacyCloudSyncSidecars();
}

function getPersistedMetadataState(): CloudSyncPersistedMetadataState {
  hydrateLegacyStateIfNeeded();
  return (
    useCloudSyncStore.getState().persistedMetadata ||
    createEmptyCloudSyncPersistedMetadataState()
  );
}

function updatePersistedMetadataState(
  updater: (
    current: CloudSyncPersistedMetadataState
  ) => CloudSyncPersistedMetadataState
): void {
  hydrateLegacyStateIfNeeded();
  useCloudSyncStore.getState().updatePersistedMetadata(updater);
}

function createClientId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export {
  normalizeSettingsSectionTimestampMap,
  SETTINGS_SYNC_SECTIONS,
  type SettingsSectionTimestampMap,
  type SettingsSyncSection,
};

export function getSyncClientId(): string {
  const state = getPersistedMetadataState();
  if (state.clientId) {
    return state.clientId;
  }

  const clientId = createClientId();
  updatePersistedMetadataState((current) => ({
    ...current,
    clientId,
  }));
  return clientId;
}

export function getNextSyncClientVersion(domain: CloudSyncDomain): number {
  const state = getPersistedMetadataState();
  const nextVersion = (state.clientVersions[domain] || 0) + 1;

  updatePersistedMetadataState((current) => ({
    ...current,
    clientVersions: {
      ...current.clientVersions,
      [domain]: nextVersion,
    },
  }));

  return nextVersion;
}

export function getPersistedLocalChangeAt(domain: CloudSyncDomain): string | null {
  return getPersistedMetadataState().localChangeAt[domain] || null;
}

export function setPersistedLocalChangeAt(
  domain: CloudSyncDomain,
  timestamp: string
): void {
  if (!timestamp) {
    return;
  }

  updatePersistedMetadataState((current) => ({
    ...current,
    localChangeAt: {
      ...current.localChangeAt,
      [domain]: timestamp,
    },
  }));
}

export function getSettingsSectionTimestampMap(): SettingsSectionTimestampMap {
  return {
    ...getPersistedMetadataState().settingsSectionTimestamps,
  };
}

export function markSettingsSectionChanged(
  section: SettingsSyncSection,
  changedAt: string = new Date().toISOString()
): void {
  updatePersistedMetadataState((current) => ({
    ...current,
    settingsSectionTimestamps: {
      ...current.settingsSectionTimestamps,
      [section]: changedAt,
    },
  }));
}

export function setSettingsSectionTimestamps(
  nextTimestamps: SettingsSectionTimestampMap
): void {
  updatePersistedMetadataState((current) => {
    const merged = {
      ...current.settingsSectionTimestamps,
    };

    for (const section of SETTINGS_SYNC_SECTIONS) {
      const nextTimestamp = nextTimestamps[section];
      if (typeof nextTimestamp === "string" && nextTimestamp.length > 0) {
        merged[section] = nextTimestamp;
      }
    }

    return {
      ...current,
      settingsSectionTimestamps: merged,
    };
  });
}

export function getLatestSettingsSectionTimestamp(): string | null {
  const timestamps = getPersistedMetadataState().settingsSectionTimestamps;
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

export function getCloudSyncLanguageInitialized(): boolean {
  const state = getPersistedMetadataState();
  if (typeof state.languageInitialized === "boolean") {
    return state.languageInitialized;
  }

  const persistedLanguageInitialized = getPersistedLanguageInitializationState();
  updatePersistedMetadataState((current) => ({
    ...current,
    languageInitialized: persistedLanguageInitialized,
  }));
  return persistedLanguageInitialized;
}

export function setCloudSyncLanguageInitialized(value: boolean): void {
  setPersistedLanguageInitializationState(value);
  updatePersistedMetadataState((current) => ({
    ...current,
    languageInitialized: value,
  }));
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
