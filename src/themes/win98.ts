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
    supportsDarkMode: false,
  },
  wallpaperDefaults: {
    tile: "/wallpapers/tiles/bondi.png",
  },
};
