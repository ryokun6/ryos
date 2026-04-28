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
 */
export function isYouTubeUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  try {
    return YOUTUBE_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
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
