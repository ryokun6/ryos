import { OsTheme } from "./types";

export const xp: OsTheme = {
  id: "xp",
  name: "XP",
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
    ui: "Tahoma, Segoe UI, sans-serif",
    mono: "Consolas, Courier New, monospace",
  },
  colors: {
    windowBg: "#ECE9D8",
    menubarBg: "linear-gradient(to bottom, #245EDC, #1941A5)",
    menubarBorder: "#0A246A",
    windowBorder: "#0054E3",
    titleBar: {
      activeBg: "linear-gradient(to bottom, #0058E6, #1941A5)",
      inactiveBg: "linear-gradient(to bottom, #8B9DC3, #7A8AAB)",
      text: "#FFFFFF",
      inactiveText: "#D5DDF3",
    },
    button: {
      face: "#ECE9D8",
      highlight: "#FFFFFF",
      shadow: "#ACA899",
      activeFace: "#D8D5C8",
    },
    selection: {
      bg: "#316AC5",
      text: "#FFFFFF",
    },
    text: {
      primary: "#000000",
      secondary: "#5A5A5A",
      disabled: "#A0A0A0",
    },
  },
  metrics: {
    borderWidth: "3px",
    radius: "0.5rem", // 8px - XP had subtle rounding on windows
    titleBarHeight: "1.875rem", // 30px - taller than classic Mac
    windowShadow: "0 4px 8px rgba(0,0,0,0.25)",
  },
  wallpaperDefaults: {
    photo: "/wallpapers/photos/landscapes/bliss.jpg",
  },
};
