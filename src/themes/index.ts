import { system7 } from "./system7";
import { macosx } from "./macosx";
import { xp } from "./xp";
import { win98 } from "./win98";
import { OsMacChrome, OsPlatform, OsTheme, OsThemeId, ThemeMetadata } from "./types";

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
 * Platform bucket for CSS and layout rules shared by multiple themes
 * (e.g. Windows XP + Windows 98).
 */
export function getOsPlatform(id: OsThemeId): OsPlatform {
  return themes[id].metadata.isWindows ? "windows" : "mac";
}

/**
 * Mac chrome variant for `data-os-mac-chrome` (null when not a Mac theme).
 */
export function getOsMacChrome(id: OsThemeId): OsMacChrome | null {
  if (id === "macosx") return "aqua";
  if (id === "system7") return "system7";
  return null;
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

export type {
  OsMacChrome,
  OsPlatform,
  OsTheme,
  OsThemeId,
  ThemeMetadata,
} from "./types";
