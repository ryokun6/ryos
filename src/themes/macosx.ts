import { OsTheme } from "./types";

export const macosx: OsTheme = {
  id: "macosx",
  name: "Aqua",
  metadata: {
    isWindows: false,
    isMac: true,
    hasDock: true,
    hasTaskbar: false,
    hasMenuBar: true,
    titleBarControlsPosition: "left",
    menuBarHeight: 25,
    taskbarHeight: 0,
    baseDockHeight: 56,
  },
  fonts: {
    ui: "LucidaGrande, 'Lucida Grande', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    mono: "Monaco, Menlo, monospace",
  },
  colors: {
    windowBg: "#ECECEC",
    menubarBg: "linear-gradient(to bottom, #FAFAFA, #D1D1D1)",
    menubarBorder: "#8E8E8E",
    windowBorder: "rgba(0, 0, 0, 0.3)",
    windowBorderInactive: "rgba(0, 0, 0, 0.2)",
    titleBar: {
      activeBg: "linear-gradient(to bottom, #f6f6f6 0%, #dadada 100%)",
      inactiveBg: "#f6f6f6",
      text: "#000000",
      inactiveText: "#7F7F7F",
      border: "rgba(0, 0, 0, 0.2)",
      borderInactive: "rgba(0, 0, 0, 0.1)",
      borderBottom: "rgba(0, 0, 0, 0.35)",
    },
    button: {
      face: "#FFFFFF",
      highlight: "#FFFFFF",
      shadow: "#999999",
      activeFace: "#E0E0E0",
    },
    trafficLights: {
      close: "#FF6057",
      closeHover: "#E14640",
      minimize: "#FFBD2E",
      minimizeHover: "#DFA123",
      maximize: "#27C93F",
      maximizeHover: "#1DAD2B",
    },
    selection: {
      bg: "#3067da",
      text: "#FFFFFF",
    },
    text: {
      primary: "#000000",
      secondary: "#4B4B4B",
      disabled: "#999999",
    },
  },
  metrics: {
    borderWidth: "1px",
    radius: "0.5rem", // 8px - macOS style rounding
    titleBarHeight: "1.375rem", // 22px - classic OS X height
    titleBarRadius: "8px 8px 0px 0px", // macOS style rounded top corners
    windowShadow: "0 8px 25px rgba(0,0,0,0.5)",
  },
  wallpaperDefaults: {
    photo: "/wallpapers/photos/aqua/abstract-7.jpg",
  },
};
