/**
 * Pure helpers used by `useTvLogic`. Extracted into their own module so they
 * can be unit-tested without spinning up React.
 */

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "music.youtube.com",
]);

/**
 * Returns true iff `url` parses as a YouTube URL embeddable by ReactPlayer's
 * YouTube driver. Handles `youtu.be`, `youtube.com`, mobile / music subdomains,
 * and gracefully returns false for malformed URLs.
 *
 * Uses an explicit host allow-list (NOT `hostname.includes("youtube.com")`)
 * so spoofed hosts like `evil-youtube.com` or `youtube.com.attacker.test`
 * are rejected.
 */
export function isYouTubeUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  try {
    return YOUTUBE_HOSTS.has(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Extract a YouTube video id from a raw 11-char id or any supported
 * YouTube URL (watch, youtu.be, embed, shorts, v/). Returns null for
 * unsupported hosts or invalid input.
 *
 * Host validation uses the same exact-match allow-list as `isYouTubeUrl`,
 * so substring-confusable hosts like `evil-youtube.com` cannot slip
 * through.
 */
export function parseYouTubeId(input: string | undefined | null): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    const hostname = url.hostname.toLowerCase();
    if (!YOUTUBE_HOSTS.has(hostname)) return null;

    const v = url.searchParams.get("v");
    if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
    if (hostname === "youtu.be") {
      const id = url.pathname.slice(1).split("/")[0] ?? "";
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }
    const m = url.pathname.match(
      /\/(?:embed\/|v\/|shorts\/)?([a-zA-Z0-9_-]{11})/
    );
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/**
 * Returns a Fisher–Yates shuffle of `arr` without mutating the input. Uses
 * `Math.random()` directly; pass a custom `rng` for deterministic shuffles
 * (e.g. in tests).
 */
export function shuffleArray<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Wrap-around index helper: returns the next index, looping at `length`. */
export function nextIndex(idx: number, length: number): number {
  if (length <= 0) return 0;
  return (idx + 1) % length;
}

/** Wrap-around index helper: returns the previous index, looping at 0. */
export function prevIndex(idx: number, length: number): number {
  if (length <= 0) return 0;
  return (idx - 1 + length) % length;
}

/**
 * Picks a random in-video offset (in seconds) inside the first 75% of `d`,
 * suitable as a "tune-in mid-program" start time. Returns `null` when the
 * duration is unsuitable: live streams (Infinity), unknown durations (NaN /
 * 0), or short clips below the threshold.
 */
export function randomTuneInOffset(
  d: number,
  rng: () => number = Math.random,
  minDuration = 30
): number | null {
  if (!Number.isFinite(d) || d <= minDuration) return null;
  return rng() * d * 0.75;
}

/**
 * Threshold (in seconds) at or below which a YouTube video is treated as a
 * Short and skipped from TV channel playback. Conservative — catches the
 * vast majority of Shorts without dropping legitimate short music videos.
 */
export const SHORTS_MAX_DURATION_SECONDS = 60;

/**
 * Returns true iff `d` looks like a YouTube Shorts duration: a finite,
 * positive value at or below `SHORTS_MAX_DURATION_SECONDS`. Live streams
 * report `Infinity`, and an unknown duration shows up as `0` / `NaN` —
 * both are treated as "not a short" so we don't drop a video while the
 * player is still booting up.
 */
export function isShortDuration(
  d: number,
  threshold = SHORTS_MAX_DURATION_SECONDS
): boolean {
  if (!Number.isFinite(d)) return false;
  if (d <= 0) return false;
  return d <= threshold;
}
