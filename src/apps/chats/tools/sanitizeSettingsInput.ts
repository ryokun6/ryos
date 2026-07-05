/**
 * Settings tool partial-update guardrails.
 *
 * Tool clients (and the model) often populate every optional settings field with
 * the user's *current* values even when the user asked to change one thing.
 * Re-applying those values can still trigger store writes, analytics, and side
 * effects. Before executing a settings call we keep only parameters that differ
 * from the live snapshot — plus `checkForUpdates: true`, which is an action
 * rather than a persisted preference.
 *
 * Callers should pass the raw tool input through `sanitizeSettingsInput` and
 * apply only the returned subset.
 */

import { useAudioSettingsStore } from "@/stores/useAudioSettingsStore";
import { useLanguageStore, type LanguageCode } from "@/stores/useLanguageStore";
import { useThemeStore } from "@/stores/useThemeStore";
import { useDisplaySettingsStore } from "@/stores/useDisplaySettingsStore";
import {
  DYNAMIC_WALLPAPER_DESCRIPTORS,
  buildShuffleDescriptor,
} from "@/utils/dynamicWallpaper";
import { DEFAULT_ACCENT, type AccentId } from "@/themes/accents";
import type { OsThemeId } from "@/themes/types";
import type {
  DynamicWallpaperToolId,
  WallpaperShuffleCategory,
} from "@/shared/tools/wallpaper";

export interface SettingsInput {
  language?: string;
  theme?: OsThemeId;
  wallpaper?: string;
  wallpaperShuffle?: WallpaperShuffleCategory;
  wallpaperDynamic?: DynamicWallpaperToolId;
  accent?: string;
  masterVolume?: number;
  speechEnabled?: boolean;
  uiSoundsEnabled?: boolean;
  checkForUpdates?: boolean;
}

/** Keys the settings tool accepts (mirrors the Zod schema). */
export const SETTINGS_INPUT_KEYS = [
  "language",
  "theme",
  "wallpaper",
  "wallpaperShuffle",
  "wallpaperDynamic",
  "accent",
  "masterVolume",
  "speechEnabled",
  "uiSoundsEnabled",
  "checkForUpdates",
] as const satisfies readonly (keyof SettingsInput)[];

export type SettingsInputKey = (typeof SETTINGS_INPUT_KEYS)[number];

/** Live persisted settings used to detect no-op / overfilled parameters. */
export interface CurrentSettingsSnapshot {
  language: LanguageCode;
  theme: OsThemeId;
  accent: AccentId;
  masterVolume: number;
  speechEnabled: boolean;
  uiSoundsEnabled: boolean;
  /**
   * Persisted wallpaper selection (concrete path or `dynamic://`/`shuffle://`
   * descriptor). Optional so callers/tests that only care about other
   * settings can omit it; when absent, wallpaper params are always kept.
   */
  currentWallpaper?: string;
}

export function readCurrentSettingsSnapshot(): CurrentSettingsSnapshot {
  const langStore = useLanguageStore.getState();
  const themeStore = useThemeStore.getState();
  const audioStore = useAudioSettingsStore.getState();
  const theme = themeStore.current;

  return {
    language: langStore.current,
    theme,
    accent: themeStore.accentByTheme[theme] ?? DEFAULT_ACCENT,
    masterVolume: audioStore.masterVolume,
    speechEnabled: audioStore.speechEnabled,
    uiSoundsEnabled: audioStore.uiSoundsEnabled,
    currentWallpaper: useDisplaySettingsStore.getState().currentWallpaper,
  };
}

/**
 * Drop settings parameters that match the current snapshot (typical model
 * overfill) and no-op sentinels like `checkForUpdates: false`.
 *
 * Wallpaper name queries are always kept when present — the input is a name,
 * not the persisted descriptor, so it cannot be compared reliably to
 * `currentWallpaper`. Shuffle/dynamic wallpaper params map to exact stored
 * descriptors and are dropped when they match the current selection. Theme is
 * kept whenever it differs from the live snapshot
 * (system state + prompt guidance reduce bogus default-theme overfill).
 */
export function sanitizeSettingsInput(
  input: SettingsInput,
  snapshot: CurrentSettingsSnapshot = readCurrentSettingsSnapshot()
): Partial<SettingsInput> {
  const sanitized: Partial<SettingsInput> = {};

  if (input.language !== undefined && input.language !== snapshot.language) {
    sanitized.language = input.language;
  }

  if (input.theme !== undefined && input.theme !== snapshot.theme) {
    sanitized.theme = input.theme;
  }

  if (input.wallpaper !== undefined) {
    const query = input.wallpaper.trim();
    if (query.length > 0) {
      sanitized.wallpaper = query;
    }
  }

  // Shuffle/dynamic selections map to exact stored descriptors, so echoed
  // current values *can* be detected and dropped (unlike name queries).
  if (input.wallpaperShuffle !== undefined) {
    const descriptor = buildShuffleDescriptor(input.wallpaperShuffle);
    if (descriptor !== snapshot.currentWallpaper) {
      sanitized.wallpaperShuffle = input.wallpaperShuffle;
    }
  }

  if (input.wallpaperDynamic !== undefined) {
    const descriptor = DYNAMIC_WALLPAPER_DESCRIPTORS[input.wallpaperDynamic];
    if (descriptor !== undefined && descriptor !== snapshot.currentWallpaper) {
      sanitized.wallpaperDynamic = input.wallpaperDynamic;
    }
  }

  if (input.accent !== undefined && input.accent !== snapshot.accent) {
    sanitized.accent = input.accent;
  }

  if (
    input.masterVolume !== undefined &&
    input.masterVolume !== snapshot.masterVolume
  ) {
    sanitized.masterVolume = input.masterVolume;
  }

  if (
    input.speechEnabled !== undefined &&
    input.speechEnabled !== snapshot.speechEnabled
  ) {
    sanitized.speechEnabled = input.speechEnabled;
  }

  if (
    input.uiSoundsEnabled !== undefined &&
    input.uiSoundsEnabled !== snapshot.uiSoundsEnabled
  ) {
    sanitized.uiSoundsEnabled = input.uiSoundsEnabled;
  }

  if (input.checkForUpdates === true) {
    sanitized.checkForUpdates = true;
  }

  return sanitized;
}
