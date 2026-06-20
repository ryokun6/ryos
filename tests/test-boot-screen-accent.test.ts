import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getAccentCssVars } from "../src/themes/accents";
import { darkAquaThemeCss } from "./theme-css-fixtures";

const bootScreenSource = readFileSync(
  join(import.meta.dir, "../src/components/dialogs/BootScreen.tsx"),
  "utf8"
);

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

function rgbToHex(value: string): string {
  const match = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(value);
  expect(match).not.toBeNull();
  const [, r, g, b] = match!;
  return `#${[r, g, b]
    .map((n) => parseInt(n, 10).toString(16).padStart(2, "0"))
    .join("")}`;
}

describe("macOS boot screen accent tokens", () => {
  test("default accent emits no boot overrides", () => {
    expect(getAccentCssVars("aqua", "default", false)).toEqual({});
  });

  test("named accent shifts boot backdrop hue while keeping stock lightness", () => {
    const purple = getAccentCssVars("aqua", "purple", false);
    const refHsl = hexToHsl("#4566a0");
    const purpleHex = rgbToHex(purple["--os-accent-boot-bg"]!);
    const purpleHsl = hexToHsl(purpleHex);

    expect(hueDelta(hexToHsl("#8344c4").h, purpleHsl.h)).toBeLessThanOrEqual(12);
    expect(Math.abs(purpleHsl.l - refHsl.l)).toBeLessThan(0.03);
    expect(Math.abs(purpleHsl.s - refHsl.s)).toBeLessThan(0.05);
  });

  test("boot apple filter keeps the washed base and applies accent hue", () => {
    const purple = getAccentCssVars("aqua", "purple", false);
    const filter = purple["--os-accent-boot-apple-filter"]!;

    expect(filter).toStartWith("grayscale(50%) brightness(1.25)");
    expect(filter).toContain("hue-rotate(");
    expect(purple["--os-accent-apple-filter"]).toContain("hue-rotate(");
  });

  test("BootScreen overlay and logo consume boot accent CSS variables", () => {
    expect(bootScreenSource).toContain("var(--os-accent-boot-bg, #4566a0)");
    expect(bootScreenSource).toContain("boot-screen-apple-logo");
    expect(bootScreenSource).not.toContain('filter: "grayscale(50%) brightness(1.25)"');
  });

  test("dark-aqua.css wires boot apple logo filter with stock fallback", () => {
    expect(darkAquaThemeCss).toContain("img.boot-screen-apple-logo");
    expect(darkAquaThemeCss).toContain("--os-accent-boot-apple-filter");
    expect(darkAquaThemeCss).toContain("grayscale(50%) brightness(1.25)");
  });
});
