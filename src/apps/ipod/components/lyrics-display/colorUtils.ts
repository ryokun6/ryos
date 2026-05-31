import { GOLD_GLOW_COLOR_FALLBACK } from "./constants";

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return [255, 215, 0];
  return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
}

/** RGB → HSL saturation (0-1) */
function rgbSaturation(r: number, g: number, b: number): number {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  if (max === min) return 0;
  const l = (max + min) / 2;
  return l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
}

/** Pick the most vibrant (highest saturation, moderate lightness) color from a palette */
export function pickPrimaryColor(palette: string[]): string {
  let best = palette[0] ?? GOLD_GLOW_COLOR_FALLBACK;
  let bestScore = -1;
  for (const hex of palette) {
    const [r, g, b] = hexToRgb(hex);
    const sat = rgbSaturation(r, g, b);
    const lightness = (r + g + b) / (3 * 255);
    // Prefer saturated colors with moderate lightness (not too dark/light)
    const lightnessBoost = 1 - Math.abs(lightness - 0.5) * 2;
    const score = sat * 0.7 + lightnessBoost * 0.3;
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
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
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
  // Boost saturation to at least 0.85, lightness to at least 0.55
  const boostedS = Math.max(s, 0.85);
  const boostedL = Math.max(Math.min(l, 0.65), 0.55);
  const hsl2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = boostedL < 0.5 ? boostedL * (1 + boostedS) : boostedL + boostedS - boostedL * boostedS;
  const p = 2 * boostedL - q;
  const ro = Math.round(hsl2rgb(p, q, h + 1 / 3) * 255);
  const go = Math.round(hsl2rgb(p, q, h) * 255);
  const bo = Math.round(hsl2rgb(p, q, h - 1 / 3) * 255);
  return `#${ro.toString(16).padStart(2, "0")}${go.toString(16).padStart(2, "0")}${bo.toString(16).padStart(2, "0")}`;
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
