import { normalizeAccentHex } from "@/themes/accents";
import { pickPrimaryColor } from "@/apps/ipod/components/lyrics-display/colorUtils";

type Rgb = { r: number; g: number; b: number };
type Hsl = { h: number; s: number; l: number };

/**
 * Tunable targets for wallpaper-derived accent colors.
 *
 * Stock manual accents (blue #2765ca, purple #8344c4, red #d23b30, etc.) sit
 * around HSL lightness 0.45–0.52. We normalize extracted wallpaper colors into
 * that band so selections stay readable on both light and dark Aqua/System 7
 * chrome without washing out or sinking into near-black.
 */
export const WALLPAPER_ACCENT_LIGHTNESS = {
  /** Ideal lightness — aligned with the default Aqua blue accent. */
  target: 0.48,
  /** Inclusive band; colors already inside are kept (hue/chroma preserved). */
  min: 0.4,
  max: 0.52,
} as const;

/**
 * Saturation guards for colorful vs neutral wallpaper samples.
 *
 * Below `neutralMax` we treat the sample as achromatic and emit a graphite-like
 * neutral. Colorful samples are lifted to at least `colorfulMin` so a vivid
 * wallpaper does not collapse into a muddy gray accent.
 */
export const WALLPAPER_ACCENT_SATURATION = {
  neutralMax: 0.12,
  /** Faint tint retained on neutral wallpapers (graphite is ~6% sat). */
  neutralTint: 0.06,
  colorfulMin: 0.38,
  colorfulMax: 0.72,
} as const;

/** Fallback when palette extraction yields nothing usable. */
export const WALLPAPER_ACCENT_FALLBACK = "#2765ca";

function parseHex(hex: string): Rgb {
  const clean = hex.replace("#", "");
  const value =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function rgbToHex({ r, g, b }: Rgb): string {
  return `#${clampByte(r).toString(16).padStart(2, "0")}${clampByte(g)
    .toString(16)
    .padStart(2, "0")}${clampByte(b).toString(16).padStart(2, "0")}`;
}

function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  const lightness = (max + min) / 2;
  let hue = 0;

  if (delta !== 0) {
    if (max === rn) hue = ((gn - bn) / delta) % 6;
    else if (max === gn) hue = (bn - rn) / delta + 2;
    else hue = (rn - gn) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }

  const saturation =
    delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));

  return { h: hue, s: saturation, l: lightness };
}

function hslToRgb({ h, s, l }: Hsl): Rgb {
  if (s === 0) {
    const value = clampByte(l * 255);
    return { r: value, g: value, b: value };
  }

  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };

  const hn = h / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return {
    r: clampByte(hue2rgb(p, q, hn + 1 / 3) * 255),
    g: clampByte(hue2rgb(p, q, hn) * 255),
    b: clampByte(hue2rgb(p, q, hn - 1 / 3) * 255),
  };
}

function normalizeLightness(lightness: number): number {
  const { min, max, target } = WALLPAPER_ACCENT_LIGHTNESS;
  if (lightness >= min && lightness <= max) return lightness;
  return target;
}

function normalizeNeutralAccent(hsl: Hsl): string {
  const { neutralTint } = WALLPAPER_ACCENT_SATURATION;
  const { target } = WALLPAPER_ACCENT_LIGHTNESS;
  // Graphite-like neutral: mid lightness; only keep a tint when the source had one.
  const tint =
    hsl.s <= 0 ? 0 : Math.min(hsl.s, neutralTint);
  const tinted = hslToRgb({
    h: hsl.h,
    s: tint,
    l: Math.max(target, 0.54),
  });
  return rgbToHex(tinted);
}

/**
 * Normalize a sampled wallpaper hex for use as a UI accent.
 *
 * Preserves hue (and chroma where present) while pulling lightness into
 * {@link WALLPAPER_ACCENT_LIGHTNESS}. Neutral / near-black / near-white inputs
 * are handled without inventing false chroma.
 */
export function normalizeWallpaperAccentColor(
  hex: string | null | undefined
): string {
  const normalized = normalizeAccentHex(hex);
  if (!normalized) return WALLPAPER_ACCENT_FALLBACK;

  const hsl = rgbToHsl(parseHex(normalized));
  const { neutralMax, colorfulMin, colorfulMax } = WALLPAPER_ACCENT_SATURATION;

  if (hsl.s <= neutralMax) {
    return normalizeNeutralAccent(hsl);
  }

  const saturation = Math.min(
    Math.max(hsl.s, colorfulMin),
    colorfulMax
  );
  const lightness = normalizeLightness(hsl.l);

  return rgbToHex(
    hslToRgb({
      h: hsl.h,
      s: saturation,
      l: lightness,
    })
  );
}

/** Pick + normalize the accent color from an extracted wallpaper palette. */
export function resolveWallpaperAccentFromPalette(palette: string[]): string {
  if (palette.length === 0) return WALLPAPER_ACCENT_FALLBACK;
  return normalizeWallpaperAccentColor(pickPrimaryColor(palette));
}

/** @internal Exported for unit tests. */
export function wallpaperAccentHsl(hex: string): Hsl {
  const normalized = normalizeAccentHex(hex);
  if (!normalized) throw new Error(`Invalid hex: ${hex}`);
  return rgbToHsl(parseHex(normalized));
}
