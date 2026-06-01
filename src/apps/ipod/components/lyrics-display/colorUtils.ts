import { GOLD_GLOW_COLOR_FALLBACK } from "./constants";

/**
 * Glow color used when the cover art is essentially black & white / grayscale.
 * Without a meaningful hue, a white glow reads far better than a fabricated one.
 */
export const NEUTRAL_GLOW_COLOR = "#f2f2f2";

/**
 * Saturation below this (0-1) is treated as "no real hue" (grayscale-ish).
 * Picking/boosting a hue from such a color produced arbitrary results (red),
 * so these collapse to a neutral white glow instead.
 */
const GRAYSCALE_SATURATION_THRESHOLD = 0.15;

/**
 * Minimum relative (perceptual) luminance for a boosted glow color. Dark hues
 * such as deep blue/purple can sit at HSL lightness ~0.5 yet read as nearly
 * black; we lift their lightness until they clear this floor so every glow has
 * enough brightness to "pop" against the dark lyrics backdrop.
 */
const MIN_GLOW_LUMINANCE = 0.5;

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return hexToRgb(GOLD_GLOW_COLOR_FALLBACK);
  return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
}

function rgbToHex(r: number, g: number, b: number): string {
  const toByte = (x: number) =>
    Math.round(Math.max(0, Math.min(255, x)))
      .toString(16)
      .padStart(2, "0");
  return `#${toByte(r)}${toByte(g)}${toByte(b)}`;
}

/** RGB (0-255) → HSL, each channel normalized to 0-1. */
function rgbToHsl(
  r: number,
  g: number,
  b: number
): { h: number; s: number; l: number } {
  const rn = r / 255,
    gn = g / 255,
    bn = b / 255;
  const max = Math.max(rn, gn, bn),
    min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + 6) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h /= 6;
  return { h, s, l };
}

/** HSL (0-1) → RGB (0-255). */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

/** Relative (perceptual) luminance, 0-1. Weights the eye's green sensitivity. */
function relativeLuminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/**
 * Pick the most vibrant, well-lit color from a palette.
 *
 * - Strongly prefers saturated colors with mid lightness (avoids near-black and
 *   near-white swatches that make weak glows).
 * - When the whole palette is essentially grayscale (black & white cover art),
 *   there is no meaningful hue, so we return a neutral color that boosts to a
 *   white glow instead of an arbitrary one.
 */
export function pickPrimaryColor(palette: string[]): string {
  let best = palette[0] ?? GOLD_GLOW_COLOR_FALLBACK;
  let bestScore = -Infinity;
  let maxSaturation = 0;

  for (const hex of palette) {
    const [r, g, b] = hexToRgb(hex);
    const { s, l } = rgbToHsl(r, g, b);
    maxSaturation = Math.max(maxSaturation, s);

    // Reward lightness near 0.55 (vivid yet bright); fall off toward 0 and 1.
    const lightnessScore = Math.max(0, 1 - Math.abs(l - 0.55) * 2);
    const score = s * 0.75 + lightnessScore * 0.25;
    if (score > bestScore) {
      bestScore = score;
      best = hex;
    }
  }

  // Grayscale cover → white glow rather than a fabricated hue.
  if (maxSaturation < GRAYSCALE_SATURATION_THRESHOLD) return NEUTRAL_GLOW_COLOR;

  return best;
}

/**
 * Boost a hex color so it reads as a vivid glow.
 *
 * - Grayscale/near-grayscale inputs keep a neutral hue (white-ish) instead of
 *   collapsing to red, which the old `delta === 0 → hue 0` path produced.
 * - Saturation is lifted into a vivid range without over-saturating.
 * - Lightness is clamped and then raised, if needed, until the color clears a
 *   perceptual-luminance floor so dark hues (deep blue/purple) stay legible.
 */
export function boostGlowColor(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  const { h, s, l } = rgbToHsl(r, g, b);

  // No meaningful hue: return a bright neutral so the glow reads as white.
  if (s < GRAYSCALE_SATURATION_THRESHOLD) {
    const neutralL = Math.max(l, 0.9);
    const [nr, ng, nb] = hslToRgb(0, 0, neutralL);
    return rgbToHex(nr, ng, nb);
  }

  const boostedS = Math.min(0.95, Math.max(s, 0.7));
  let boostedL = Math.min(0.7, Math.max(l, 0.58));

  // Lift lightness for perceptually dark hues until the glow is bright enough.
  for (let i = 0; i < 10 && boostedL < 0.85; i++) {
    const [tr, tg, tb] = hslToRgb(h, boostedS, boostedL);
    if (relativeLuminance(tr, tg, tb) >= MIN_GLOW_LUMINANCE) break;
    boostedL += 0.03;
  }

  const [ro, go, bo] = hslToRgb(h, boostedS, boostedL);
  return rgbToHex(ro, go, bo);
}

/** Generate glow CSS values from a hex color */
export function makeGlowFromColor(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  return {
    color: hex,
    shadow: `0 0 8px rgba(${r},${g},${b},0.8), 0 0 16px rgba(${r},${g},${b},0.4), 0 0 6px rgba(0,0,0,0.5)`,
    filter: `drop-shadow(0 0 8px rgba(${r},${g},${b},0.5))`,
    baseColor: `rgba(${r},${g},${b},0.6)`,
  };
}
