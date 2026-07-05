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
import { DEFAULT_ACCENT, type AccentId } from "@/themes/accents";
import type { OsThemeId } from "@/themes/types";

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

/** Keys the settings tool accepts (mirrors the Zod schema). */
export const SETTINGS_INPUT_KEYS = [
  "language",
  "theme",
  "wallpaper",
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
  };
}

/**
 * Drop settings parameters that match the current snapshot (typical model
 * overfill) and no-op sentinels like `checkForUpdates: false`.
 *
 * Wallpaper queries are always kept when present — the input is a fuzzy search
 * string, not the persisted descriptor, so it cannot be compared reliably to
 * `currentWallpaper`.
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
