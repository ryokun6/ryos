import { describe, expect, test } from "bun:test";
import {
  normalizeSettingsSnapshotData,
  type SettingsSnapshotData,
} from "../src/shared/domains/settings";

function settingsSnapshot(): SettingsSnapshotData {
  return {
    theme: "macosx",
    language: "en",
    languageInitialized: true,
    aiModel: null,
    display: {
      displayMode: "light",
      shaderEffectEnabled: false,
      selectedShaderType: "none",
      currentWallpaper: "/wallpapers/default.jpg",
      screenSaverEnabled: false,
      screenSaverType: "flurry",
      screenSaverIdleTime: 5,
      debugMode: false,
      htmlPreviewSplit: false,
    },
    audio: {
      masterVolume: 1,
      uiVolume: 1,
      chatSynthVolume: 1,
      speechVolume: 1,
      ipodVolume: 1,
      uiSoundsEnabled: true,
      terminalSoundsEnabled: true,
      typingSynthEnabled: true,
      speechEnabled: true,
      keepTalkingEnabled: false,
      ttsModel: null,
      ttsVoice: null,
      synthPreset: "default",
    },
  };
}

describe("normalizeSettingsSnapshotData", () => {
  test("backfills missing section timestamps from fallback", () => {
    const normalized = normalizeSettingsSnapshotData(
      settingsSnapshot(),
      "2026-06-07T21:00:00.000Z"
    );

    expect(normalized.sectionUpdatedAt?.theme).toBe(
      "2026-06-07T21:00:00.000Z"
    );
    expect(normalized.sectionUpdatedAt?.dashboard).toBe(
      "2026-06-07T21:00:00.000Z"
    );
  });

  test("normalizes undefined lyrics translation language to null", () => {
    const snapshot = settingsSnapshot();
    snapshot.ipod = {
      displayMode: "cover",
      showLyrics: true,
      lyricsAlignment: "center",
      lyricsFont: "sans-serif",
      romanization: {
        enabled: true,
        japaneseFurigana: true,
        japaneseRomaji: false,
        korean: true,
        chinese: true,
        soramimi: false,
        soramamiTargetLanguage: "en",
      },
      lyricsTranslationLanguage: undefined as unknown as string | null,
      theme: "classic",
      lcdFilterOn: true,
    };

    expect(normalizeSettingsSnapshotData(snapshot, null).ipod?.lyricsTranslationLanguage).toBeNull();
  });
});
