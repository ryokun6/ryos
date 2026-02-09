/**
 * Settings Tool Handler
 */

import { useAudioSettingsStore } from "@/stores/useAudioSettingsStore";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { useThemeStore } from "@/stores/useThemeStore";
import { themes } from "@/themes";
import type { OsThemeId } from "@/themes/types";
import { forceRefreshCache } from "@/utils/prefetch";
import type { ToolContext } from "./types";

export interface SettingsInput {
  language?: string;
  theme?: OsThemeId;
  masterVolume?: number;
  speechEnabled?: boolean;
  checkForUpdates?: boolean;
}

/**
 * Get display name for a language code using translations
 */
const getLanguageDisplayName = (
  langCode: string,
  t: (key: string) => string,
): string => {
  const langMap: Record<string, string> = {
    en: "apps.ipod.translationLanguages.english",
    "zh-TW": "apps.ipod.translationLanguages.chinese",
    ja: "apps.ipod.translationLanguages.japanese",
    ko: "apps.ipod.translationLanguages.korean",
    fr: "apps.ipod.translationLanguages.french",
    de: "apps.ipod.translationLanguages.german",
    es: "apps.ipod.translationLanguages.spanish",
    pt: "apps.ipod.translationLanguages.portuguese",
    it: "apps.ipod.translationLanguages.italian",
    ru: "apps.ipod.translationLanguages.russian",
  };
  const key = langMap[langCode];
  if (key) {
    const translated = t(key);
    // If translation doesn't exist, fall back to code
    return translated !== key ? translated : langCode;
  }
  return langCode;
};

/**
 * Handle settings tool call
 */
export const handleSettings = (
  input: SettingsInput,
  toolCallId: string,
  context: ToolContext
): void => {
  const t =
    context.translate ??
    ((key: string, _params?: Record<string, unknown>) => key);
  const { language, theme, masterVolume, speechEnabled, checkForUpdates } = input;

  const changes: string[] = [];
  const audioSettingsStore = useAudioSettingsStore.getState();
  const langStore = useLanguageStore.getState();
  const themeStore = useThemeStore.getState();

  // Language change
  if (language !== undefined) {
    langStore.setLanguage(
      language as "en" | "zh-TW" | "ja" | "ko" | "fr" | "de" | "es" | "pt" | "it" | "ru"
    );
    changes.push(
      t("apps.chats.toolCalls.settingsLanguageChanged", {
        language: getLanguageDisplayName(language, t),
      })
    );
    console.log(`[ToolCall] Language changed to: ${language}`);
  }

  // Theme change
  if (theme !== undefined) {
    if (themeStore.current !== theme) {
      themeStore.setTheme(theme);
      const themeName = themes[theme]?.name || theme;
      changes.push(
        t("apps.chats.toolCalls.settingsThemeChanged", {
          theme: themeName,
        })
      );
      console.log(`[ToolCall] Theme changed to: ${theme}`);
    }
  }

  // Master volume
  if (masterVolume !== undefined) {
    audioSettingsStore.setMasterVolume(masterVolume);
    const volumePercent = Math.round(masterVolume * 100);
    changes.push(
      t("apps.chats.toolCalls.settingsMasterVolumeSet", {
        volume: volumePercent,
      })
    );
    console.log(`[ToolCall] Master volume set to: ${masterVolume}`);
  }

  // Speech enabled
  if (speechEnabled !== undefined) {
    audioSettingsStore.setSpeechEnabled(speechEnabled);
    changes.push(
      speechEnabled
        ? t("apps.chats.toolCalls.settingsSpeechEnabled")
        : t("apps.chats.toolCalls.settingsSpeechDisabled")
    );
    console.log(`[ToolCall] Speech ${speechEnabled ? "enabled" : "disabled"}`);
  }

  // Check for updates
  if (checkForUpdates) {
    forceRefreshCache();
    changes.push(t("apps.chats.toolCalls.settingsCheckingForUpdates"));
    console.log("[ToolCall] Checking for updates...");
  }

  // Build result message
  if (changes.length > 0) {
    const resultMessage =
      changes.length === 1 ? changes[0] : changes.join(". ") + ".";
    context.addToolResult({
      tool: "settings",
      toolCallId,
      output: resultMessage,
    });
  } else {
    context.addToolResult({
      tool: "settings",
      toolCallId,
      output: t("apps.chats.toolCalls.settingsNoChanges"),
    });
  }
};
