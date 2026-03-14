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

const STORAGE_KEY = "ryos:cloud-sync:settings-section-timestamps";

const activeRemoteApplySections = new Set<SettingsSyncSection>();

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
  if (typeof localStorage === "undefined") {
    return {};
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }

    return normalizeSettingsSectionTimestampMap(JSON.parse(raw));
  } catch {
    return {};
  }
}

function writeSettingsSectionTimestampMap(map: SettingsSectionTimestampMap): void {
  if (typeof localStorage === "undefined") {
    return;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
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
  writeSettingsSectionTimestampMap(timestamps);
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

  writeSettingsSectionTimestampMap(timestamps);
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
