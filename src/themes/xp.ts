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
    supportsDarkMode: false,
  },
  wallpaperDefaults: {
    photo: "/wallpapers/photos/landscapes/bliss.jpg",
  },
};
