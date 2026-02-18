import { OsTheme } from "./types";

export const win7: OsTheme = {
  id: "win7",
  name: "7",
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
    ui: '"Segoe UI", Tahoma, sans-serif',
    mono: "Consolas, Courier New, monospace",
  },
  colors: {
    windowBg: "#F0F0F0",
    menubarBg: "linear-gradient(to bottom, #4580C4, #3568A8)",
    menubarBorder: "#000000b3",
    windowBorder: "#000000b3",
    titleBar: {
      activeBg: "linear-gradient(to right, #4580C4, #3568A8)",
      inactiveBg: "linear-gradient(to right, #B0B0B0, #A0A0A0)",
      text: "#000000",
      inactiveText: "#787878",
    },
    button: {
      face: "#F0F0F0",
      highlight: "#FFFFFF",
      shadow: "#8E8F8F",
      activeFace: "#E5F4FC",
    },
    selection: {
      bg: "#3399FF",
      text: "#FFFFFF",
    },
    text: {
      primary: "#000000",
      secondary: "#5A5A5A",
      disabled: "#838383",
    },
  },
  metrics: {
    borderWidth: "1px",
    radius: "6px",
    titleBarHeight: "1.875rem",
    windowShadow: "2px 2px 10px 1px rgba(0,0,0,0.4)",
  },
  wallpaperDefaults: {
    photo: "/wallpapers/photos/landscapes/clouds.jpg",
  },
};
