// Shared constants for the iPod app

import { LyricsAlignment } from "@/types/lyrics";
import type { Track } from "@/stores/useIpodStore";
import { parseYouTubeVideoId, youtubeThumbnailUrl } from "@/utils/youtubeUrl";
import { formatKugouImageUrl } from "@/utils/coverArt";

// Re-exported from shared utils so existing iPod-internal imports keep working
// while the canonical implementations live under `src/utils/`.
export { formatKugouImageUrl } from "@/utils/coverArt";
export {
  type TranslationLanguage,
  TRANSLATION_LANGUAGES,
  TRANSLATION_BADGES,
  getTranslationBadge,
} from "@/utils/lyricsTranslation";

/** Fixed modern iPod LCD outer height (px), including `border-2` on the screen element. */
export const IPOD_MODERN_SCREEN_HEIGHT_PX = 152;

/** `border-2` on each side; with `border-box` the drawable area is outer − 4. */
export const IPOD_MODERN_SCREEN_BORDER_PX = 2;

/** Pixels available for titlebar + menu inside the bordered box. */
export const IPOD_MODERN_DRAWABLE_HEIGHT_PX =
  IPOD_MODERN_SCREEN_HEIGHT_PX - 2 * IPOD_MODERN_SCREEN_BORDER_PX;

/** Silver status / title bar (iOS 6–style, 12px type). */
export const IPOD_MODERN_TITLEBAR_HEIGHT_PX = 16;

/** Menu list viewport below the status bar: 148 − 16 = 132 (divisible by 6 and 4). */
export const IPOD_MODERN_MENU_BODY_HEIGHT_PX =
  IPOD_MODERN_DRAWABLE_HEIGHT_PX - IPOD_MODERN_TITLEBAR_HEIGHT_PX;

/** Standard modern menus show six rows without scrolling. */
export const IPOD_MODERN_MENU_VISIBLE_ROWS = 6;

/** Square artwork in modern media browse rows (fits inside {@link IPOD_MODERN_MEDIA_ROW_HEIGHT_PX}). */
export const IPOD_MODERN_MEDIA_THUMB_PX = 26;

/** Two-line media browse menus target four visible rows. */
export const IPOD_MODERN_MEDIA_VISIBLE_ROWS = 4;

/**
 * Bottom slack under the last row when the body height is not divisible by the
 * visible row count (applied as scroll-container `padding-bottom`, not row height).
 */
function modernMenuBodySlackPx(visibleRows: number): number {
  return IPOD_MODERN_MENU_BODY_HEIGHT_PX % visibleRows;
}

/** Single-line menu: 132 / 6 = 22px rows; 0 slack. */
export const IPOD_MODERN_MENU_BODY_SLACK_PX = modernMenuBodySlackPx(
  IPOD_MODERN_MENU_VISIBLE_ROWS
);

export const IPOD_MODERN_MENU_ROW_HEIGHT_PX =
  (IPOD_MODERN_MENU_BODY_HEIGHT_PX - IPOD_MODERN_MENU_BODY_SLACK_PX) /
  IPOD_MODERN_MENU_VISIBLE_ROWS;

/** Media browse: 132 / 4 = 33px rows; 0 slack. */
export const IPOD_MODERN_MEDIA_BODY_SLACK_PX = modernMenuBodySlackPx(
  IPOD_MODERN_MEDIA_VISIBLE_ROWS
);

export const IPOD_MODERN_MEDIA_ROW_HEIGHT_PX =
  (IPOD_MODERN_MENU_BODY_HEIGHT_PX - IPOD_MODERN_MEDIA_BODY_SLACK_PX) /
  IPOD_MODERN_MEDIA_VISIBLE_ROWS;

/** Internal breadcrumb key for the Now Playing long-press song menu. */
export const IPOD_NOW_PLAYING_SONG_MENU_KEY = "__nowPlayingSongMenu__";

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

// Helper to extract YouTube video ID from URL. Delegates to the canonical,
// host-safe parser in `@/utils/youtubeUrl`.
export function getYouTubeVideoId(url: string): string | null {
  return parseYouTubeVideoId(url);
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
  const youtubeThumbnail = videoId ? youtubeThumbnailUrl(videoId) : null;
  return formatKugouImageUrl(track.cover, 400) ?? youtubeThumbnail;
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

const APPLE_MUSIC_FEATURED_ARTIST_SUFFIX =
  /\s*(?:\(|\[)?\s*(?:feat\.?|ft\.?|featuring)\s+.*?(?:\)|\])?\s*$/i;

function normalizeArtistGroupingName(name: string): string {
  return name.trim().normalize("NFKC").replace(/\s+/g, " ");
}

function stripAppleMusicFeaturedArtistSuffix(name: string): string {
  const stripped = name.replace(APPLE_MUSIC_FEATURED_ARTIST_SUFFIX, "").trim();
  return stripped.length > 0 ? stripped : name.trim();
}

export function getArtistGroupingDisplayName(
  track: Track,
  unknownArtistLabel: string
): string {
  const albumArtist = track.albumArtist?.trim();
  const artist = track.artist?.trim();
  const rawName =
    track.source === "appleMusic" && albumArtist
      ? albumArtist
      : artist || unknownArtistLabel;
  const cleanedName =
    track.source === "appleMusic" && !albumArtist
      ? stripAppleMusicFeaturedArtistSuffix(rawName)
      : rawName;
  return normalizeArtistGroupingName(cleanedName || unknownArtistLabel);
}

export function getArtistGroupingKey(
  track: Track,
  unknownArtistLabel: string
): string {
  return getArtistGroupingDisplayName(
    track,
    unknownArtistLabel
  ).toLocaleLowerCase();
}
