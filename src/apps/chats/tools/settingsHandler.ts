/**
 * Settings Tool Handler
 *
 * Partial updates: the model should only send fields the user asked to change.
 * Raw tool input is sanitized in `sanitizeSettingsInput` before any store
 * mutation so echoed current values (language, theme, volume, etc.) are not
 * re-applied, and overfilled multi-wallpaper calls are reduced to at most one
 * wallpaper parameter via `resolveWallpaperConflict`. See
 * `sanitizeSettingsInput.ts` for the guardrail rules.
 */

import { useAudioSettingsStore } from "@/stores/useAudioSettingsStore";
import {
  useLanguageStore,
  type LanguageCode,
} from "@/stores/useLanguageStore";
import { useThemeStore } from "@/stores/useThemeStore";
import { useDisplaySettingsStore } from "@/stores/useDisplaySettingsStore";
import { themes } from "@/themes";
import { getAccentChrome, isValidAccent, type AccentId } from "@/themes/accents";
import { loadWallpaperManifest } from "@/utils/wallpapers";
import {
  DYNAMIC_WALLPAPER_DESCRIPTORS,
  buildShuffleDescriptor,
} from "@/utils/dynamicWallpaper";
import type {
  DynamicWallpaperToolId,
  WallpaperShuffleCategory,
} from "@/shared/tools/wallpaper";
import { resolveWallpaperFromManifest } from "./wallpaperResolution";
import i18n from "@/lib/i18n";
import { forceRefreshCache } from "@/utils/prefetch";
import type { ToolContext } from "./types";
import { chatToolsLog as log } from "../logging";
import {
  readCurrentSettingsSnapshot,
  resolveWallpaperConflict,
  sanitizeSettingsInput,
  type SettingsInput,
} from "./sanitizeSettingsInput";

export type { SettingsInput };

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

/** Localized display name for a dynamic wallpaper id. */
const getDynamicWallpaperDisplayName = (id: DynamicWallpaperToolId): string => {
  const keyMap: Record<DynamicWallpaperToolId, string> = {
    "day-night": "apps.control-panels.dynamicWallpapers.dayNight",
    weather: "apps.control-panels.dynamicWallpapers.weather",
    cover: "apps.control-panels.dynamicWallpapers.nowPlaying",
    lyrics: "apps.control-panels.dynamicWallpapers.lyrics",
  };
  const translated = i18n.t(keyMap[id]);
  return translated !== keyMap[id] ? translated : id;
};

/** Localized display name for a shuffle category (mirrors WallpaperPicker). */
const getShuffleCategoryDisplayName = (
  category: WallpaperShuffleCategory
): string => {
  const key =
    category === "tiles"
      ? "apps.control-panels.patterns"
      : category === "videos"
        ? "common.menu.videos"
        : `apps.control-panels.wallpaperCategories.${category}`;
  const translated = i18n.t(key);
  if (translated !== key) return translated;
  return category
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

/**
 * Handle settings tool call
 */
export const handleSettings = async (
  input: SettingsInput,
  toolCallId: string,
  context: ToolContext
): Promise<void> => {
  const snapshot = readCurrentSettingsSnapshot();
  const sanitized = sanitizeSettingsInput(input, snapshot);

  // Overfilled calls sometimes bundle several wallpaper fields; resolve them
  // to at most one (dropping echoes of the current wallpaper) instead of
  // failing the whole call or applying an arbitrary wallpaper.
  let resolveWallpaperPath: ((query: string) => string | null) | undefined;
  if (sanitized.wallpaper !== undefined) {
    try {
      const manifest = await loadWallpaperManifest();
      resolveWallpaperPath = (query) =>
        resolveWallpaperFromManifest(manifest, query).match?.path ?? null;
    } catch (error) {
      log.debug("Wallpaper manifest load failed", { error });
    }
  }
  const {
    params: {
      language,
      theme,
      wallpaper,
      wallpaperShuffle,
      wallpaperDynamic,
      accent,
      masterVolume,
      speechEnabled,
      uiSoundsEnabled,
      checkForUpdates,
    },
    conflict: wallpaperConflict,
  } = resolveWallpaperConflict(sanitized, snapshot, resolveWallpaperPath);

  // Several non-echo wallpaper fields means the call violated the
  // one-wallpaper-field contract — a junk-filled bundle whose remaining
  // fields (e.g. masterVolume: 0) cannot be trusted either. Apply nothing
  // and ask the model to retry with only the requested settings.
  if (wallpaperConflict) {
    log.debug("Conflicting wallpaper parameters; applying nothing", {
      fields: wallpaperConflict,
    });
    context.addToolOutput({
      tool: "settings",
      toolCallId,
      state: "output-error",
      errorText: i18n.t("apps.chats.toolCalls.settingsWallpaperConflict", {
        fields: wallpaperConflict.join(", "),
      }),
    });
    return;
  }

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

  // Dynamic wallpaper (fixed descriptor — no matching involved)
  if (wallpaperDynamic !== undefined) {
    await useDisplaySettingsStore
      .getState()
      .setWallpaper(DYNAMIC_WALLPAPER_DESCRIPTORS[wallpaperDynamic]);
    changes.push(
      i18n.t("apps.chats.toolCalls.settingsWallpaperChanged", {
        name: getDynamicWallpaperDisplayName(wallpaperDynamic),
      })
    );
    log.debug("Dynamic wallpaper set", { wallpaperDynamic });
  }

  // Shuffle wallpaper category (fixed descriptor — no matching involved)
  if (wallpaperShuffle !== undefined) {
    await useDisplaySettingsStore
      .getState()
      .setWallpaper(buildShuffleDescriptor(wallpaperShuffle));
    changes.push(
      i18n.t("apps.chats.toolCalls.settingsWallpaperShuffleChanged", {
        category: getShuffleCategoryDisplayName(wallpaperShuffle),
      })
    );
    log.debug("Shuffle wallpaper set", { wallpaperShuffle });
  }

  // Specific wallpaper by exact name (deterministic manifest resolution)
  if (wallpaper !== undefined) {
    try {
      const resolution = resolveWallpaperFromManifest(
        await loadWallpaperManifest(),
        wallpaper
      );
      if (resolution.match) {
        await useDisplaySettingsStore
          .getState()
          .setWallpaper(resolution.match.path);
        changes.push(
          i18n.t("apps.chats.toolCalls.settingsWallpaperChanged", {
            name: resolution.match.label,
          })
        );
        log.debug("Wallpaper changed", { wallpaper: resolution.match.path });
      } else if (resolution.suggestions.length > 0) {
        failures.push(
          i18n.t("apps.chats.toolCalls.settingsWallpaperSuggestions", {
            query: wallpaper,
            suggestions: resolution.suggestions.join(", "),
          })
        );
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
