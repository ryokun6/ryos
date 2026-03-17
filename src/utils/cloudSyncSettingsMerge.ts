import type { LanguageCode } from "@/stores/useLanguageStore";
import type { AIModel } from "@/types/aiModels";
import type { DisplayMode, LyricsAlignment, LyricsFont, RomanizationSettings } from "@/types/lyrics";
import type { DockItem } from "@/stores/useDockStore";
import type { DashboardWidget } from "@/stores/useDashboardStore";
import {
  SETTINGS_SYNC_SECTIONS,
  type SettingsSectionTimestampMap,
  type SettingsSyncSection,
} from "@/sync/state";

export interface SettingsSnapshotData {
  theme: string;
  language: LanguageCode;
  languageInitialized: boolean;
  aiModel: AIModel | null;
  display: {
    displayMode: string;
    shaderEffectEnabled: boolean;
    selectedShaderType: string;
    currentWallpaper: string;
    screenSaverEnabled: boolean;
    screenSaverType: string;
    screenSaverIdleTime: number;
    debugMode: boolean;
    htmlPreviewSplit: boolean;
  };
  audio: {
    masterVolume: number;
    uiVolume: number;
    chatSynthVolume: number;
    speechVolume: number;
    ipodVolume: number;
    uiSoundsEnabled: boolean;
    terminalSoundsEnabled: boolean;
    typingSynthEnabled: boolean;
    speechEnabled: boolean;
    keepTalkingEnabled: boolean;
    ttsModel: "openai" | "elevenlabs" | null;
    ttsVoice: string | null;
    synthPreset: string;
  };
  ipod?: {
    displayMode: DisplayMode;
    showLyrics: boolean;
    lyricsAlignment: LyricsAlignment;
    lyricsFont: LyricsFont;
    romanization: RomanizationSettings;
    lyricsTranslationLanguage: string | null;
    theme: "classic" | "black" | "u2";
    lcdFilterOn: boolean;
  };
  dock?: {
    pinnedItems: DockItem[];
    scale: number;
    hiding: boolean;
    magnification: boolean;
  };
  dashboard?: {
    widgets: DashboardWidget[];
  };
  customWallpapers?: Array<{
    key: string;
    value: Record<string, unknown>;
  }>;
  sectionUpdatedAt?: SettingsSectionTimestampMap;
}

function parseTimestamp(value: string | null | undefined): number {
  const parsed = value ? new Date(value).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeSettingsSnapshotData(
  snapshot: SettingsSnapshotData,
  fallbackUpdatedAt: string | null | undefined
): SettingsSnapshotData {
  const normalizedSectionUpdatedAt = {
    ...snapshot.sectionUpdatedAt,
  };

  for (const section of SETTINGS_SYNC_SECTIONS) {
    if (
      typeof normalizedSectionUpdatedAt[section] !== "string" &&
      fallbackUpdatedAt
    ) {
      normalizedSectionUpdatedAt[section] = fallbackUpdatedAt;
    }
  }

  const normalizedIpod = snapshot.ipod
    ? {
        ...snapshot.ipod,
        lyricsTranslationLanguage:
          snapshot.ipod.lyricsTranslationLanguage ?? null,
      }
    : snapshot.ipod;

  return {
    ...snapshot,
    ipod: normalizedIpod,
    sectionUpdatedAt: normalizedSectionUpdatedAt,
  };
}

function shouldUseRemoteSection(
  section: SettingsSyncSection,
  localSectionUpdatedAt: SettingsSectionTimestampMap,
  remoteSectionUpdatedAt: SettingsSectionTimestampMap
): boolean {
  const remoteTs = parseTimestamp(remoteSectionUpdatedAt[section]);
  if (remoteTs === 0) return false;
  const localTs = parseTimestamp(localSectionUpdatedAt[section]);
  return remoteTs >= localTs;
}

export function mergeSettingsSnapshotData(
  localSnapshot: SettingsSnapshotData,
  remoteSnapshot: SettingsSnapshotData,
  localFallbackUpdatedAt?: string | null,
  remoteFallbackUpdatedAt?: string | null
): SettingsSnapshotData {
  const normalizedLocal = normalizeSettingsSnapshotData(
    localSnapshot,
    localFallbackUpdatedAt
  );
  const normalizedRemote = normalizeSettingsSnapshotData(
    remoteSnapshot,
    remoteFallbackUpdatedAt
  );
  const localSectionUpdatedAt = normalizedLocal.sectionUpdatedAt || {};
  const remoteSectionUpdatedAt = normalizedRemote.sectionUpdatedAt || {};

  const merged: SettingsSnapshotData = {
    ...normalizedLocal,
    sectionUpdatedAt: {
      ...localSectionUpdatedAt,
    },
  };

  if (
    shouldUseRemoteSection("theme", localSectionUpdatedAt, remoteSectionUpdatedAt) &&
    normalizedRemote.theme !== undefined
  ) {
    merged.theme = normalizedRemote.theme;
    merged.sectionUpdatedAt!.theme = remoteSectionUpdatedAt.theme;
  }

  if (
    shouldUseRemoteSection("language", localSectionUpdatedAt, remoteSectionUpdatedAt) &&
    normalizedRemote.language !== undefined
  ) {
    merged.language = normalizedRemote.language;
    merged.languageInitialized = normalizedRemote.languageInitialized;
    merged.sectionUpdatedAt!.language = remoteSectionUpdatedAt.language;
  }

  if (
    shouldUseRemoteSection("display", localSectionUpdatedAt, remoteSectionUpdatedAt) &&
    normalizedRemote.display !== undefined
  ) {
    merged.display = normalizedRemote.display;
    merged.sectionUpdatedAt!.display = remoteSectionUpdatedAt.display;
  }

  if (
    shouldUseRemoteSection("audio", localSectionUpdatedAt, remoteSectionUpdatedAt) &&
    normalizedRemote.audio !== undefined
  ) {
    merged.audio = normalizedRemote.audio;
    merged.sectionUpdatedAt!.audio = remoteSectionUpdatedAt.audio;
  }

  if (
    shouldUseRemoteSection("aiModel", localSectionUpdatedAt, remoteSectionUpdatedAt) &&
    normalizedRemote.aiModel !== undefined
  ) {
    merged.aiModel = normalizedRemote.aiModel;
    merged.sectionUpdatedAt!.aiModel = remoteSectionUpdatedAt.aiModel;
  }

  if (
    normalizedRemote.ipod &&
    shouldUseRemoteSection("ipod", localSectionUpdatedAt, remoteSectionUpdatedAt)
  ) {
    merged.ipod = normalizedRemote.ipod;
    merged.sectionUpdatedAt!.ipod = remoteSectionUpdatedAt.ipod;
  }

  if (
    normalizedRemote.dock &&
    shouldUseRemoteSection("dock", localSectionUpdatedAt, remoteSectionUpdatedAt)
  ) {
    merged.dock = normalizedRemote.dock;
    merged.sectionUpdatedAt!.dock = remoteSectionUpdatedAt.dock;
  }

  if (
    normalizedRemote.dashboard &&
    shouldUseRemoteSection("dashboard", localSectionUpdatedAt, remoteSectionUpdatedAt)
  ) {
    merged.dashboard = normalizedRemote.dashboard;
    merged.sectionUpdatedAt!.dashboard = remoteSectionUpdatedAt.dashboard;
  }

  return merged;
}

export function getRemoteSettingsSectionsToApply(
  localSectionUpdatedAt: SettingsSectionTimestampMap,
  remoteSectionUpdatedAt: SettingsSectionTimestampMap
): SettingsSyncSection[] {
  return SETTINGS_SYNC_SECTIONS.filter((section) =>
    shouldUseRemoteSection(section, localSectionUpdatedAt, remoteSectionUpdatedAt)
  );
}

function parseSectionTs(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getSectionPayloadForSettingsPatch(
  data: SettingsSnapshotData,
  section: SettingsSyncSection
): unknown {
  switch (section) {
    case "theme":
      return data.theme;
    case "language":
      return {
        language: data.language,
        languageInitialized: data.languageInitialized,
      };
    case "display":
      return data.display;
    case "audio":
      return data.audio;
    case "aiModel":
      return data.aiModel;
    case "ipod":
      return data.ipod ?? null;
    case "dock":
      return data.dock ?? null;
    case "dashboard":
      return data.dashboard ?? null;
    default:
      return null;
  }
}

function settingsSectionContentEqual(
  section: SettingsSyncSection,
  left: SettingsSnapshotData,
  right: SettingsSnapshotData
): boolean {
  return (
    JSON.stringify(getSectionPayloadForSettingsPatch(left, section)) ===
    JSON.stringify(getSectionPayloadForSettingsPatch(right, section))
  );
}

/** Sections local should push (newer timestamps or same-ts content drift). */
export function getSettingsSectionsToPatchUpload(
  localSnapshot: SettingsSnapshotData,
  remoteSnapshot: SettingsSnapshotData
): SettingsSyncSection[] {
  const L = normalizeSettingsSnapshotData(localSnapshot, null);
  const R = normalizeSettingsSnapshotData(remoteSnapshot, null);
  const localAt = L.sectionUpdatedAt || {};
  const remoteAt = R.sectionUpdatedAt || {};
  const out: SettingsSyncSection[] = [];

  for (const section of SETTINGS_SYNC_SECTIONS) {
    const lt = parseSectionTs(localAt[section]);
    const rt = parseSectionTs(remoteAt[section]);
    if (lt > rt) {
      out.push(section);
      continue;
    }
    if (lt >= rt && !settingsSectionContentEqual(section, L, R)) {
      out.push(section);
    }
  }

  return out;
}

export interface SettingsRedisPatchPayload {
  settingsPatch: true;
  baseUpdatedAt: string;
  sections: Partial<Record<SettingsSyncSection, unknown>>;
  sectionUpdatedAt: Partial<Record<SettingsSyncSection, string>>;
}

export function isSettingsRedisPatchPayload(
  value: unknown
): value is SettingsRedisPatchPayload {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    (value as SettingsRedisPatchPayload).settingsPatch === true &&
    typeof (value as SettingsRedisPatchPayload).baseUpdatedAt === "string"
  );
}

export function buildSettingsRedisPatch(
  localSnapshot: SettingsSnapshotData,
  sections: SettingsSyncSection[],
  baseUpdatedAt: string
): SettingsRedisPatchPayload | null {
  if (sections.length === 0) {
    return null;
  }
  const L = normalizeSettingsSnapshotData(localSnapshot, null);
  const localAt = L.sectionUpdatedAt || {};
  const patch: SettingsRedisPatchPayload = {
    settingsPatch: true,
    baseUpdatedAt,
    sections: {},
    sectionUpdatedAt: {},
  };

  for (const section of sections) {
    patch.sections[section] = getSectionPayloadForSettingsPatch(L, section);
    patch.sectionUpdatedAt[section] =
      localAt[section] || new Date().toISOString();
  }

  return patch;
}

export function applySettingsRedisPatch(
  remoteSnapshot: SettingsSnapshotData,
  patch: SettingsRedisPatchPayload
): SettingsSnapshotData {
  const R = normalizeSettingsSnapshotData(remoteSnapshot, null);
  const next: SettingsSnapshotData = {
    ...R,
    sectionUpdatedAt: { ...R.sectionUpdatedAt },
  };

  for (const section of SETTINGS_SYNC_SECTIONS) {
    if (!(section in (patch.sections || {}))) {
      continue;
    }
    const val = patch.sections[section];
    switch (section) {
      case "theme":
        next.theme = val as string;
        break;
      case "language": {
        const v = val as {
          language: LanguageCode;
          languageInitialized: boolean;
        };
        next.language = v.language;
        next.languageInitialized = v.languageInitialized;
        break;
      }
      case "display":
        next.display = {
          ...(val as SettingsSnapshotData["display"]),
        };
        break;
      case "audio":
        next.audio = { ...(val as SettingsSnapshotData["audio"]) };
        break;
      case "aiModel":
        next.aiModel = val as SettingsSnapshotData["aiModel"];
        break;
      case "ipod":
        next.ipod = val
          ? { ...(val as NonNullable<SettingsSnapshotData["ipod"]>) }
          : undefined;
        break;
      case "dock":
        next.dock = val
          ? { ...(val as NonNullable<SettingsSnapshotData["dock"]>) }
          : undefined;
        break;
      case "dashboard":
        next.dashboard = val
          ? { ...(val as NonNullable<SettingsSnapshotData["dashboard"]>) }
          : undefined;
        break;
    }
    const ts = patch.sectionUpdatedAt[section];
    if (ts) {
      next.sectionUpdatedAt![section] = ts;
    }
  }

  return next;
}

export function shouldRestoreLegacyCustomWallpapers(params: {
  legacyWallpaperCount: number;
  localWallpaperCount: number;
  hasDedicatedCustomWallpaperSync: boolean;
}): boolean {
  return (
    params.legacyWallpaperCount > 0 &&
    params.localWallpaperCount === 0 &&
    !params.hasDedicatedCustomWallpaperSync
  );
}
