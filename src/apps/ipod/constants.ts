// Shared constants for the iPod app

import { LyricsAlignment } from "@/types/lyrics";
import i18n from "@/lib/i18n";

// Translation language options
export interface TranslationLanguage {
  labelKey?: string;
  label?: string;
  code: string | null;
}

export const TRANSLATION_LANGUAGES: TranslationLanguage[] = [
  { labelKey: "apps.ipod.translationLanguages.auto", code: "auto" },
  { labelKey: "apps.ipod.translationLanguages.original", code: null },
  { label: "English", code: "en" },
  { label: "中文", code: "zh-TW" },
  { label: "日本語", code: "ja" },
  { label: "한국어", code: "ko" },
  { label: "Español", code: "es" },
  { label: "Français", code: "fr" },
  { label: "Deutsch", code: "de" },
  { label: "Português", code: "pt" },
  { label: "Italiano", code: "it" },
  { label: "Русский", code: "ru" },
];

// Translation badge mappings
export const TRANSLATION_BADGES: Record<string, string> = {
  "zh-TW": "中",
  en: "En",
  ja: "日",
  ko: "한",
  es: "Es",
  fr: "Fr",
  de: "De",
  pt: "Pt",
  it: "It",
  ru: "Ru",
};

// iPod themes
export const IPOD_THEMES = ["classic", "black", "u2"] as const;
export type IpodTheme = (typeof IPOD_THEMES)[number];

// Timing constants
export const BACKLIGHT_TIMEOUT_MS = 5000;
export const STATUS_MESSAGE_DURATION_MS = 2000;
export const CONTROLS_HIDE_DELAY_MS = 2000;

// Wheel interaction constants
export const ROTATION_STEP_DEG = 15; // Degrees of rotation per scroll step
export const SEEK_AMOUNT_SECONDS = 5;

// Swipe gesture thresholds
export const SWIPE_THRESHOLD = 80; // Minimum swipe distance in pixels
export const MAX_SWIPE_TIME = 500; // Maximum time for a swipe in ms
export const MAX_VERTICAL_DRIFT = 100; // Maximum cross-directional drift

// Lyrics alignment cycle order
export const LYRICS_ALIGNMENT_CYCLE: LyricsAlignment[] = [
  LyricsAlignment.FocusThree,
  LyricsAlignment.Center,
  LyricsAlignment.Alternating,
];

// Helper to extract YouTube video ID from URL
export function getYouTubeVideoId(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/
  );
  return match ? match[1] : null;
}

// Helper to get translation badge from code
export function getTranslationBadge(code: string | null): string | null {
  if (!code) return null;
  // For "auto", resolve to the actual ryOS language
  if (code === "auto") {
    const actualLang = i18n.language;
    return TRANSLATION_BADGES[actualLang] || actualLang[0]?.toUpperCase() || "?";
  }
  return TRANSLATION_BADGES[code] || code[0]?.toUpperCase() || "?";
}
