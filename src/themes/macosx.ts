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
    supportsDarkMode: true,
  },
  wallpaperDefaults: {
    photo: "/wallpapers/photos/aqua/abstract-7.jpg",
  },
};
