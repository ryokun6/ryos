import { describe, expect, test } from "bun:test";
import {
  applyUserWindowMove,
  constrainWindowToViewport,
  layoutForViewport,
  type WindowRect,
} from "../../../src/utils/constrainWindowToViewport";
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
      height: 600,
    });
  });

  test("right-side desktop windows keep y when the viewport becomes a phone", () => {
    const viewportWidth = 390;
    const viewportHeight = 800;
    const bounds = full(viewportWidth, viewportHeight);
    const insets = { topInset: 48, bottomInset: 90 };
    const right = constrainWindowToViewport({
      x: 1100,
      y: 180,
      width: 520,
      height: 400,
      viewportWidth,
      viewportHeight,
      bounds,
      ...insets,
    });
    const lower = constrainWindowToViewport({
      x: 980,
      y: 420,
      width: 400,
      height: 360,
      viewportWidth,
      viewportHeight,
      bounds,
      ...insets,
    });

    expect(right).toEqual({ x: 0, y: 180, width: viewportWidth, height: 400 });
    expect(lower).toEqual({ x: 0, y: 420, width: viewportWidth, height: 360 });
    expect(lower.y + lower.height).toBeGreaterThan(viewportHeight - insets.bottomInset);
  });

  test("y moves only when the window is above the menubar or fully below the dock", () => {
    const bounds = full(390, 800);
    const above = constrainWindowToViewport({
      x: 40,
      y: 4,
      width: 600,
      height: 300,
      viewportWidth: 390,
      viewportHeight: 800,
      bounds,
      topInset: 48,
      bottomInset: 90,
    });
    expect(above).toEqual({ x: 0, y: 48, width: 390, height: 300 });

    const below = constrainWindowToViewport({
      x: 40,
      y: 900,
      width: 600,
      height: 200,
      viewportWidth: 390,
      viewportHeight: 800,
      bounds,
      topInset: 48,
      bottomInset: 90,
    });
    expect(below.x).toBe(0);
    expect(below.width).toBe(390);
    expect(below.height).toBe(200);
    expect(below.y).toBe(800 - 90 - 200);
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

  test("desktop to mobile to desktop restores the exact desktop rect", () => {
    const desktop: WindowRect = { x: 220, y: 64, width: 680, height: 400 };
    const phoneBounds = full(390, 800);
    const desktopBounds = full(1440, 900);
    const onPhone = layoutForViewport({
      ...desktop,
      desktop: null,
      defaultDesktop: { x: 16, y: 40, width: 730, height: 475 },
      viewportWidth: 390,
      viewportHeight: 800,
      bounds: phoneBounds,
      topInset: 48,
      bottomInset: 90,
    });
    expect(onPhone.desktop).toEqual(desktop);
    expect(onPhone.current).toEqual({ x: 0, y: 64, width: 390, height: 400 });

    const back = layoutForViewport({
      ...onPhone.current,
      desktop: onPhone.desktop,
      defaultDesktop: { x: 16, y: 40, width: 730, height: 475 },
      viewportWidth: 1440,
      viewportHeight: 900,
      bounds: desktopBounds,
      topInset: 25,
      bottomInset: 56,
    });
    expect(back.current).toEqual(desktop);
    expect(back.desktop).toEqual(desktop);
  });

  test("moving on mobile does not change the desktop rect", () => {
    const desktop: WindowRect = { x: 220, y: 64, width: 680, height: 400 };
    const mobileCurrent: WindowRect = { x: 0, y: 64, width: 390, height: 400 };
    const moved = applyUserWindowMove({
      mobile: true,
      desktop,
      next: { ...mobileCurrent, y: 240 },
    });
    expect(moved.desktop).toEqual(desktop);
    expect(moved.current).toEqual({ x: 0, y: 240, width: 390, height: 400 });

    const back = layoutForViewport({
      ...moved.current,
      desktop: moved.desktop,
      defaultDesktop: { x: 16, y: 40, width: 730, height: 475 },
      viewportWidth: 1440,
      viewportHeight: 900,
      bounds: full(1440, 900),
      topInset: 25,
      bottomInset: 56,
    });
    expect(back.current).toEqual(desktop);
  });

  test("refresh on desktop after a mobile session restores the desktop rect", () => {
    const desktop: WindowRect = { x: 220, y: 64, width: 680, height: 400 };
    const persistedMobile: WindowRect = { x: 0, y: 240, width: 390, height: 400 };
    const refreshed = layoutForViewport({
      ...persistedMobile,
      desktop,
      defaultDesktop: { x: 16, y: 40, width: 730, height: 475 },
      viewportWidth: 1440,
      viewportHeight: 900,
      bounds: full(1440, 900),
      topInset: 25,
      bottomInset: 56,
    });
    expect(refreshed.current).toEqual(desktop);
    expect(refreshed.desktop).toEqual(desktop);
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
