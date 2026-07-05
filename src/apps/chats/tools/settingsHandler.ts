/**
 * Settings Tool Handler
 */

import { useAudioSettingsStore } from "@/stores/useAudioSettingsStore";
import {
  useLanguageStore,
  type LanguageCode,
} from "@/stores/useLanguageStore";
import { useThemeStore } from "@/stores/useThemeStore";
import { themes } from "@/themes";
import type { OsThemeId } from "@/themes/types";
import i18n from "@/lib/i18n";
import { forceRefreshCache } from "@/utils/prefetch";
import type { ToolContext } from "./types";
import { chatToolsLog as log } from "../logging";

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
const getLanguageDisplayName = (langCode: string): string => {
  const langMap: Record<string, string> = {
    en: "apps.ipod.translationLanguages.english",
    "zh-CN": "settings.language.chineseSimplified",
    "zh-TW": "settings.language.chineseTraditional",
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
    const translated = i18n.t(key);
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
  const { language, theme, masterVolume, speechEnabled, checkForUpdates } = input;

  const changes: string[] = [];
  const audioSettingsStore = useAudioSettingsStore.getState();
  const langStore = useLanguageStore.getState();
  const themeStore = useThemeStore.getState();

  // Language change
  if (language !== undefined) {
    langStore.setLanguage(language as LanguageCode);
    changes.push(
      i18n.t("apps.chats.toolCalls.settingsLanguageChanged", {
        language: getLanguageDisplayName(language),
      })
    );
    log.debug("Language changed", { language });
  }

  // Theme change
  if (theme !== undefined) {
    if (themeStore.current !== theme) {
      themeStore.setTheme(theme);
      const themeName = themes[theme]?.name || theme;
      changes.push(
        i18n.t("apps.chats.toolCalls.settingsThemeChanged", {
          theme: themeName,
        })
      );
      log.debug("Theme changed", { theme });
    }
  }

  // Master volume
  if (masterVolume !== undefined) {
    audioSettingsStore.setMasterVolume(masterVolume);
    const volumePercent = Math.round(masterVolume * 100);
    changes.push(
      i18n.t("apps.chats.toolCalls.settingsMasterVolumeSet", {
        volume: volumePercent,
      })
    );
    log.debug("Master volume set", { masterVolume });
  }

  // Speech enabled
  if (speechEnabled !== undefined) {
    audioSettingsStore.setSpeechEnabled(speechEnabled);
    changes.push(
      speechEnabled
        ? i18n.t("apps.chats.toolCalls.settingsSpeechEnabled")
        : i18n.t("apps.chats.toolCalls.settingsSpeechDisabled")
    );
    log.debug("Speech setting changed", { speechEnabled });
  }

  // Check for updates
  if (checkForUpdates) {
    forceRefreshCache();
    changes.push(i18n.t("apps.chats.toolCalls.settingsCheckingForUpdates"));
    log.debug("Checking for updates");
  }

  // Build result message
  if (changes.length > 0) {
    const resultMessage =
      changes.length === 1 ? changes[0] : changes.join(". ") + ".";
    context.addToolOutput({
      tool: "settings",
      toolCallId,
      output: resultMessage,
    });
  } else {
    context.addToolOutput({
      tool: "settings",
      toolCallId,
      output: i18n.t("apps.chats.toolCalls.settingsNoChanges"),
    });
  }
};
