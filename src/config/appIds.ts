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
] as const;

export type AppId = (typeof appIds)[number];
