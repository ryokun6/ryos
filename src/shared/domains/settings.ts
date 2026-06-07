import type { LanguageCode } from "../../stores/useLanguageStore";
import type { AIModel } from "../../types/aiModels";
import type {
  DisplayMode,
  LyricsAlignment,
  LyricsFont,
  RomanizationSettings,
} from "../../types/lyrics";
import type { DockItem } from "../../stores/useDockStore";
import type { DashboardWidget } from "../../stores/useDashboardStore";
import {
  SETTINGS_SYNC_SECTIONS,
  type SettingsSectionTimestampMap,
} from "../../sync/state";

export interface SettingsSnapshotData {
  theme: string;
  themeDarkMode?: Record<string, "system" | "light" | "dark" | boolean>;
  themeAccent?: Record<string, string>;
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
