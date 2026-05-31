/**
 * Pure helpers used by `useTvLogic`. Extracted into their own module so they
 * can be unit-tested without spinning up React.
 */

import {
  isYouTubeUrl as isYouTubeHostUrl,
  parseYouTubeVideoId,
} from "@/utils/youtubeUrl";

/** @see {@link isYouTubeHostUrl} in `@/utils/youtubeUrl` */
export function isYouTubeUrl(url: string | undefined | null): boolean {
  return isYouTubeHostUrl(url);
}

/** @see {@link parseYouTubeVideoId} in `@/utils/youtubeUrl` */
export function parseYouTubeId(input: string | undefined | null): string | null {
  return parseYouTubeVideoId(input);
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

/** 32-bit seed from a string (stable across runs for playlist ordering). */
export function hashStringToSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Mulberry32 PRNG; each invocation returns a float in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher–Yates shuffle driven only by `seedKey`. Same key + same items ⇒
 * identical order on every call, so UI indices (drawer, store) stay aligned
 * when React recomputes `useTvLogic`'s channel memo.
 */
export function shufflePlaylistWithSeed<T extends { id: string }>(
  items: T[],
  seedKey: string
): T[] {
  const rng = mulberry32(hashStringToSeed(seedKey));
  return shuffleArray(items, rng);
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
