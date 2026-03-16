import type { LanguageCode } from "@/stores/useLanguageStore";
import type { AIModel } from "@/types/aiModels";
import type { DisplayMode, LyricsAlignment, LyricsFont, RomanizationSettings } from "@/types/lyrics";
import type { DockItem } from "@/stores/useDockStore";
import type { DashboardWidget } from "@/stores/useDashboardStore";
import {
  SETTINGS_SYNC_SECTIONS,
  type SettingsSectionTimestampMap,
  type SettingsSyncSection,
} from "@/utils/sync/engine/state/syncStateAdapter";

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
  return (
    parseTimestamp(remoteSectionUpdatedAt[section]) >
    parseTimestamp(localSectionUpdatedAt[section])
  );
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
