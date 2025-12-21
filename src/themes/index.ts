import { system7 } from "./system7";
import { macosx } from "./macosx";
import { xp } from "./xp";
import { win98 } from "./win98";
import { OsTheme, OsThemeId, ThemeMetadata } from "./types";

export const themes: Record<OsThemeId, OsTheme> = {
  system7,
  macosx,
  xp,
  win98,
};

export function getTheme(id: OsThemeId): OsTheme {
  return themes[id];
}

/**
 * Get theme metadata for layout and conditional rendering decisions.
 * Centralizes theme-based checks like isWindows, hasDock, etc.
 */
export function getThemeMetadata(id: OsThemeId): ThemeMetadata {
  return themes[id].metadata;
}

/**
 * Check if a theme is Windows-style (XP, 98).
 * Replaces scattered `currentTheme === "xp" || currentTheme === "win98"` checks.
 */
export function isWindowsTheme(id: OsThemeId): boolean {
  return themes[id].metadata.isWindows;
}

/**
 * Check if a theme is macOS-style (macOS X, System 7).
 */
export function isMacTheme(id: OsThemeId): boolean {
  return themes[id].metadata.isMac;
}

export type { OsTheme, OsThemeId, ThemeMetadata } from "./types";
