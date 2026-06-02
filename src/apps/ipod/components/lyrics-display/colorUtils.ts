import { GOLD_GLOW_COLOR_FALLBACK } from "./constants";

type Rgb = [number, number, number];
type Hsl = { h: number; s: number; l: number };

const NEUTRAL_SATURATION_MAX = 0.12;
const MIN_GLOW_LIGHTNESS = 0.58;
const MAX_GLOW_LIGHTNESS = 0.72;
const MIN_GLOW_LUMINANCE = 0.34;
const MIN_NEUTRAL_LIGHTNESS = 0.88;
const HEX_COLOR_RE = /^#([0-9a-f]{6})$/i;

export function normalizeCoverColor(hex: string | null | undefined): string | undefined {
  const trimmed = hex?.trim();
  if (!trimmed || !HEX_COLOR_RE.test(trimmed)) return undefined;
  return trimmed.toLowerCase();
}

export function getNewCoverColorToSave(
  resolvedCoverColor: string,
  cachedCoverColor: string | null | undefined
): string | undefined {
  const normalized = normalizeCoverColor(resolvedCoverColor);
  if (!normalized || normalizeCoverColor(cachedCoverColor)) {
    return undefined;
  }
  return normalized;
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return [255, 215, 0];
  return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
}

function rgbToHex([r, g, b]: Rgb): string {
  return `#${r.toString(16).padStart(2, "0")}${g
    .toString(16)
    .padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function rgbToHsl(r: number, g: number, b: number): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));

  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d + 6) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h /= 6;
  }

  return { h, s, l };
}

function hslToRgb({ h, s, l }: Hsl): Rgb {
  if (s === 0) {
    const value = Math.round(l * 255);
    return [value, value, value];
  }

  const hsl2rgb = (p: number, q: number, t: number) => {
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
    Math.round(hsl2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hsl2rgb(p, q, h) * 255),
    Math.round(hsl2rgb(p, q, h - 1 / 3) * 255),
  ];
}

function relativeLuminance(r: number, g: number, b: number): number {
  const linear = (channel: number) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function ensureMinimumLuminance([r, g, b]: Rgb): Rgb {
  let next: Rgb = [r, g, b];
  let luminance = relativeLuminance(...next);

  while (luminance < MIN_GLOW_LUMINANCE) {
    next = [
      Math.round(next[0] + (255 - next[0]) * 0.12),
      Math.round(next[1] + (255 - next[1]) * 0.12),
      Math.round(next[2] + (255 - next[2]) * 0.12),
    ];
    const updatedLuminance = relativeLuminance(...next);
    if (updatedLuminance <= luminance) break;
    luminance = updatedLuminance;
  }

  return next;
}

/** Pick a readable glow source color from the extracted cover palette. */
export function pickPrimaryColor(palette: string[]): string {
  const colors = palette.map((hex) => {
    const [r, g, b] = hexToRgb(hex);
    const hsl = rgbToHsl(r, g, b);
    return {
      hex,
      hsl,
      luminance: relativeLuminance(r, g, b),
    };
  });

  if (colors.length === 0) return GOLD_GLOW_COLOR_FALLBACK;

  const colorful = colors.filter(({ hsl }) => hsl.s > NEUTRAL_SATURATION_MAX);
  if (colorful.length === 0) {
    return colors.reduce((best, color) =>
      color.luminance > best.luminance ? color : best
    ).hex;
  }

  let best = colorful[0]!.hex;
  let bestScore = -1;

  for (const { hex, hsl, luminance } of colorful) {
    const luminanceBoost = Math.min(luminance / MIN_GLOW_LUMINANCE, 1);
    const lightnessBoost = 1 - Math.min(Math.abs(hsl.l - 0.62) / 0.62, 1);
    const score = hsl.s * 0.55 + luminanceBoost * 0.3 + lightnessBoost * 0.15;
    if (score > bestScore) {
      bestScore = score;
      best = hex;
    }
  }
  return best;
}

/** Boost saturation and brightness of a hex color so it pops as a glow */
export function boostGlowColor(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  const hsl = rgbToHsl(r, g, b);

  if (hsl.s <= NEUTRAL_SATURATION_MAX) {
    return rgbToHex(
      hslToRgb({
        h: 0,
        s: 0,
        l: Math.max(hsl.l, MIN_NEUTRAL_LIGHTNESS),
      })
    );
  }

  const boosted = hslToRgb({
    h: hsl.h,
    s: Math.max(hsl.s, 0.85),
    l: Math.max(Math.min(hsl.l, MAX_GLOW_LIGHTNESS), MIN_GLOW_LIGHTNESS),
  });

  return rgbToHex(ensureMinimumLuminance(boosted));
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

export function resolveCoverGlowColor(palette: string[]): string {
  return boostGlowColor(pickPrimaryColor(palette));
}
