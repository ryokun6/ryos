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
//   - `dynamic://weather`            — a dedicated time-of-day gradient per live
//     local weather condition (clear, cloudy, rain, snow, fog, storm).
//   - `dynamic://cover`              — the now-playing cover art of the iPod or
//     Karaoke (falls back to the paused cover).
//   - `dynamic://lyrics`            — the now-playing synced lyrics over the same
//     animated mesh-gradient ("gradient paper") shader used by the music apps.
//   - `shuffle://photos/<category>`  — a photo from a picker category, swapped
//     every {@link SHUFFLE_INTERVAL_MS}.
//   - `shuffle://tiles`              — a tiled pattern, rotated likewise.
//   - `shuffle://videos`             — a video wallpaper, rotated likewise.
//
// Shuffle picks are *deterministic* for a given (user, descriptor, wall-clock
// bucket): every device signed into the same account resolves the same concrete
// asset at the same time, so the desktop stays in sync across a user's devices
// (see `pickDeterministicCandidate` and `useShuffleWallpaper`).

import type { WallpaperManifest } from "@/utils/wallpapers";

export const DYNAMIC_PREFIX = "dynamic://";
export const SHUFFLE_PREFIX = "shuffle://";

export const DAY_NIGHT_GRADIENT_WALLPAPER = "dynamic://gradient/day-night";
export const WEATHER_WALLPAPER = "dynamic://weather";
export const COVER_WALLPAPER = "dynamic://cover";
export const LYRICS_WALLPAPER = "dynamic://lyrics";

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

export function isWeatherWallpaper(
  wallpaper: string | undefined | null
): boolean {
  return wallpaper === WEATHER_WALLPAPER;
}

export function isCoverWallpaper(wallpaper: string | undefined | null): boolean {
  return wallpaper === COVER_WALLPAPER;
}

export function isLyricsWallpaper(
  wallpaper: string | undefined | null
): boolean {
  return wallpaper === LYRICS_WALLPAPER;
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

/**
 * Wall-clock bucket index for shuffle rotation. The bucket advances once every
 * {@link SHUFFLE_INTERVAL_MS} and is aligned to the Unix epoch, so it is the
 * same value on every device at the same instant — the key to keeping a user's
 * devices in sync.
 */
export function shuffleBucket(now: number = Date.now()): number {
  return Math.floor(now / SHUFFLE_INTERVAL_MS);
}

/** Stable 32-bit FNV-1a hash of a string (order-independent of platform). */
function hashString(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const gcd = (a: number, b: number): number => {
  while (b !== 0) [a, b] = [b, a % b];
  return a;
};

/**
 * Deterministically pick a candidate for the current wall-clock bucket.
 *
 * The choice is a pure function of (`seed`, time bucket, candidate list), so
 * every device that shares the same `seed` — i.e. the same signed-in user and
 * shuffle descriptor — lands on the *same* wallpaper at the same time, and
 * rotates in lockstep when the bucket advances. The candidate list comes from
 * the build-time manifest, so its ordering is stable across devices too.
 *
 * To pick an order, the seed derives a starting offset and a stride that is
 * coprime to the candidate count. Walking by that stride each bucket visits
 * every wallpaper exactly once before repeating and never shows the same asset
 * in two consecutive buckets — all while staying deterministic, so a user's
 * devices agree on the full sequence, not just the current frame.
 */
export function pickDeterministicCandidate(
  candidates: string[],
  seed: string,
  now: number = Date.now()
): string | null {
  const len = candidates.length;
  if (len === 0) return null;
  if (len === 1) return candidates[0];
  const bucket = shuffleBucket(now);
  const base = hashString(`${seed}#base`) % len;
  // Stride in [1, len-1], then bumped to the next value coprime to `len` so the
  // walk is a full-cycle permutation (visits all before repeating).
  let stride = 1 + (hashString(`${seed}#stride`) % (len - 1));
  while (gcd(stride, len) !== 1) stride = (stride % (len - 1)) + 1;
  // Reduce factors before multiplying to keep the arithmetic small and exact.
  const idx = (base + ((bucket % len) * (stride % len)) % len) % len;
  return candidates[idx];
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

/**
 * Interpolate a [top, mid, bottom] gradient from a set of time-of-day keyframes.
 * Keyframes are ordered by hour; the renderer wraps around so the last frame
 * (e.g. dusk) blends smoothly back into the first (deep night).
 */
function interpolateGradientKeyframes(
  frames: GradientKeyframe[],
  date: Date
): [RGB, RGB, RGB] {
  const hour = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;

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

/** Compute the interpolated [top, mid, bottom] colors for a given time. */
export function getDayNightGradientColors(date: Date = new Date()): [RGB, RGB, RGB] {
  return interpolateGradientKeyframes(DAY_NIGHT_KEYFRAMES, date);
}

/** Build a CSS `linear-gradient(...)` string for the current time of day. */
export function getDayNightGradientCss(date: Date = new Date()): string {
  const [top, mid, bottom] = getDayNightGradientColors(date);
  return `linear-gradient(to bottom, ${rgbToCss(top)} 0%, ${rgbToCss(
    mid
  )} 55%, ${rgbToCss(bottom)} 100%)`;
}

// ---------------------------------------------------------------------------
// Weather gradient
//
// Each weather condition has its *own* set of time-of-day gradient keyframes
// (not a tint applied over the day/night sky). Every family still shifts
// through night → dawn → day → dusk, but with bespoke palettes: clear reads
// vivid blue, an overcast sky reads soft & hazy, fog washes out to pale grey,
// rain/drizzle go moody blue-grey, snow stays bright & cool, and storms turn
// dark and ominous.
// ---------------------------------------------------------------------------

export type WeatherFamily =
  | "clear"
  | "partlyCloudy"
  | "fog"
  | "drizzle"
  | "rain"
  | "snow"
  | "thunderstorm";

const WEATHER_KEYFRAMES: Record<WeatherFamily, GradientKeyframe[]> = {
  // Vivid clear sky: deep starry night → warm sunrise → bright blue → dusk.
  clear: [
    k(0, "#06091f", "#0d1336", "#18204c"),
    k(6.5, "#4a5a92", "#d49a86", "#f6b46a"),
    k(9, "#2a86dd", "#6cc3f3", "#d3efff"),
    k(16, "#2f8ed8", "#79c6f7", "#e0f3ff"),
    k(18.5, "#46518e", "#ef946b", "#ffc25d"),
    k(21, "#11103a", "#281f4e", "#41305f"),
  ],
  // Soft, hazy partly-cloudy / overcast sky — muted blues and warm greys.
  partlyCloudy: [
    k(0, "#12162e", "#1d2340", "#2c3253"),
    k(6.5, "#6b7390", "#c3a4a6", "#e6c29b"),
    k(9, "#6191c0", "#a3c7dd", "#dde9f0"),
    k(16, "#6a97c0", "#aacbe0", "#e3eef3"),
    k(18.5, "#5e6489", "#d4a18d", "#eec196"),
    k(21, "#1c1f3e", "#33304e", "#4a4560"),
  ],
  // Fog: low-contrast, washed-out pale grey.
  fog: [
    k(0, "#1f222a", "#2a2e37", "#393e47"),
    k(6.5, "#888891", "#aaa6a4", "#c9c3bd"),
    k(9, "#9ba4ac", "#c3c9cd", "#e4e7e9"),
    k(16, "#a0a8af", "#c8cdd0", "#e8eaec"),
    k(18.5, "#85848d", "#b1a49e", "#d3c7be"),
    k(21, "#2d2e37", "#44444e", "#5a5862"),
  ],
  // Drizzle: cool, slightly subdued blue-grey.
  drizzle: [
    k(0, "#111720", "#1a222d", "#27313d"),
    k(6.5, "#50616c", "#7b858e", "#9ca5aa"),
    k(9, "#5d7282", "#8da2ae", "#c4cfd4"),
    k(16, "#607585", "#91a4b0", "#cbd5d9"),
    k(18.5, "#4b5661", "#707782", "#94979d"),
    k(21, "#171e27", "#26303b", "#38424e"),
  ],
  // Rain: darker, moody deep blue-grey.
  rain: [
    k(0, "#0b1017", "#131a23", "#1e2731"),
    k(6.5, "#3b4752", "#596775", "#75818b"),
    k(9, "#45555f", "#6d7e89", "#98a5ac"),
    k(16, "#485963", "#71828d", "#9ca9b0"),
    k(18.5, "#394350", "#535d67", "#6f767e"),
    k(21, "#10161e", "#1e262f", "#2b343f"),
  ],
  // Snow: bright, cool, pale blue-white.
  snow: [
    k(0, "#1d2634", "#2e3949", "#44505e"),
    k(6.5, "#8b94a4", "#babfc9", "#dee1e7"),
    k(9, "#a1b2c4", "#cfd9e3", "#eff4f8"),
    k(16, "#a6b6c7", "#d3dce5", "#f2f6f9"),
    k(18.5, "#828a9b", "#aeb4c2", "#d6dae1"),
    k(21, "#222937", "#37404e", "#505a69"),
  ],
  // Thunderstorm: dark and ominous, purple-grey.
  thunderstorm: [
    k(0, "#07090f", "#0d0f17", "#161924"),
    k(6.5, "#2a2b3a", "#3a394b", "#4c495d"),
    k(9, "#313246", "#45424f", "#58535f"),
    k(16, "#33344a", "#474450", "#5a5560"),
    k(18.5, "#29283a", "#3b3548", "#4e4257"),
    k(21, "#0b0c15", "#15141e", "#211e2b"),
  ],
};

/** Map a WMO weather code to a gradient family. */
export function weatherCodeToFamily(
  code: number | null | undefined
): WeatherFamily {
  if (code == null) return "clear";
  if (code === 0) return "clear";
  if (code <= 3) return "partlyCloudy";
  if (code <= 48) return "fog";
  if (code <= 57) return "drizzle";
  if (code <= 67) return "rain";
  if (code <= 77) return "snow";
  if (code <= 82) return "rain"; // rain showers
  if (code <= 86) return "snow"; // snow showers
  if (code <= 99) return "thunderstorm";
  return "clear";
}

/**
 * Compute the [top, mid, bottom] gradient colors for the supplied weather code
 * at the given time of day, using that condition's dedicated palette. A
 * `null`/`undefined` code (e.g. while the live weather is still loading) falls
 * back to the clear-sky gradient.
 */
export function getWeatherGradientColors(
  code: number | null | undefined,
  date: Date = new Date()
): [RGB, RGB, RGB] {
  const frames = WEATHER_KEYFRAMES[weatherCodeToFamily(code)];
  return interpolateGradientKeyframes(frames, date);
}

/** Build a CSS `linear-gradient(...)` string for the current time + weather. */
export function getWeatherGradientCss(
  code: number | null | undefined,
  date: Date = new Date()
): string {
  const [top, mid, bottom] = getWeatherGradientColors(code, date);
  return `linear-gradient(to bottom, ${rgbToCss(top)} 0%, ${rgbToCss(
    mid
  )} 55%, ${rgbToCss(bottom)} 100%)`;
}
