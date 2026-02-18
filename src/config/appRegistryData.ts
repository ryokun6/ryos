/**
 * Lightweight app registry data - only IDs and names
 * This file can be imported without triggering heavy component loads
 * Used by stores that need basic app info during initialization
 */

/** App ID to name mapping - single source of truth for app names */
export const appNames = {
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
} as const;

export type AppId = keyof typeof appNames;

/** Ordered list of app IDs */
export const appIds: readonly AppId[] = Object.keys(appNames) as AppId[];

/** Minimal app data for stores that don't need full registry */
export interface AppBasicInfo {
  id: AppId;
  name: string;
}

/** Get list of apps with basic info for stores */
export function getAppBasicInfoList(): AppBasicInfo[] {
  return appIds.map(id => ({ id, name: appNames[id] }));
}
