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
  "tv",
  "ipod",
  "karaoke",
  "synth",
  "terminal",
  "applet-viewer",
  "control-panels",
  "admin",
  "stickies",
  "infinite-mac",
  "pc",
  "winamp",
  "calendar",
  "contacts",
  "dashboard",
  "candybar",
] as const;

export type AppId = (typeof appIds)[number];

/** Persisted / bookmarked IDs that were renamed in the registry */
export const LEGACY_APP_ID_ALIASES: Record<string, AppId> = {
  "infinite-pc": "pc",
};

const APP_ID_SET = new Set<string>(appIds);

export function resolveAppId(id: string): AppId | undefined {
  const candidate = (LEGACY_APP_ID_ALIASES[id] ?? id) as AppId;
  return APP_ID_SET.has(candidate) ? candidate : undefined;
}

/** Minimal app data for stores that don't need full registry */
export interface AppBasicInfo {
  id: AppId;
  name: string;
}

/** App ID to name mapping - matches appRegistry names exactly */
export const appNames: Record<AppId, string> = {
  "finder": "Finder",
  "soundboard": "Soundboard",
  "internet-explorer": "Internet Explorer",
  "chats": "Chats",
  "textedit": "TextEdit",
  "paint": "Paint",
  "photo-booth": "Photo Booth",
  "minesweeper": "Minesweeper",
  "videos": "Videos",
  "tv": "TV",
  "ipod": "iPod",
  "karaoke": "Karaoke",
  "synth": "Synth",
  "terminal": "Terminal",
  "applet-viewer": "Applet Store",
  "control-panels": "Control Panels",
  "admin": "Admin",
  "stickies": "Stickies",
  "infinite-mac": "Infinite Mac",
  pc: "Virtual PC",
  "winamp": "Winamp",
  "calendar": "Calendar",
  "contacts": "Contacts",
  "dashboard": "Dashboard",
  "candybar": "CandyBar",
};

/** Get list of apps with basic info for stores */
export function getAppBasicInfoList(): AppBasicInfo[] {
  return appIds.map(id => ({ id, name: appNames[id] }));
}
