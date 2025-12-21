import { OsTheme } from "./types";

export const win98: OsTheme = {
  id: "win98",
  name: "98",
  metadata: {
    isWindows: true,
    isMac: false,
    hasDock: false,
    hasTaskbar: true,
    hasMenuBar: false,
    titleBarControlsPosition: "right",
    menuBarHeight: 0,
    taskbarHeight: 30,
    baseDockHeight: 0,
  },
  fonts: {
    ui: "Tahoma, MS Sans Serif, sans-serif",
    mono: "Consolas, Courier New, monospace",
  },
  colors: {
    windowBg: "#C0C0C0", // classic 3D face color
    menubarBg: "#C0C0C0",
    menubarBorder: "#808080",
    windowBorder: "#000000",
    titleBar: {
      // Approximate classic gradient (user color configurable in real OS)
      activeBg: "linear-gradient(to right, #000084, #1084d0)",
      inactiveBg: "linear-gradient(to right, #808080, #c0c0c0)",
      text: "#FFFFFF",
      inactiveText: "#E0E0E0",
    },
    button: {
      face: "#C0C0C0",
      highlight: "#FFFFFF",
      shadow: "#808080",
      activeFace: "#B0B0B0",
    },
    selection: {
      bg: "#000080",
      text: "#FFFFFF",
    },
    text: {
      primary: "#000000",
      secondary: "#333333",
      disabled: "#7F7F7F",
    },
  },
  metrics: {
    borderWidth: "2px",
    radius: "0px",
    titleBarHeight: "1.375rem", // ~22px
    windowShadow: "none",
  },
  wallpaperDefaults: {
    tile: "/wallpapers/tiles/bondi.png",
  },
};
