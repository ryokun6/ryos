import { describe, expect, test } from "bun:test";
import {
  clampWindowToContentBounds,
  desktopContentBounds,
  hasHorizontalContentInset,
  maximizedWindowFrame,
  mobileFullWidthFrame,
  windowDragLimits,
  windowResizeMaxWidth,
  windowResizeMinLeft,
  windowFrameMinWidth,
  windowSnapGeometry,
  windowUsesExplicitWidth,
} from "../../../src/utils/desktopContentBounds";

const full = (width: number, height = 900) =>
  desktopContentBounds({
    viewportWidth: width,
    viewportHeight: height,
    insets: { left: 0, right: 0 },
  });

describe("desktop content bounds", () => {
  test("zero insets are the viewport", () => {
    const bounds = full(1440, 900);
    expect(bounds).toEqual({
      x: 0,
      y: 0,
      width: 1440,
      height: 900,
      right: 1440,
      bottom: 900,
    });
    expect(hasHorizontalContentInset(bounds, 1440)).toBe(false);
  });

  test("a right status bar of 84 leaves the wallpaper edge and shrinks the content width", () => {
    const bounds = desktopContentBounds({
      viewportWidth: 466,
      viewportHeight: 678,
      insets: { left: 0, right: 84 },
    });
    expect(bounds.x).toBe(0);
    expect(bounds.right).toBe(382);
    expect(bounds.width).toBe(382);
    expect(hasHorizontalContentInset(bounds, 466)).toBe(true);
  });

  test("a left floor of 12 and a right status bar are not mirrored", () => {
    const bounds = desktopContentBounds({
      viewportWidth: 1180,
      viewportHeight: 820,
      insets: { left: 12, right: 84 },
    });
    expect(bounds.x).toBe(12);
    expect(bounds.width).toBe(1180 - 12 - 84);
    expect(bounds.right).toBe(1180 - 84);
  });

  test("zero insets keep the previous window math", () => {
    const bounds = full(1440);
    expect(
      clampWindowToContentBounds({
        x: -40,
        width: 600,
        viewportWidth: 1440,
        bounds,
        mobile: false,
      })
    ).toEqual({ x: -40, width: 600 });
    expect(
      clampWindowToContentBounds({
        x: 1000,
        width: 600,
        viewportWidth: 1440,
        bounds,
        mobile: false,
      })
    ).toEqual({ x: 840, width: 600 });
    expect(
      windowDragLimits({ windowWidth: 600, viewportWidth: 1440, bounds })
    ).toEqual({ minX: -(600 - 80), maxX: 1440 - 80 });
    expect(
      windowSnapGeometry({ viewportWidth: 1440, bounds, zone: "left" })
    ).toEqual({ x: 0, width: 720 });
    expect(
      windowSnapGeometry({ viewportWidth: 1440, bounds, zone: "right" })
    ).toEqual({ x: 720, width: 720 });
    expect(windowResizeMaxWidth(1440, bounds)).toBe(1440);
    expect(windowResizeMinLeft(bounds)).toBe(0);
    expect(mobileFullWidthFrame(390, full(390))).toEqual({ x: 0, width: 390 });
    expect(windowUsesExplicitWidth(390, full(390))).toBe(false);
    expect(windowUsesExplicitWidth(1440, bounds)).toBe(true);
    expect(
      maximizedWindowFrame({
        viewportWidth: 1440,
        bounds,
        maxWidthConstraint: null,
        defaultWidth: 600,
        restoring: false,
      })
    ).toEqual({ x: 0, width: 1440 });
    expect(
      maximizedWindowFrame({
        viewportWidth: 1440,
        bounds,
        maxWidthConstraint: null,
        defaultWidth: 600,
        restoring: true,
      }).x
    ).toBe((1440 - 600) / 2);
    expect(
      maximizedWindowFrame({
        viewportWidth: 390,
        bounds: full(390),
        maxWidthConstraint: 800,
        defaultWidth: 600,
        restoring: false,
      })
    ).toEqual({ x: 0, width: 390 });
  });

  test("windows sit inside a right status bar and a left clearance", () => {
    const bounds = desktopContentBounds({
      viewportWidth: 1180,
      viewportHeight: 820,
      insets: { left: 12, right: 84 },
    });
    expect(
      clampWindowToContentBounds({
        x: 0,
        width: 1180,
        viewportWidth: 1180,
        bounds,
        mobile: false,
      })
    ).toEqual({ x: 12, width: 1180 - 12 - 84 });
    expect(
      windowDragLimits({ windowWidth: 400, viewportWidth: 1180, bounds }).minX
    ).toBe(12);
    expect(
      windowSnapGeometry({ viewportWidth: 1180, bounds, zone: "right" })
    ).toEqual({
      x: 12 + Math.floor(bounds.width / 2),
      width: Math.floor(bounds.width / 2),
    });
    const maximized = maximizedWindowFrame({
      viewportWidth: 1180,
      bounds,
      maxWidthConstraint: null,
      defaultWidth: 600,
      restoring: false,
    });
    expect(maximized.x).toBe(12);
    expect(maximized.width).toBe(bounds.width);
    expect(maximized.x + maximized.width).toBe(bounds.right);
    expect(mobileFullWidthFrame(466, desktopContentBounds({
      viewportWidth: 466,
      viewportHeight: 678,
      insets: { left: 0, right: 84 },
    }))).toEqual({ x: 0, width: 382 });
    expect(
      windowUsesExplicitWidth(
        466,
        desktopContentBounds({
          viewportWidth: 466,
          viewportHeight: 678,
          insets: { left: 0, right: 84 },
        })
      )
    ).toBe(true);
  });

  test("an app minimum never widens a phone-width frame past the content rect", () => {
    const folded = desktopContentBounds({
      viewportWidth: 466,
      viewportHeight: 678,
      insets: { left: 0, right: 84 },
    });
    expect(
      windowFrameMinWidth({ viewportWidth: 466, bounds: folded, appMinWidth: 400 })
    ).toBeUndefined();
    expect(
      windowFrameMinWidth({ viewportWidth: 390, bounds: full(390), appMinWidth: 400 })
    ).toBe("100%");
    const open = desktopContentBounds({
      viewportWidth: 951,
      viewportHeight: 669,
      insets: { left: 0, right: 84 },
    });
    expect(
      windowFrameMinWidth({ viewportWidth: 951, bounds: open, appMinWidth: 400 })
    ).toBe(400);
    expect(
      windowFrameMinWidth({ viewportWidth: 1440, bounds: full(1440), appMinWidth: 400 })
    ).toBe(400);
  });
});
