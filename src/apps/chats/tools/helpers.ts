/**
 * Shared Helper Functions for Tool Handlers
 *
 * Consolidates duplicated utilities used across multiple tool handlers
 * to improve DRY compliance and maintainability.
 */

import i18n from "@/lib/i18n";
import { detectUserOS as detectUserOSUtil } from "@/utils/userOS";

// ============================================================================
// Short ID Mapping for AI Communication
// ============================================================================

/**
 * Bidirectional mapping between short IDs and full UUIDs.
 * Used to reduce token usage when communicating with AI.
 */
export interface ShortIdMap {
  /** Map from short ID (e.g., "s1") to full UUID */
  shortToFull: Map<string, string>;
  /** Map from full UUID to short ID */
  fullToShort: Map<string, string>;
}

/**
 * Creates a short ID mapping from an array of full UUIDs.
 * Short IDs are formatted as "{prefix}{number}" (e.g., "s1", "s2").
 * 
 * @param fullIds Array of full UUIDs to map
 * @param prefix Single character prefix for short IDs (default: "s")
 * @returns Bidirectional mapping object
 */
export const createShortIdMap = (
  fullIds: string[],
  prefix: string = "s"
): ShortIdMap => {
  const shortToFull = new Map<string, string>();
  const fullToShort = new Map<string, string>();
  
  fullIds.forEach((fullId, index) => {
    const shortId = `${prefix}${index + 1}`;
    shortToFull.set(shortId, fullId);
    fullToShort.set(fullId, shortId);
  });
  
  return { shortToFull, fullToShort };
};

/**
 * Converts a short ID to its full UUID using the provided mapping.
 * Returns undefined if the short ID is not found in the mapping.
 */
export const shortToFullId = (
  shortId: string,
  map: ShortIdMap
): string | undefined => {
  return map.shortToFull.get(shortId);
};

/**
 * Converts a full UUID to its short ID using the provided mapping.
 * Returns undefined if the full ID is not found in the mapping.
 */
export const fullToShortId = (
  fullId: string,
  map: ShortIdMap
): string | undefined => {
  return map.fullToShort.get(fullId);
};

/**
 * Resolves an ID that could be either a short ID or a full UUID.
 * First checks if it's a valid short ID in the map, then returns it as-is (full UUID).
 * 
 * @param id The ID to resolve (could be short or full)
 * @param map The short ID mapping (can be undefined if no mapping exists)
 * @returns The full UUID
 */
export const resolveId = (
  id: string,
  map: ShortIdMap | undefined
): string => {
  if (map) {
    const fullId = map.shortToFull.get(id);
    if (fullId) return fullId;
  }
  // If no mapping exists or ID not found in map, assume it's already a full UUID
  return id;
};

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
  return detectUserOSUtil();
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
