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

// Type helpers for analytics event names
export type AppAnalyticsEvent = typeof APP_ANALYTICS[keyof typeof APP_ANALYTICS];
export type ChatAnalyticsEvent = typeof CHAT_ANALYTICS[keyof typeof CHAT_ANALYTICS];
export type IEAnalyticsEvent = typeof IE_ANALYTICS[keyof typeof IE_ANALYTICS];
export type TerminalAnalyticsEvent = typeof TERMINAL_ANALYTICS[keyof typeof TERMINAL_ANALYTICS];
export type IpodAnalyticsEvent = typeof IPOD_ANALYTICS[keyof typeof IPOD_ANALYTICS];
export type AppletAnalyticsEvent = typeof APPLET_ANALYTICS[keyof typeof APPLET_ANALYTICS];
