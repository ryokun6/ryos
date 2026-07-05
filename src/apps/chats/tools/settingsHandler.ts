/**
 * Settings Tool Handler
 */

import { useAudioSettingsStore } from "@/stores/useAudioSettingsStore";
import {
  useLanguageStore,
  type LanguageCode,
} from "@/stores/useLanguageStore";
import { useThemeStore } from "@/stores/useThemeStore";
import { useDisplaySettingsStore } from "@/stores/useDisplaySettingsStore";
import { themes } from "@/themes";
import type { OsThemeId } from "@/themes/types";
import { getAccentChrome, isValidAccent, type AccentId } from "@/themes/accents";
import { loadWallpaperManifest } from "@/utils/wallpapers";
import {
  normalizeSearchText,
  computeMatchScore,
  deriveScoreThreshold,
} from "@/apps/chats/utils/fuzzySearch";
import i18n from "@/lib/i18n";
import { forceRefreshCache } from "@/utils/prefetch";
import type { ToolContext } from "./types";
import { chatToolsLog as log } from "../logging";

export interface SettingsInput {
  language?: string;
  theme?: OsThemeId;
  wallpaper?: string;
  accent?: string;
  masterVolume?: number;
  speechEnabled?: boolean;
  uiSoundsEnabled?: boolean;
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

/** Human-readable label for a manifest-relative wallpaper path. */
const wallpaperLabelFromPath = (relPath: string): string => {
  const fileName = relPath.split("/").pop() || relPath;
  return fileName.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
};

/**
 * Fuzzy-match a requested wallpaper name against the built-in manifest
 * (tiles, photos across all categories, and video wallpapers). Returns the
 * absolute wallpaper path to feed `setWallpaper`, or null when nothing
 * matches well enough.
 */
const resolveWallpaperPath = async (
  query: string
): Promise<{ path: string; label: string } | null> => {
  const manifest = await loadWallpaperManifest();
  const candidates: string[] = [
    ...(manifest.tiles || []),
    ...Object.values(manifest.photos || {}).flat(),
    ...(manifest.videos || []),
  ];

  const normalizedQuery = normalizeSearchText(query.trim());
  if (!normalizedQuery) return null;
  const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);

  let best: { relPath: string; score: number } | null = null;
  for (const relPath of candidates) {
    const label = wallpaperLabelFromPath(relPath);
    // Match against both the bare name and the categorized path
    // ("photos/nature/aurora") so category words like "nature" also hit.
    const fields = [label, relPath.replace(/\.[^.]+$/, "").replace(/[/_-]+/g, " ")];
    const score = fields.reduce(
      (bestScore, field) =>
        Math.max(
          bestScore,
          computeMatchScore(
            normalizeSearchText(field),
            normalizedQuery,
            queryTokens
          )
        ),
      0
    );
    if (!best || score > best.score) {
      best = { relPath, score };
    }
  }

  if (!best || best.score < deriveScoreThreshold(normalizedQuery.length)) {
    return null;
  }

  return {
    path: `/wallpapers/${best.relPath}`,
    label: wallpaperLabelFromPath(best.relPath),
  };
};

/**
 * Handle settings tool call
 */
export const handleSettings = async (
  input: SettingsInput,
  toolCallId: string,
  context: ToolContext
): Promise<void> => {
  const {
    language,
    theme,
    wallpaper,
    accent,
    masterVolume,
    speechEnabled,
    uiSoundsEnabled,
    checkForUpdates,
  } = input;

  const changes: string[] = [];
  const failures: string[] = [];
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

  // Wallpaper change (fuzzy-matched against built-in manifest)
  if (wallpaper !== undefined) {
    try {
      const match = await resolveWallpaperPath(wallpaper);
      if (match) {
        await useDisplaySettingsStore.getState().setWallpaper(match.path);
        changes.push(
          i18n.t("apps.chats.toolCalls.settingsWallpaperChanged", {
            name: match.label,
          })
        );
        log.debug("Wallpaper changed", { wallpaper: match.path });
      } else {
        failures.push(
          i18n.t("apps.chats.toolCalls.settingsWallpaperNotFound", {
            query: wallpaper,
          })
        );
      }
    } catch (error) {
      log.debug("Wallpaper change failed", { error });
      failures.push(
        i18n.t("apps.chats.toolCalls.settingsWallpaperNotFound", {
          query: wallpaper,
        })
      );
    }
  }

  // Accent color (Aqua / System 7 chromes only). Applied after any theme
  // change so "switch to macosx with a purple accent" works in one call.
  if (accent !== undefined) {
    const activeTheme = useThemeStore.getState().current;
    const chrome = getAccentChrome(activeTheme);
    if (chrome && isValidAccent(chrome, accent)) {
      useThemeStore.getState().setAccent(accent as AccentId, activeTheme);
      changes.push(
        i18n.t("apps.chats.toolCalls.settingsAccentChanged", {
          accent,
        })
      );
      log.debug("Accent changed", { accent, theme: activeTheme });
    } else {
      failures.push(
        i18n.t("apps.chats.toolCalls.settingsAccentNotSupported", {
          theme: themes[activeTheme]?.name || activeTheme,
        })
      );
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

  // UI sounds enabled
  if (uiSoundsEnabled !== undefined) {
    audioSettingsStore.setUiSoundsEnabled(uiSoundsEnabled);
    changes.push(
      uiSoundsEnabled
        ? i18n.t("apps.chats.toolCalls.settingsUiSoundsEnabled")
        : i18n.t("apps.chats.toolCalls.settingsUiSoundsDisabled")
    );
    log.debug("UI sounds setting changed", { uiSoundsEnabled });
  }

  // Check for updates
  if (checkForUpdates) {
    forceRefreshCache();
    changes.push(i18n.t("apps.chats.toolCalls.settingsCheckingForUpdates"));
    log.debug("Checking for updates");
  }

  // Build result message
  const parts = [...changes, ...failures];
  if (parts.length > 0) {
    const resultMessage = parts.length === 1 ? parts[0] : parts.join(". ") + ".";
    if (changes.length === 0) {
      context.addToolOutput({
        tool: "settings",
        toolCallId,
        state: "output-error",
        errorText: resultMessage,
      });
    } else {
      context.addToolOutput({
        tool: "settings",
        toolCallId,
        output: resultMessage,
      });
    }
  } else {
    context.addToolOutput({
      tool: "settings",
      toolCallId,
      output: i18n.t("apps.chats.toolCalls.settingsNoChanges"),
    });
  }
};
