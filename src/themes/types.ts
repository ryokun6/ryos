export type OsThemeId = "system7" | "macosx" | "xp" | "win98";

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
}

export interface OsTheme {
  id: OsThemeId;
  name: string;
  /** Theme metadata for layout and conditional rendering */
  metadata: ThemeMetadata;
  fonts: {
    ui: string;
    mono?: string;
  };
  colors: {
    windowBg: string;
    menubarBg: string;
    menubarBorder: string;
    windowBorder: string;
    windowBorderInactive?: string; // For macOS inactive window borders
    titleBar: {
      activeBg: string;
      inactiveBg: string;
      text: string;
      inactiveText: string;
      border?: string; // For macOS semi-transparent border
      borderInactive?: string; // For macOS inactive border
      borderBottom?: string; // For Yosemite style bottom border
      pattern?: string; // For System 7's dotted pattern
    };
    button: {
      face: string;
      highlight: string;
      shadow: string;
      activeFace?: string;
    };
    trafficLights?: {
      close: string;
      closeHover?: string;
      minimize: string;
      minimizeHover?: string;
      maximize: string;
      maximizeHover?: string;
    };
    selection: {
      bg: string;
      text: string;
    };
    text: {
      primary: string;
      secondary: string;
      disabled: string;
    };
  };
  metrics: {
    borderWidth: string;
    radius: string;
    titleBarHeight: string;
    titleBarRadius?: string; // For Yosemite style rounded corners
    windowShadow: string;
  };
  assets?: {
    closeButton?: string;
    maximizeButton?: string;
    minimizeButton?: string;
  };
  wallpaperDefaults?: {
    photo?: string;
    tile?: string;
  };
}
