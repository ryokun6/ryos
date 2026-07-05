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

/** The mutually exclusive wallpaper parameters (exactly one may apply). */
export const WALLPAPER_PARAM_KEYS = [
  "wallpaper",
  "wallpaperShuffle",
  "wallpaperDynamic",
] as const satisfies readonly SettingsInputKey[];

export type WallpaperParamKey = (typeof WALLPAPER_PARAM_KEYS)[number];

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

/** Wallpaper parameter keys present on a (sanitized) settings input. */
export function getWallpaperParamKeys(
  params: Partial<SettingsInput>
): WallpaperParamKey[] {
  return WALLPAPER_PARAM_KEYS.filter((key) => params[key] !== undefined);
}

export interface WallpaperConflictResolution {
  /** Input with at most one wallpaper parameter remaining. */
  params: Partial<SettingsInput>;
  /**
   * When several non-echo wallpaper parameters were provided and intent could
   * not be determined: the conflicting keys (all stripped from `params`).
   */
  conflict: WallpaperParamKey[] | null;
}

/**
 * Resolve overfilled multi-wallpaper tool calls into at most one wallpaper
 * parameter. The schema documents the three wallpaper fields as mutually
 * exclusive, but models sometimes bundle all of them (typically the current
 * wallpaper plus examples copied from field descriptions).
 *
 * Resolution is deterministic and never guesses:
 * 1. Drop a `wallpaper` name query that resolves to the currently applied
 *    wallpaper (an echo). Shuffle/dynamic echoes are already dropped by
 *    `sanitizeSettingsInput`.
 * 2. If more than one wallpaper parameter still remains, strip them all and
 *    report the conflict. Callers should treat a conflict as a junk-filled
 *    bundle (observed in the wild: every field populated with placeholder
 *    defaults like `wallpaper: "string"`, `masterVolume: 0`) and apply
 *    nothing, asking the model to retry with only the requested settings.
 *
 * `resolveWallpaperPath` maps a wallpaper name query to its manifest path
 * (or null); it is optional so callers without the manifest degrade to
 * conflict reporting alone.
 */
export function resolveWallpaperConflict(
  params: Partial<SettingsInput>,
  snapshot: CurrentSettingsSnapshot,
  resolveWallpaperPath?: (query: string) => string | null
): WallpaperConflictResolution {
  let keys = getWallpaperParamKeys(params);
  if (keys.length <= 1) {
    return { params, conflict: null };
  }

  const resolved: Partial<SettingsInput> = { ...params };

  if (
    resolved.wallpaper !== undefined &&
    resolveWallpaperPath &&
    snapshot.currentWallpaper !== undefined &&
    resolveWallpaperPath(resolved.wallpaper) === snapshot.currentWallpaper
  ) {
    delete resolved.wallpaper;
    keys = getWallpaperParamKeys(resolved);
    if (keys.length <= 1) {
      return { params: resolved, conflict: null };
    }
  }

  for (const key of keys) {
    delete resolved[key];
  }
  return { params: resolved, conflict: keys };
}
