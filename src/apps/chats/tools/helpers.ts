/**
 * Shared Helper Functions for Tool Handlers
 *
 * Consolidates duplicated utilities used across multiple tool handlers
 * to improve DRY compliance and maintainability.
 */

import { detectUserOS } from "../utils/systemState";
export {
  createShortIdMap,
  resolveId,
  type ShortIdMap,
} from "@/shared/tools/idMapping";

// ============================================================================
// Short ID Mapping for AI Communication
// ============================================================================

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
const LANGUAGE_NAMES: Record<string, string> = {
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
