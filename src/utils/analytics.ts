/**
 * Centralized analytics event constants
 * 
 * This file contains all analytics event names used throughout the application.
 * Events follow the pattern: `category:action` or `app:action`
 * 
 * Usage:
 *   import { track } from "@vercel/analytics";
 *   import { APP_ANALYTICS } from "@/utils/analytics";
 *   track(APP_ANALYTICS.LAUNCH, { appId: "finder" });
 */

// Core application events
export const APP_ANALYTICS = {
  // App lifecycle
  APP_LAUNCH: "app:launch",
  APP_CRASH: "app:crash",
  DESKTOP_CRASH: "desktop:crash",
  
  // User lifecycle
  USER_CREATE: "user:create",
  USER_LOGIN_PASSWORD: "user:login_password",
  USER_LOGIN_TOKEN: "user:login_token",
  USER_LOGOUT: "user:logout",
} as const;

// Chat-specific events (existing)
export const CHAT_ANALYTICS = {
  TEXT_MESSAGE: "chats:text",
  VOICE_MESSAGE: "chats:voice",
  NUDGE: "chats:nudge",
  STOP_GENERATION: "chats:stop",
} as const;

// Internet Explorer events (existing)
export const IE_ANALYTICS = {
  NAVIGATION_START: "internet-explorer:navigation_start",
  NAVIGATION_ERROR: "internet-explorer:navigation_error",
  NAVIGATION_SUCCESS: "internet-explorer:navigation_success",
} as const;

// Terminal events (existing)
export const TERMINAL_ANALYTICS = {
  AI_COMMAND: "terminal:ai_command",
  CHAT_START: "terminal:chat_start",
  CHAT_EXIT: "terminal:chat_exit",
  CHAT_CLEAR: "terminal:chat_clear",
} as const;

// iPod events
export const IPOD_ANALYTICS = {
  SONG_PLAY: "ipod:song_play",
} as const;

// Applet Viewer events
export const APPLET_ANALYTICS = {
  INSTALL: "applet:install",
  UPDATE: "applet:update",
  VIEW: "applet:view",
} as const;

// Finder events
export const FINDER_ANALYTICS = {
  FILE_OPEN: "finder:file_open",
  FILE_RENAME: "finder:file_rename",
  FILE_DELETE: "finder:file_delete",
  FOLDER_CREATE: "finder:folder_create",
  TRASH_EMPTY: "finder:trash_empty",
} as const;

// TextEdit events
export const TEXTEDIT_ANALYTICS = {
  FILE_NEW: "textedit:file_new",
  FILE_SAVE: "textedit:file_save",
  FILE_OPEN: "textedit:file_open",
} as const;

// Control Panels / Settings events
export const SETTINGS_ANALYTICS = {
  THEME_CHANGE: "settings:theme_change",
  WALLPAPER_CHANGE: "settings:wallpaper_change",
} as const;

// Photo Booth events
export const PHOTO_BOOTH_ANALYTICS = {
  CAPTURE: "photo-booth:capture",
  EXPORT: "photo-booth:export",
} as const;

// Minesweeper events
export const MINESWEEPER_ANALYTICS = {
  GAME_START: "minesweeper:game_start",
  GAME_WIN: "minesweeper:game_win",
  GAME_LOSE: "minesweeper:game_lose",
} as const;

// Paint events
export const PAINT_ANALYTICS = {
  FILE_SAVE: "paint:file_save",
  FILE_EXPORT: "paint:file_export",
} as const;

// Videos events
export const VIDEOS_ANALYTICS = {
  VIDEO_PLAY: "videos:video_play",
} as const;

// Karaoke events
export const KARAOKE_ANALYTICS = {
  SESSION_START: "karaoke:session_start",
  TRACK_ADD: "karaoke:track_add",
} as const;

// Synth events
export const SYNTH_ANALYTICS = {
  PRESET_SAVE: "synth:preset_save",
  PRESET_LOAD: "synth:preset_load",
} as const;

// Soundboard events
export const SOUNDBOARD_ANALYTICS = {
  SOUND_PLAY: "soundboard:sound_play",
} as const;

// Winamp events
export const WINAMP_ANALYTICS = {
  TRACK_PLAY: "winamp:track_play",
} as const;

// Stickies events
export const STICKIES_ANALYTICS = {
  NOTE_CREATE: "stickies:note_create",
  NOTE_DELETE: "stickies:note_delete",
} as const;

// Calendar events
export const CALENDAR_ANALYTICS = {
  EVENT_CREATE: "calendar:event_create",
  EVENT_DELETE: "calendar:event_delete",
} as const;

// Contacts events
export const CONTACTS_ANALYTICS = {
  CONTACT_CREATE: "contacts:contact_create",
  CONTACT_DELETE: "contacts:contact_delete",
  CONTACTS_IMPORT: "contacts:import",
} as const;

// Type helpers for analytics event names
export type AppAnalyticsEvent = typeof APP_ANALYTICS[keyof typeof APP_ANALYTICS];
export type ChatAnalyticsEvent = typeof CHAT_ANALYTICS[keyof typeof CHAT_ANALYTICS];
export type IEAnalyticsEvent = typeof IE_ANALYTICS[keyof typeof IE_ANALYTICS];
export type TerminalAnalyticsEvent = typeof TERMINAL_ANALYTICS[keyof typeof TERMINAL_ANALYTICS];
export type IpodAnalyticsEvent = typeof IPOD_ANALYTICS[keyof typeof IPOD_ANALYTICS];
export type AppletAnalyticsEvent = typeof APPLET_ANALYTICS[keyof typeof APPLET_ANALYTICS];
export type FinderAnalyticsEvent = typeof FINDER_ANALYTICS[keyof typeof FINDER_ANALYTICS];
export type TextEditAnalyticsEvent = typeof TEXTEDIT_ANALYTICS[keyof typeof TEXTEDIT_ANALYTICS];
export type SettingsAnalyticsEvent = typeof SETTINGS_ANALYTICS[keyof typeof SETTINGS_ANALYTICS];
export type PhotoBoothAnalyticsEvent = typeof PHOTO_BOOTH_ANALYTICS[keyof typeof PHOTO_BOOTH_ANALYTICS];
export type MinesweeperAnalyticsEvent = typeof MINESWEEPER_ANALYTICS[keyof typeof MINESWEEPER_ANALYTICS];
export type PaintAnalyticsEvent = typeof PAINT_ANALYTICS[keyof typeof PAINT_ANALYTICS];
export type VideosAnalyticsEvent = typeof VIDEOS_ANALYTICS[keyof typeof VIDEOS_ANALYTICS];
export type KaraokeAnalyticsEvent = typeof KARAOKE_ANALYTICS[keyof typeof KARAOKE_ANALYTICS];
export type SynthAnalyticsEvent = typeof SYNTH_ANALYTICS[keyof typeof SYNTH_ANALYTICS];
export type SoundboardAnalyticsEvent = typeof SOUNDBOARD_ANALYTICS[keyof typeof SOUNDBOARD_ANALYTICS];
export type WinampAnalyticsEvent = typeof WINAMP_ANALYTICS[keyof typeof WINAMP_ANALYTICS];
export type StickiesAnalyticsEvent = typeof STICKIES_ANALYTICS[keyof typeof STICKIES_ANALYTICS];
export type CalendarAnalyticsEvent = typeof CALENDAR_ANALYTICS[keyof typeof CALENDAR_ANALYTICS];
export type ContactsAnalyticsEvent = typeof CONTACTS_ANALYTICS[keyof typeof CONTACTS_ANALYTICS];
