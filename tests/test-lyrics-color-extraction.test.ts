import { describe, expect, test } from "bun:test";
import {
  boostGlowColor,
  getNewCoverColorToSave,
  makeOutlineFillFromGlowColor,
  normalizeCoverColor,
  pickPrimaryColor,
  resolveCoverGlowColor,
} from "../src/apps/ipod/components/lyrics-display/colorUtils";
import { shouldExtractCoverGlowColor } from "../src/hooks/useCoverGlowColor";
import { completeCoverPalette } from "../src/hooks/useCoverPalette";

function hexToRgb(hex: string): [number, number, number] {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) throw new Error(`Invalid hex color: ${hex}`);
  return [
    Number.parseInt(match[1]!, 16),
    Number.parseInt(match[2]!, 16),
    Number.parseInt(match[3]!, 16),
  ];
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  const linear = (channel: number) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function hueOf(hex: string): number {
  const [red, green, blue] = hexToRgb(hex);
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  if (delta === 0) return 0;
  if (max === r) return (((g - b) / delta + 6) % 6) / 6;
  if (max === g) return ((b - r) / delta + 2) / 6;
  return ((r - g) / delta + 4) / 6;
}

function hueDistance(a: number, b: number): number {
  const distance = Math.abs(a - b);
  return Math.min(distance, 1 - distance);
}

describe("lyrics color extraction", () => {
  test("keeps black and white cover palettes neutral instead of falling back warm", () => {
    const palette = completeCoverPalette(["#000000", "#ffffff"]);

    expect(palette).toHaveLength(7);
    expect(palette).toContain("#ffffff");
    expect(palette).not.toContain("#9c2b2b");
    expect(pickPrimaryColor(palette)).toBe("#ffffff");
  });

  test("pads single-color neutral covers without introducing warm defaults", () => {
    const palette = completeCoverPalette(["#000000"]);

    expect(palette).toHaveLength(7);
    expect(palette).toContain("#ffffff");
    expect(palette).not.toContain("#9c2b2b");
    expect(pickPrimaryColor(palette)).toBe("#ffffff");
  });

  test("chooses white for purely black and white lyrics glow palettes", () => {
    expect(pickPrimaryColor(["#000000", "#ffffff"])).toBe("#ffffff");
    expect(boostGlowColor("#ffffff")).toBe("#ffffff");
  });

  test("does not turn grayscale colors red when boosting glow", () => {
    const boosted = boostGlowColor("#101010");
    const [r, g, b] = hexToRgb(boosted);

    expect(r).toBe(g);
    expect(g).toBe(b);
    expect(r).toBeGreaterThanOrEqual(224);
  });

  test("lifts dark saturated colors to a readable glow luminance", () => {
    const boosted = boostGlowColor("#1a237e");

    expect(relativeLuminance(boosted)).toBeGreaterThanOrEqual(0.34);
  });

  test("normalizes cached cover colors before reuse", () => {
    expect(normalizeCoverColor("  #AABBCC  ")).toBe("#aabbcc");
    expect(normalizeCoverColor("aabbcc")).toBeUndefined();
    expect(normalizeCoverColor("#abc")).toBeUndefined();
  });

  test("resolves the boosted cover glow color from a palette", () => {
    expect(resolveCoverGlowColor(["#1a237e"])).toBe(boostGlowColor("#1a237e"));
  });

  test("derives outlined karaoke fills as a darker version of the cover glow hue", () => {
    const glow = boostGlowColor("#1a237e");
    const fill = makeOutlineFillFromGlowColor(glow);

    expect(relativeLuminance(fill)).toBeLessThan(relativeLuminance(glow));
    expect(hueDistance(hueOf(fill), hueOf(glow))).toBeLessThan(0.01);
  });

  test("keeps neutral outlined karaoke fills grayscale and darker than glow", () => {
    const glow = boostGlowColor("#101010");
    const fill = makeOutlineFillFromGlowColor(glow);
    const [r, g, b] = hexToRgb(fill);

    expect(r).toBe(g);
    expect(g).toBe(b);
    expect(relativeLuminance(fill)).toBeLessThan(relativeLuminance(glow));
  });

  test("does not extract a cover glow color when a cached color exists", () => {
    expect(shouldExtractCoverGlowColor(true, "#123456")).toBe(false);
    expect(shouldExtractCoverGlowColor(true, "  #ABCDEF  ")).toBe(false);
    expect(shouldExtractCoverGlowColor(true, undefined)).toBe(true);
    expect(shouldExtractCoverGlowColor(false, undefined)).toBe(false);
  });

  test("does not save a resolved cover color over a cached color", () => {
    expect(getNewCoverColorToSave("#abcdef", "#123456")).toBeUndefined();
    expect(getNewCoverColorToSave("#abcdef", "  #123456  ")).toBeUndefined();
    expect(getNewCoverColorToSave("#ABCDEF", undefined)).toBe("#abcdef");
  });
});
