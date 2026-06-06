import { describe, expect, test } from "bun:test";
import { getAccentCssVars } from "../src/themes/accents";
import {
  normalizeWallpaperAccentColor,
  resolveWallpaperAccentFromPalette,
  WALLPAPER_ACCENT_LIGHTNESS,
  WALLPAPER_ACCENT_SATURATION,
} from "../src/themes/wallpaperAccentColor";

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`Invalid hex: ${hex}`);
  const [r, g, b] = [
    parseInt(m[1]!, 16),
    parseInt(m[2]!, 16),
    parseInt(m[3]!, 16),
  ];
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  const l = (max + min) / 2;
  let h = 0;
  if (delta !== 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h = (h * 60 + 360) % 360;
  }
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return { h, s, l };
}

function hueDelta(a: number, b: number): number {
  const delta = Math.abs(a - b) % 360;
  return delta > 180 ? 360 - delta : delta;
}

function expectLightnessInBand(hex: string) {
  const { l } = hexToHsl(hex);
  expect(l).toBeGreaterThanOrEqual(WALLPAPER_ACCENT_LIGHTNESS.min);
  expect(l).toBeLessThanOrEqual(WALLPAPER_ACCENT_LIGHTNESS.max);
}

function hexToRgbTuple(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

describe("wallpaper accent color normalization", () => {
  test("dark wallpaper lifts lightness into the middle band while keeping hue", () => {
    const source = "#1a237e";
    const accent = normalizeWallpaperAccentColor(source);
    const sourceHsl = hexToHsl(source);
    const accentHsl = hexToHsl(accent);

    expectLightnessInBand(accent);
    expect(hueDelta(sourceHsl.h, accentHsl.h)).toBeLessThanOrEqual(5);
    expect(accentHsl.s).toBeGreaterThanOrEqual(
      WALLPAPER_ACCENT_SATURATION.colorfulMin
    );
  });

  test("light wallpaper lowers lightness into the middle band while keeping hue", () => {
    const source = "#ffd6e8";
    const accent = normalizeWallpaperAccentColor(source);
    const sourceHsl = hexToHsl(source);
    const accentHsl = hexToHsl(accent);

    expectLightnessInBand(accent);
    expect(hueDelta(sourceHsl.h, accentHsl.h)).toBeLessThanOrEqual(5);
    expect(accentHsl.s).toBeGreaterThanOrEqual(
      WALLPAPER_ACCENT_SATURATION.colorfulMin
    );
  });

  test("saturated wallpaper preserves hue and lands in the lightness band", () => {
    const source = "#e60026";
    const accent = normalizeWallpaperAccentColor(source);
    const sourceHsl = hexToHsl(source);
    const accentHsl = hexToHsl(accent);

    expectLightnessInBand(accent);
    expect(hueDelta(sourceHsl.h, accentHsl.h)).toBeLessThanOrEqual(5);
    expect(accentHsl.s).toBeGreaterThanOrEqual(
      WALLPAPER_ACCENT_SATURATION.colorfulMin
    );
  });

  test("low-chroma wallpaper becomes a graphite-like neutral without false color", () => {
    const accent = normalizeWallpaperAccentColor("#808080");
    const { s, l } = hexToHsl(accent);

    expect(s).toBeLessThanOrEqual(WALLPAPER_ACCENT_SATURATION.neutralTint);
    expect(l).toBeGreaterThanOrEqual(WALLPAPER_ACCENT_LIGHTNESS.target);
    const [r, g, b] = [
      parseInt(accent.slice(1, 3), 16),
      parseInt(accent.slice(3, 5), 16),
      parseInt(accent.slice(5, 7), 16),
    ];
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThanOrEqual(12);
  });

  test("near-black neutral wallpaper does not collapse to pure black", () => {
    const accent = normalizeWallpaperAccentColor("#101010");
    const { s, l } = hexToHsl(accent);

    expect(l).toBeGreaterThanOrEqual(WALLPAPER_ACCENT_LIGHTNESS.target);
    expect(s).toBeLessThanOrEqual(WALLPAPER_ACCENT_SATURATION.neutralTint);
  });

  test("near-white neutral wallpaper does not stay washed out", () => {
    const accent = normalizeWallpaperAccentColor("#f5f5f5");
    const { s, l } = hexToHsl(accent);

    expect(l).toBeGreaterThanOrEqual(WALLPAPER_ACCENT_LIGHTNESS.target);
    expect(s).toBeLessThanOrEqual(WALLPAPER_ACCENT_SATURATION.neutralTint);
  });

  test("colorful wallpaper already in the lighter band keeps its lightness", () => {
    const source = "#4485d6";
    const accent = normalizeWallpaperAccentColor(source);
    const sourceHsl = hexToHsl(source);
    const accentHsl = hexToHsl(accent);

    expectLightnessInBand(accent);
    expect(Math.abs(accentHsl.l - sourceHsl.l)).toBeLessThan(0.02);
    expect(hueDelta(sourceHsl.h, accentHsl.h)).toBeLessThanOrEqual(2);
  });

  test("light and dark Aqua wallpaper vars both use the lighter sampled base", () => {
    const accent = normalizeWallpaperAccentColor("#1a237e");
    const [r, g, b] = hexToRgbTuple(accent);
    const expectedRgb = `rgba(${r}, ${g}, ${b},`;
    const lightVars = getAccentCssVars("aqua", "wallpaper", false, accent);
    const darkVars = getAccentCssVars("aqua", "wallpaper", true, accent);

    expect(hexToHsl(accent).l).toBeGreaterThan(0.52);
    expect(lightVars["--os-color-selection-bg"]).toStartWith(expectedRgb);
    expect(darkVars["--os-color-selection-bg"]).toStartWith(expectedRgb);
  });

  test("resolveWallpaperAccentFromPalette normalizes the picked primary color", () => {
    const accent = resolveWallpaperAccentFromPalette([
      "#050a30",
      "#1a237e",
      "#3949ab",
    ]);
    expectLightnessInBand(accent);
    expect(hueDelta(hexToHsl("#1a237e").h, hexToHsl(accent).h)).toBeLessThanOrEqual(
      15
    );
  });

  test("invalid input falls back to the stock blue accent", () => {
    expect(normalizeWallpaperAccentColor("not-a-color")).toBe("#2765ca");
    expect(resolveWallpaperAccentFromPalette([])).toBe("#2765ca");
  });
});

describe("assistant chat bubble accent tokens", () => {
  test("default accent emits no assistant bubble overrides", () => {
    expect(getAccentCssVars("aqua", "default", false)).toEqual({});
    expect(getAccentCssVars("system7", "default", false)).toEqual({});
  });

  test("named accent only shifts assistant bubble hue, keeping stock lightness", () => {
    const purpleLight = getAccentCssVars("aqua", "purple", false);
    const purpleDark = getAccentCssVars("aqua", "purple", true);
    const blueLight = getAccentCssVars("aqua", "blue", false);

    expect(purpleLight["--os-accent-assistant-bubble-text"]).toBeUndefined();
    expect(purpleLight["--os-accent-assistant-bubble-bg"]).toStartWith("rgb(");
    expect(purpleDark["--os-accent-assistant-bubble-bg"]).toStartWith("rgb(");

    const rgbToHex = (value: string) => {
      const match = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(value);
      expect(match).not.toBeNull();
      const [, r, g, b] = match!;
      return `#${[r, g, b]
        .map((n) => parseInt(n, 10).toString(16).padStart(2, "0"))
        .join("")}`;
    };

    const purpleHex = rgbToHex(purpleLight["--os-accent-assistant-bubble-bg"]!);
    const blueHex = rgbToHex(blueLight["--os-accent-assistant-bubble-bg"]!);
    const purpleHsl = hexToHsl(purpleHex);
    const blueHsl = hexToHsl(blueHex);
    const refLightHsl = hexToHsl("#bfdbfe");

    expect(hueDelta(hexToHsl("#8344c4").h, purpleHsl.h)).toBeLessThanOrEqual(12);
    expect(Math.abs(purpleHsl.l - refLightHsl.l)).toBeLessThan(0.03);
    expect(Math.abs(blueHsl.l - refLightHsl.l)).toBeLessThan(0.03);
  });

  test("system7 accent includes assistant bubble background only", () => {
    const vars = getAccentCssVars("system7", "green", false);
    expect(vars["--os-accent-assistant-bubble-bg"]).toStartWith("rgb(");
    expect(vars["--os-accent-assistant-bubble-text"]).toBeUndefined();
  });

  test("named accent sets link color derived from the accent swatch", () => {
    const purple = getAccentCssVars("aqua", "purple", false);
    const purpleDark = getAccentCssVars("aqua", "purple", true);
    const system7Green = getAccentCssVars("system7", "green", false);

    expect(purple["--os-color-link"]).toStartWith("rgb(");
    expect(purpleDark["--os-color-link"]).toStartWith("rgb(");
    expect(system7Green["--os-color-link"]).toStartWith("rgb(");
    expect(purple["--os-color-link"]).not.toBe(purpleDark["--os-color-link"]);
  });
});
