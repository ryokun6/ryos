import type { AppId } from "@/config/appRegistry";

export const DEFAULT_SHORTCUT_ORDER: AppId[] = [
  "ipod",
  "chats",
  "internet-explorer",
  "karaoke",
  "applet-viewer",
  "textedit",
  "photo-booth",
  "videos",
  "paint",
  "soundboard",
  "minesweeper",
  "synth",
  "calendar",
  "maps",
  "terminal",
  "pc",
  "dashboard",
];

export const getDesktopAppItemId = (appId: string) => `app:${appId}`;
export const getDesktopShortcutItemId = (path: string) => `shortcut:${path}`;
