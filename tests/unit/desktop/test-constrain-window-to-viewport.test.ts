import { describe, expect, test } from "bun:test";
import { constrainWindowToViewport } from "../../../src/utils/constrainWindowToViewport";
import { desktopContentBounds } from "../../../src/utils/desktopContentBounds";

const full = (width: number, height: number) =>
  desktopContentBounds({
    viewportWidth: width,
    viewportHeight: height,
    insets: { left: 0, right: 0 },
  });

describe("constrainWindowToViewport", () => {
  test("a desktop window restored on a phone uses the mobile frame and safe area", () => {
    const viewportWidth = 390;
    const viewportHeight = 800;
    const fitted = constrainWindowToViewport({
      x: 200,
      y: 80,
      width: 730,
      height: 475,
      viewportWidth,
      viewportHeight,
      bounds: full(viewportWidth, viewportHeight),
      topInset: 48,
      bottomInset: 90,
    });

    expect(fitted.x).toBe(0);
    expect(fitted.width).toBe(viewportWidth);
    expect(fitted.y).toBe(80);
    expect(fitted.height).toBe(475);
    expect(fitted.y).toBeGreaterThanOrEqual(48);
    expect(fitted.y + fitted.height).toBeLessThanOrEqual(viewportHeight - 90);
  });

  test("an off-screen saved rect is pulled inside the mobile safe area", () => {
    const viewportWidth = 390;
    const viewportHeight = 700;
    const topInset = 40;
    const bottomInset = 80;
    const fitted = constrainWindowToViewport({
      x: 1400,
      y: 2000,
      width: 800,
      height: 600,
      viewportWidth,
      viewportHeight,
      bounds: full(viewportWidth, viewportHeight),
      topInset,
      bottomInset,
    });

    expect(fitted).toEqual({
      x: 0,
      y: topInset,
      width: viewportWidth,
      height: viewportHeight - topInset - bottomInset,
    });
  });

  test("a window already inside the mobile safe area is unchanged", () => {
    const rect = { x: 0, y: 48, width: 390, height: 400 };
    const fitted = constrainWindowToViewport({
      ...rect,
      viewportWidth: 390,
      viewportHeight: 800,
      bounds: full(390, 800),
      topInset: 28,
      bottomInset: 80,
    });
    expect(fitted).toEqual(rect);
  });

  test("a desktop window already inside the content rect is unchanged, including a slight left overhang", () => {
    const bounds = full(1440, 900);
    const overhang = constrainWindowToViewport({
      x: -40,
      y: 40,
      width: 600,
      height: 400,
      viewportWidth: 1440,
      viewportHeight: 900,
      bounds,
      topInset: 25,
      bottomInset: 56,
    });
    expect(overhang).toEqual({ x: -40, y: 40, width: 600, height: 400 });

    const inside = constrainWindowToViewport({
      x: 16,
      y: 40,
      width: 600,
      height: 400,
      viewportWidth: 1440,
      viewportHeight: 900,
      bounds,
      topInset: 25,
      bottomInset: 56,
    });
    expect(inside).toEqual({ x: 16, y: 40, width: 600, height: 400 });
  });

  test("a window saved fully off the desktop is brought back into the safe area", () => {
    const fitted = constrainWindowToViewport({
      x: -2000,
      y: 2000,
      width: 100,
      height: 400,
      viewportWidth: 1440,
      viewportHeight: 900,
      bounds: full(1440, 900),
      topInset: 25,
      bottomInset: 56,
    });
    expect(fitted.x).toBe(0);
    expect(fitted.width).toBe(100);
    expect(fitted.y + fitted.height).toBeLessThanOrEqual(900 - 56);
    expect(fitted.y).toBeGreaterThanOrEqual(25);
  });

  test("a phone with a side status bar uses the content width, not the full viewport", () => {
    const bounds = desktopContentBounds({
      viewportWidth: 466,
      viewportHeight: 678,
      insets: { left: 0, right: 84 },
    });
    const fitted = constrainWindowToViewport({
      x: 120,
      y: 30,
      width: 700,
      height: 400,
      viewportWidth: 466,
      viewportHeight: 678,
      bounds,
      topInset: 20,
      bottomInset: 20,
    });
    expect(fitted.x).toBe(bounds.x);
    expect(fitted.width).toBe(bounds.width);
    expect(fitted.y).toBe(30);
    expect(fitted.height).toBe(400);
  });
});
