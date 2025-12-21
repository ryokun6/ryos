// Shared constants for the iPod app

import { LyricsAlignment } from "@/types/lyrics";

// Translation language options
export interface TranslationLanguage {
  labelKey?: string;
  label?: string;
  code: string | null;
}

export const TRANSLATION_LANGUAGES: TranslationLanguage[] = [
  { labelKey: "apps.ipod.translationLanguages.original", code: null },
  { labelKey: "apps.ipod.translationLanguages.english", code: "en" },
  { labelKey: "apps.ipod.translationLanguages.chinese", code: "zh-TW" },
  { labelKey: "apps.ipod.translationLanguages.japanese", code: "ja" },
  { labelKey: "apps.ipod.translationLanguages.korean", code: "ko" },
  { labelKey: "apps.ipod.translationLanguages.spanish", code: "es" },
  { labelKey: "apps.ipod.translationLanguages.french", code: "fr" },
  { labelKey: "apps.ipod.translationLanguages.german", code: "de" },
  { labelKey: "apps.ipod.translationLanguages.portuguese", code: "pt" },
  { labelKey: "apps.ipod.translationLanguages.italian", code: "it" },
  { labelKey: "apps.ipod.translationLanguages.russian", code: "ru" },
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
  return TRANSLATION_BADGES[code] || code[0]?.toUpperCase() || "?";
}
