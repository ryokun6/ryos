import { describe, expect, test } from "bun:test";
import {
  boostGlowColor,
  makeGlowFromColor,
  NEUTRAL_GLOW_COLOR,
  pickPrimaryColor,
} from "@/apps/ipod/components/lyrics-display/colorUtils";

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`bad hex: ${hex}`);
  return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
}

function rgbToHsl(r: number, g: number, b: number) {
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
  return { h: h / 6, s, l };
}

const relativeLuminance = (hex: string) => {
  const [r, g, b] = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
};

const isGray = (hex: string) => {
  const [r, g, b] = hexToRgb(hex);
  return Math.abs(r - g) <= 3 && Math.abs(g - b) <= 3 && Math.abs(r - b) <= 3;
};

describe("lyrics color extraction", () => {
  test("black & white palette resolves to a white-ish glow, not red", () => {
    const grayscale = [
      "#000000",
      "#1a1a1a",
      "#444444",
      "#808080",
      "#bbbbbb",
      "#eeeeee",
      "#ffffff",
    ];
    const primary = pickPrimaryColor(grayscale);
    expect(primary).toBe(NEUTRAL_GLOW_COLOR);

    const boosted = boostGlowColor(primary);
    // Must stay neutral (gray/white), never a fabricated red.
    expect(isGray(boosted)).toBe(true);
    const [r, g, b] = hexToRgb(boosted);
    expect(r).toBeGreaterThan(200);
    expect(g).toBeGreaterThan(200);
    expect(b).toBeGreaterThan(200);
  });

  test("a single mid-gray color does not boost into red", () => {
    const boosted = boostGlowColor("#808080");
    expect(isGray(boosted)).toBe(true);
  });

  test("every boosted glow clears a perceptual brightness floor", () => {
    const darkHues = [
      "#00008b", // dark blue
      "#1a0033", // deep purple
      "#003300", // dark green
      "#330000", // dark red
      "#0000ff", // pure blue (perceptually dark)
    ];
    for (const hex of darkHues) {
      const boosted = boostGlowColor(hex);
      expect(relativeLuminance(boosted)).toBeGreaterThanOrEqual(0.49);
    }
  });

  test("boosting preserves hue for saturated colors", () => {
    const boosted = boostGlowColor("#0a3a8c"); // a muted blue
    const { h, s } = rgbToHsl(...hexToRgb(boosted));
    // Hue should remain in the blue range (~0.55-0.72), not collapse to red (~0).
    expect(h).toBeGreaterThan(0.5);
    expect(h).toBeLessThan(0.75);
    // Saturation should be lifted into the vivid range.
    expect(s).toBeGreaterThanOrEqual(0.7);
  });

  test("pickPrimaryColor favors the vibrant swatch over dark/washed ones", () => {
    const palette = [
      "#0a0a0a", // near black (most frequent but useless)
      "#f5f5f5", // near white
      "#d83b3b", // vibrant red
      "#222222",
    ];
    expect(pickPrimaryColor(palette)).toBe("#d83b3b");
  });

  test("makeGlowFromColor returns usable CSS strings", () => {
    const glow = makeGlowFromColor("#ff8800");
    expect(glow.color).toBe("#ff8800");
    expect(glow.shadow).toContain("rgba(255,136,0");
    expect(glow.baseColor).toBe("rgba(255,136,0,0.6)");
  });
});
