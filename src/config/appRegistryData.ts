/**
 * Lightweight app registry data - only IDs and names
 * This file can be imported without triggering heavy component loads
 * Used by stores that need basic app info during initialization
 */

export const appIds = [
  "finder",
  "soundboard",
  "internet-explorer",
  "chats",
  "textedit",
  "paint",
  "photo-booth",
  "minesweeper",
  "videos",
  "ipod",
  "karaoke",
  "synth",
  "pc",
  "terminal",
  "applet-viewer",
  "control-panels",
  "admin",
  "stickies",
  "infinite-mac",
  "winamp",
] as const;

export type AppId = (typeof appIds)[number];

/** Minimal app data for stores that don't need full registry */
export interface AppBasicInfo {
  id: AppId;
  name: string;
}

const appNames: Record<AppId, string> = {
  "finder": "Finder",
  "soundboard": "Soundboard",
  "internet-explorer": "Internet Explorer",
  "chats": "Chats",
  "textedit": "TextEdit",
  "paint": "Paint",
  "photo-booth": "Photo Booth",
  "minesweeper": "Minesweeper",
  "videos": "Videos",
  "ipod": "iPod",
  "karaoke": "Karaoke",
  "synth": "Synth",
  "pc": "Virtual PC",
  "terminal": "Terminal",
  "applet-viewer": "Applet Store",
  "control-panels": "Control Panels",
  "admin": "Admin",
  "stickies": "Stickies",
  "infinite-mac": "Infinite Mac",
  "winamp": "Winamp",
};

/** Get list of apps with basic info for stores */
export function getAppBasicInfoList(): AppBasicInfo[] {
  return appIds.map(id => ({ id, name: appNames[id] }));
}
