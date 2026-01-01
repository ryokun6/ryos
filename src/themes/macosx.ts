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
      glow: "rgba(48, 103, 218, 0.5)",
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
    titleBarBorderWidth: "1px",
    titleBarRadius: "8px 8px 0px 0px", // macOS style rounded top corners
    windowShadow: "0 8px 25px rgba(0,0,0,0.5)",
  },
  textures: {
    toolbarImage: "url(\"/assets/brushed-metal.jpg\")",
    toolbarSize: "cover",
    toolbarRepeat: "no-repeat",
    toolbarPosition: "center",
    pinstripeTitlebar:
      "linear-gradient(\n    to bottom,\n    rgba(255, 255, 255, 0.3) 0%,\n    rgba(219, 219, 219, 0.6) 70%,\n    rgba(206, 206, 206, 0.7) 100%\n  )",
    pinstripeWindow:
      "repeating-linear-gradient(\n      0deg,\n      transparent 0px,\n      transparent 1.5px,\n      rgba(255, 255, 255, 0.85) 1.5px,\n      rgba(255, 255, 255, 0.85) 4px\n    ),\n    linear-gradient(to bottom, #ececec 0%, #ececec 100%)",
    pinstripeMenubar:
      "repeating-linear-gradient(\n    0deg,\n    transparent 0px,\n    transparent 1.5px,\n    rgba(255, 255, 255, 0.55) 1.5px,\n    rgba(255, 255, 255, 0.55) 4px\n  )",
  },
  wallpaperDefaults: {
    photo: "/wallpapers/photos/aqua/abstract-7.jpg",
  },
};
