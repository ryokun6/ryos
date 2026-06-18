export type OsThemeId = "system7" | "macosx" | "xp" | "win98";

export type AquaMaterial = "classic" | "glass";

/** OS family for shared chrome rules (`data-os-platform` on `<html>`). */
export type OsPlatform = "mac" | "windows";

/** Mac subset for Aqua vs System 7 (`data-os-mac-chrome` on `<html>`); unset on Windows themes. */
export type OsMacChrome = "aqua" | "system7";

/** Color-scheme variant (`data-os-color-scheme` on `<html>`); attribute is omitted in light mode. */
export type OsColorScheme = "light" | "dark";

/**
 * Theme metadata for conditional rendering and layout decisions.
 * Centralizes theme-based checks that were previously scattered throughout the codebase.
 */
export interface ThemeMetadata {
  /** Whether this is a Windows-style theme (XP, 98) */
  isWindows: boolean;
  /** Whether this is a macOS-style theme (macOS X, System 7) */
  isMac: boolean;
  /** Whether the theme has a dock (bottom app launcher) */
  hasDock: boolean;
  /** Whether the theme has a taskbar (Windows-style bottom bar) */
  hasTaskbar: boolean;
  /** Whether the theme has a top menu bar */
  hasMenuBar: boolean;
  /** Whether title bar controls are on the left (macOS) or right (Windows) */
  titleBarControlsPosition: "left" | "right";
  /** Default menu bar height in pixels */
  menuBarHeight: number;
  /** Taskbar height in pixels (0 if no taskbar) */
  taskbarHeight: number;
  /** Base dock height before scaling (0 if no dock) */
  baseDockHeight: number;
  /** Whether this theme has dark-mode tokens defined in `themes.css`. */
  supportsDarkMode: boolean;
}

export interface OsTheme {
  id: OsThemeId;
  name: string;
  /** Theme metadata for layout and conditional rendering */
  metadata: ThemeMetadata;
  /** Runtime visual tokens live in `src/styles/themes/tokens.css`. */
  wallpaperDefaults?: {
    photo?: string;
    tile?: string;
  };
}
