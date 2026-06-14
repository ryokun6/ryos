// Dynamic wallpaper descriptors.
//
// The desktop wallpaper is stored as a plain string in
// `useDisplaySettingsStore.currentWallpaper`. Most values are concrete asset
// paths (e.g. `/wallpapers/photos/aqua/abstract-7.jpg`) or `indexeddb://…`
// references. The schemes below describe *dynamic* wallpapers whose rendered
// pixels change over time:
//
//   - `dynamic://gradient/day-night` — a gradient that shifts with wall-clock
//     time of day.
//   - `dynamic://cover`              — the now-playing cover art of the iPod or
//     Karaoke (falls back to the paused cover).
//   - `shuffle://photos/<category>`  — a random photo from a picker category,
//     swapped every {@link SHUFFLE_INTERVAL_MS}.
//   - `shuffle://tiles`              — a random tiled pattern, rotated likewise.
//   - `shuffle://videos`             — a random video wallpaper, rotated likewise.

import type { WallpaperManifest } from "@/utils/wallpapers";

export const DYNAMIC_PREFIX = "dynamic://";
export const SHUFFLE_PREFIX = "shuffle://";

export const DAY_NIGHT_GRADIENT_WALLPAPER = "dynamic://gradient/day-night";
export const COVER_WALLPAPER = "dynamic://cover";

/**
 * How often shuffle wallpapers swap to a new random pick. Rotation is
 * wall-clock based (see `useShuffleWallpaper`): the desktop also catches up to
 * a fresh pick when the tab regains visibility/focus after being away longer
 * than this, since browsers throttle/suspend background-tab timers.
 */
export const SHUFFLE_INTERVAL_MS = 5 * 60 * 1000;

export function isDynamicWallpaper(wallpaper: string | undefined | null): boolean {
  return (
    !!wallpaper &&
    (wallpaper.startsWith(DYNAMIC_PREFIX) || wallpaper.startsWith(SHUFFLE_PREFIX))
  );
}

export function isDayNightGradientWallpaper(
  wallpaper: string | undefined | null
): boolean {
  return wallpaper === DAY_NIGHT_GRADIENT_WALLPAPER;
}

export function isCoverWallpaper(wallpaper: string | undefined | null): boolean {
  return wallpaper === COVER_WALLPAPER;
}

export function isShuffleWallpaper(
  wallpaper: string | undefined | null
): boolean {
  return !!wallpaper && wallpaper.startsWith(SHUFFLE_PREFIX);
}

export type ShuffleTarget =
  | { kind: "tiles" }
  | { kind: "videos" }
  | { kind: "photos"; category: string };

/** Build the descriptor stored for a "shuffle this category" selection. */
export function buildShuffleDescriptor(
  category: "tiles" | "videos" | string
): string {
  if (category === "tiles") return `${SHUFFLE_PREFIX}tiles`;
  if (category === "videos") return `${SHUFFLE_PREFIX}videos`;
  return `${SHUFFLE_PREFIX}photos/${category}`;
}

/** Parse a shuffle descriptor into its target category. */
export function parseShuffleDescriptor(
  wallpaper: string | undefined | null
): ShuffleTarget | null {
  if (!wallpaper || !wallpaper.startsWith(SHUFFLE_PREFIX)) return null;
  const rest = wallpaper.slice(SHUFFLE_PREFIX.length);
  if (rest === "tiles") return { kind: "tiles" };
  if (rest === "videos") return { kind: "videos" };
  if (rest.startsWith("photos/")) {
    const category = rest.slice("photos/".length);
    if (category) return { kind: "photos", category };
  }
  return null;
}

/** Resolve the full `/wallpapers/…` candidate paths for a shuffle descriptor. */
export function getShuffleCandidatePaths(
  manifest: WallpaperManifest,
  target: ShuffleTarget
): string[] {
  let relative: string[] = [];
  if (target.kind === "tiles") relative = manifest.tiles ?? [];
  else if (target.kind === "videos") relative = manifest.videos ?? [];
  else relative = manifest.photos?.[target.category] ?? [];
  return relative.map((p) => `/wallpapers/${p}`);
}

/** Pick a random candidate, preferring one different from `exclude`. */
export function pickRandomCandidate(
  candidates: string[],
  exclude?: string | null
): string | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  const pool = exclude
    ? candidates.filter((c) => c !== exclude)
    : candidates;
  const list = pool.length > 0 ? pool : candidates;
  return list[Math.floor(Math.random() * list.length)];
}

// ---------------------------------------------------------------------------
// Day / night gradient
// ---------------------------------------------------------------------------

type RGB = [number, number, number];

interface GradientKeyframe {
  /** Hour of day in [0, 24). */
  hour: number;
  /** Top, middle, and bottom gradient colors (sky → horizon). */
  colors: [RGB, RGB, RGB];
}

const hexToRgb = (hex: string): RGB => {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
};

const k = (
  hour: number,
  top: string,
  mid: string,
  bottom: string
): GradientKeyframe => ({
  hour,
  colors: [hexToRgb(top), hexToRgb(mid), hexToRgb(bottom)],
});

// Keyframes across the day. Ordered by hour; the renderer wraps around so the
// 21:00 dusk smoothly returns to the 0:00 deep night.
const DAY_NIGHT_KEYFRAMES: GradientKeyframe[] = [
  k(0, "#0a0f2c", "#11163a", "#1c2350"), // deep night
  k(5, "#1a1f44", "#3a2f55", "#5a3a63"), // pre-dawn
  k(6.5, "#5b6a9e", "#b98aa0", "#f0a878"), // dawn
  k(8, "#3a7bd5", "#6fb1e3", "#cfe8f5"), // morning
  k(12, "#2980d9", "#6dd5fa", "#d6f0ff"), // midday
  k(16, "#2e8bd6", "#87cefa", "#eaf6ff"), // afternoon
  k(18, "#5b6aa0", "#e8896f", "#f2b15a"), // golden hour
  k(19.5, "#2a2350", "#7a3b6e", "#c75b54"), // sunset
  k(21, "#14123a", "#2a2350", "#422a5a"), // dusk
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const lerpRgb = (a: RGB, b: RGB, t: number): RGB => [
  Math.round(lerp(a[0], b[0], t)),
  Math.round(lerp(a[1], b[1], t)),
  Math.round(lerp(a[2], b[2], t)),
];

const rgbToCss = ([r, g, b]: RGB) => `rgb(${r}, ${g}, ${b})`;

/** Compute the interpolated [top, mid, bottom] colors for a given time. */
export function getDayNightGradientColors(date: Date = new Date()): [RGB, RGB, RGB] {
  const hour = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;

  const frames = DAY_NIGHT_KEYFRAMES;
  // Find the surrounding keyframes (with wraparound past the last one).
  let start = frames[frames.length - 1];
  let end = frames[0];
  let startHour = start.hour - 24; // place the wrap-around frame before 0
  let endHour = end.hour;

  for (let i = 0; i < frames.length; i++) {
    const cur = frames[i];
    const next = frames[(i + 1) % frames.length];
    const curHour = cur.hour;
    const nextHour = i + 1 < frames.length ? next.hour : 24 + frames[0].hour;
    if (hour >= curHour && hour < nextHour) {
      start = cur;
      end = next;
      startHour = curHour;
      endHour = nextHour;
      break;
    }
  }

  const span = endHour - startHour;
  const t = span > 0 ? (hour - startHour) / span : 0;

  return [
    lerpRgb(start.colors[0], end.colors[0], t),
    lerpRgb(start.colors[1], end.colors[1], t),
    lerpRgb(start.colors[2], end.colors[2], t),
  ];
}

/** Build a CSS `linear-gradient(...)` string for the current time of day. */
export function getDayNightGradientCss(date: Date = new Date()): string {
  const [top, mid, bottom] = getDayNightGradientColors(date);
  return `linear-gradient(to bottom, ${rgbToCss(top)} 0%, ${rgbToCss(
    mid
  )} 55%, ${rgbToCss(bottom)} 100%)`;
}
