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
    supportsDarkMode: false,
  },
  wallpaperDefaults: {
    tile: "/wallpapers/tiles/Property 1=1.svg",
  },
};
