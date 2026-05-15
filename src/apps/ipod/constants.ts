// Shared constants for the iPod app

import { LyricsAlignment } from "@/types/lyrics";
import i18n from "@/lib/i18n";
import type { Track } from "@/stores/useIpodStore";

// Translation language options
export interface TranslationLanguage {
  labelKey?: string;
  label?: string;
  code: string | null;
  separator?: boolean;
}

export const TRANSLATION_LANGUAGES: TranslationLanguage[] = [
  { labelKey: "apps.ipod.translationLanguages.original", code: null },
  { labelKey: "apps.ipod.translationLanguages.auto", code: "auto" },
  { separator: true, code: null, label: "" }, // Separator
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
export const PLAYER_PROGRESS_INTERVAL_MS = 200;

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

/** Modern color-screen geometry: 150px outer frame, 2px border → 146px inner. */
export const IPOD_SCREEN_HEIGHT_PX = 150;
export const IPOD_SCREEN_BORDER_PX = 2;
export const IPOD_SCREEN_INNER_HEIGHT_PX =
  IPOD_SCREEN_HEIGHT_PX - IPOD_SCREEN_BORDER_PX * 2;
/** Visible menu rows below the silver status bar. */
export const MODERN_MENU_ROW_COUNT = 7;
export const MODERN_TITLEBAR_HEIGHT_PX = 20;
export const MENU_ITEM_HEIGHT_MODERN_PX = Math.floor(
  (IPOD_SCREEN_INNER_HEIGHT_PX - MODERN_TITLEBAR_HEIGHT_PX) /
    MODERN_MENU_ROW_COUNT
);
export const MODERN_MENU_LIST_HEIGHT_PX =
  MENU_ITEM_HEIGHT_MODERN_PX * MODERN_MENU_ROW_COUNT;

// Helper to extract YouTube video ID from URL
export function getYouTubeVideoId(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/
  );
  return match ? match[1] : null;
}

/**
 * Replace {size} placeholder in Kugou image URL with actual size
 * Kugou image URLs contain {size} that needs to be replaced with: 100, 150, 240, 400, etc.
 * Also ensures HTTPS is used to avoid mixed content issues
 */
export function formatKugouImageUrl(imgUrl: string | undefined, size: number = 400): string | null {
  if (!imgUrl) return null;
  let url = imgUrl.replace("{size}", String(size));
  // Ensure HTTPS
  url = url.replace(/^http:\/\//, "https://");
  return url;
}

/**
 * Resolve the best available cover URL for a track, used by the menu
 * split-art panel and any other surface that wants the canonical
 * "what should I show as artwork" answer.
 *
 * Source priority:
 *  1. Apple Music tracks supply an https URL directly via `cover`.
 *  2. Kugou-style URLs use `formatKugouImageUrl` to expand the
 *     `{size}` placeholder.
 *  3. YouTube tracks fall back to the maxres thumbnail derived from
 *     the video URL.
 *
 * Returns null when nothing usable is available so callers can fall
 * back gracefully (e.g. to the now-playing track's cover).
 */
export function resolveTrackCoverUrl(
  track: { url?: string; cover?: string; source?: string } | null | undefined
): string | null {
  if (!track) return null;
  if (track.source === "appleMusic") {
    return track.cover ?? null;
  }
  const videoId = track.url ? getYouTubeVideoId(track.url) : null;
  const youtubeThumbnail = videoId
    ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
    : null;
  return formatKugouImageUrl(track.cover, 400) ?? youtubeThumbnail;
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

export function getAlbumGroupingKey(
  track: Track,
  unknownAlbumLabel: string,
  unknownArtistLabel: string
): string {
  const album = track.album || unknownAlbumLabel;
  if (track.source === "appleMusic" && track.appleMusicAlbumId) {
    return `am-album:${track.appleMusicAlbumId}`;
  }
  if (track.source === "appleMusic" && !track.albumArtist) {
    return `am-album-name:${album.toLocaleLowerCase()}`;
  }
  const albumArtist = track.albumArtist || track.artist || unknownArtistLabel;
  return `${albumArtist}\u0000${album}`;
}
