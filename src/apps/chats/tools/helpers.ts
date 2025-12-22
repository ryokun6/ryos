/**
 * Shared Helper Functions for Tool Handlers
 *
 * Consolidates duplicated utilities used across multiple tool handlers
 * to improve DRY compliance and maintainability.
 */

import i18n from "@/lib/i18n";

/**
 * Case-insensitive string inclusion check
 * Used by iPod and Karaoke handlers for track matching
 */
export const ciIncludes = (
  source: string | undefined,
  query: string | undefined
): boolean => {
  if (!source || !query) return false;
  return source.toLowerCase().includes(query.toLowerCase());
};

/**
 * Format track description for display
 * Consistent format: "Title by Artist" or just "Title"
 */
export const formatTrackDescription = (
  title: string,
  artist?: string
): string => {
  return artist ? `${title} by ${artist}` : title;
};

/**
 * Build result message from parts
 * Joins with ". " and adds period at end for multiple parts
 */
export const buildResultMessage = (parts: string[]): string => {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return parts.join(". ") + ".";
};

/**
 * Map language codes to human-readable names
 */
export const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  "zh-TW": "Traditional Chinese",
  "zh-CN": "Simplified Chinese",
  ja: "Japanese",
  ko: "Korean",
  es: "Spanish",
  fr: "French",
  de: "German",
  pt: "Portuguese",
  it: "Italian",
  ru: "Russian",
};

/**
 * Get display name for a language code
 */
export const getLanguageName = (langCode: string): string => {
  return LANGUAGE_NAMES[langCode] || langCode;
};

/**
 * Detect if user is on iOS
 * Used to determine if auto-play is blocked by browser restrictions
 */
export const detectUserOS = (): string => {
  if (typeof navigator === "undefined") return "Unknown";

  const userAgent = navigator.userAgent;
  const platform = navigator.platform || "";

  // Check for iOS (iPhone, iPad, iPod)
  if (
    /iPad|iPhone|iPod/.test(userAgent) ||
    (platform === "MacIntel" && navigator.maxTouchPoints > 1)
  ) {
    return "iOS";
  }

  // Check for Android
  if (/Android/.test(userAgent)) {
    return "Android";
  }

  // Check for Windows
  if (/Win/.test(platform)) {
    return "Windows";
  }

  // Check for macOS (not iOS)
  if (/Mac/.test(platform)) {
    return "macOS";
  }

  // Check for Linux
  if (/Linux/.test(platform)) {
    return "Linux";
  }

  return "Unknown";
};

/**
 * Check if the current OS is iOS
 */
export const isIOSDevice = (): boolean => {
  return detectUserOS() === "iOS";
};

/**
 * Check if translation should be disabled based on value
 */
export const shouldDisableTranslation = (
  value: string | null | undefined
): boolean => {
  const disableValues = [
    "original",
    "off",
    "none",
    "disable",
    "disabled",
    "null",
    "false",
  ];
  return (
    value === null ||
    value === "" ||
    (typeof value === "string" && disableValues.includes(value.toLowerCase()))
  );
};

/**
 * Create iOS restriction message for music playback
 */
export const getIOSRestrictionMessage = (appName: "iPod" | "Karaoke"): string => {
  if (appName === "iPod") {
    return i18n.t("apps.chats.toolCalls.ipodReady");
  }
  return i18n.t("apps.chats.toolCalls.karaokeReady", {
    defaultValue: "Karaoke is ready. Tap play to start",
  });
};
