export type OsThemeId = "system7" | "macosx" | "xp" | "win98";

export interface OsTheme {
  id: OsThemeId;
  name: string;
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
