import { describe, expect, test } from "bun:test";
import {
  normalizeWallpaperAccentColor,
  resolveWallpaperAccentFromPalette,
  WALLPAPER_ACCENT_LIGHTNESS,
  WALLPAPER_ACCENT_SATURATION,
  wallpaperAccentHsl,
} from "../src/themes/wallpaperAccentColor";

function hueDelta(a: number, b: number): number {
  const delta = Math.abs(a - b) % 360;
  return delta > 180 ? 360 - delta : delta;
}

function expectLightnessInBand(hex: string) {
  const { l } = wallpaperAccentHsl(hex);
  expect(l).toBeGreaterThanOrEqual(WALLPAPER_ACCENT_LIGHTNESS.min);
  expect(l).toBeLessThanOrEqual(WALLPAPER_ACCENT_LIGHTNESS.max);
}

describe("wallpaper accent color normalization", () => {
  test("dark wallpaper lifts lightness into the middle band while keeping hue", () => {
    const source = "#1a237e";
    const accent = normalizeWallpaperAccentColor(source);
    const sourceHsl = wallpaperAccentHsl(source);
    const accentHsl = wallpaperAccentHsl(accent);

    expectLightnessInBand(accent);
    expect(hueDelta(sourceHsl.h, accentHsl.h)).toBeLessThanOrEqual(5);
    expect(accentHsl.s).toBeGreaterThanOrEqual(
      WALLPAPER_ACCENT_SATURATION.colorfulMin
    );
  });

  test("light wallpaper lowers lightness into the middle band while keeping hue", () => {
    const source = "#ffd6e8";
    const accent = normalizeWallpaperAccentColor(source);
    const sourceHsl = wallpaperAccentHsl(source);
    const accentHsl = wallpaperAccentHsl(accent);

    expectLightnessInBand(accent);
    expect(hueDelta(sourceHsl.h, accentHsl.h)).toBeLessThanOrEqual(5);
    expect(accentHsl.s).toBeGreaterThanOrEqual(
      WALLPAPER_ACCENT_SATURATION.colorfulMin
    );
  });

  test("saturated wallpaper preserves hue and lands in the lightness band", () => {
    const source = "#e60026";
    const accent = normalizeWallpaperAccentColor(source);
    const sourceHsl = wallpaperAccentHsl(source);
    const accentHsl = wallpaperAccentHsl(accent);

    expectLightnessInBand(accent);
    expect(hueDelta(sourceHsl.h, accentHsl.h)).toBeLessThanOrEqual(5);
    expect(accentHsl.s).toBeGreaterThanOrEqual(
      WALLPAPER_ACCENT_SATURATION.colorfulMin
    );
  });

  test("low-chroma wallpaper becomes a graphite-like neutral without false color", () => {
    const accent = normalizeWallpaperAccentColor("#808080");
    const { s, l } = wallpaperAccentHsl(accent);

    expect(s).toBeLessThanOrEqual(WALLPAPER_ACCENT_SATURATION.neutralTint);
    expect(l).toBeGreaterThanOrEqual(WALLPAPER_ACCENT_LIGHTNESS.target);
    // Faint tint only — channels stay close (not a false full-chroma accent).
    const [r, g, b] = [
      parseInt(accent.slice(1, 3), 16),
      parseInt(accent.slice(3, 5), 16),
      parseInt(accent.slice(5, 7), 16),
    ];
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThanOrEqual(12);
  });

  test("near-black neutral wallpaper does not collapse to pure black", () => {
    const accent = normalizeWallpaperAccentColor("#101010");
    const { s, l } = wallpaperAccentHsl(accent);

    expect(l).toBeGreaterThanOrEqual(WALLPAPER_ACCENT_LIGHTNESS.target);
    expect(s).toBeLessThanOrEqual(WALLPAPER_ACCENT_SATURATION.neutralTint);
  });

  test("near-white neutral wallpaper does not stay washed out", () => {
    const accent = normalizeWallpaperAccentColor("#f5f5f5");
    const { s, l } = wallpaperAccentHsl(accent);

    expect(l).toBeGreaterThanOrEqual(WALLPAPER_ACCENT_LIGHTNESS.target);
    expect(s).toBeLessThanOrEqual(WALLPAPER_ACCENT_SATURATION.neutralTint);
  });

  test("colorful wallpaper already in the band keeps its lightness", () => {
    const source = "#2765ca";
    const accent = normalizeWallpaperAccentColor(source);
    const sourceHsl = wallpaperAccentHsl(source);
    const accentHsl = wallpaperAccentHsl(accent);

    expectLightnessInBand(accent);
    expect(Math.abs(accentHsl.l - sourceHsl.l)).toBeLessThan(0.02);
    expect(hueDelta(sourceHsl.h, accentHsl.h)).toBeLessThanOrEqual(2);
  });

  test("resolveWallpaperAccentFromPalette normalizes the picked primary color", () => {
    const accent = resolveWallpaperAccentFromPalette([
      "#050a30",
      "#1a237e",
      "#3949ab",
    ]);
    expectLightnessInBand(accent);
    const accentHsl = wallpaperAccentHsl(accent);
    expect(hueDelta(wallpaperAccentHsl("#1a237e").h, accentHsl.h)).toBeLessThanOrEqual(
      15
    );
  });

  test("invalid input falls back to the stock blue accent", () => {
    expect(normalizeWallpaperAccentColor("not-a-color")).toBe("#2765ca");
    expect(resolveWallpaperAccentFromPalette([])).toBe("#2765ca");
  });
});
