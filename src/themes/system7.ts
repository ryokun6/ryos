import { OsTheme } from "./types";

export const system7: OsTheme = {
  id: "system7",
  name: "System 7",
  metadata: {
    isWindows: false,
    isMac: true,
    hasDock: false,
    hasTaskbar: false,
    hasMenuBar: true,
    titleBarControlsPosition: "left",
    menuBarHeight: 30,
    taskbarHeight: 0,
    baseDockHeight: 0,
  },
  fonts: {
    ui: "Geneva, Chicago, -apple-system, BlinkMacSystemFont, sans-serif",
    mono: "Monaco, monospace",
  },
  colors: {
    windowBg: "#FFFFFF",
    menubarBg: "#FFFFFF",
    menubarBorder: "#000000",
    windowBorder: "#000000",
    titleBar: {
      activeBg: "#FFFFFF",
      inactiveBg: "#FFFFFF",
      text: "#000000",
      inactiveText: "#666666",
      pattern: "linear-gradient(#000 50%, transparent 0)",
    },
    button: {
      face: "#FFFFFF",
      highlight: "#FFFFFF",
      shadow: "#808080",
      activeFace: "#CCCCCC",
    },
    selection: {
      bg: "#000000",
      text: "#FFFFFF",
    },
    text: {
      primary: "#000000",
      secondary: "#666666",
      disabled: "#999999",
    },
  },
  metrics: {
    borderWidth: "2px",
    radius: "0.5rem", // This is 8px - the classic Mac rounded rect
    titleBarHeight: "1.5rem",
    windowShadow: "2px 2px 0px 0px rgba(0,0,0,0.5)",
  },
  wallpaperDefaults: {
    tile: "/wallpapers/tiles/Property 1=1.svg",
  },
};
