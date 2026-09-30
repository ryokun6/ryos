import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  DISPLAY_CORNER_FLOOR_PX,
  MENUBAR_HORIZONTAL_RHYTHM,
  PHONE_LAYOUT_MAX_WIDTH_PX,
  edgeChromeHorizontalPadding,
  menubarHorizontalPadding,
  safeAreaInsetPadding,
  shouldApplyDisplayCornerFloor,
} from "../../../src/components/layout/menu-bar/menubarEdgePadding";

describe("menubar edge padding", () => {
  test("viewport meta opts into edge-to-edge safe areas", () => {
    const html = readFileSync(new URL("../../../index.html", import.meta.url), "utf8");
    expect(html).toContain("viewport-fit=cover");
  });

  test("desktop and phone-width keep the existing 0.5rem rhythm plus the raw inset", () => {
    // 0.5rem is 8px at the 16px root, which is less than the 12px floor.
    // Adding the floor here would change desktop padding from 8px to 20px.
    expect(MENUBAR_HORIZONTAL_RHYTHM).toBe("0.5rem");
    expect(DISPLAY_CORNER_FLOOR_PX).toBe(12);
    expect(
      menubarHorizontalPadding({
        side: "left",
        trafficLightClearance: false,
        cornerFloor: false,
      })
    ).toBe("calc(0.5rem + env(safe-area-inset-left, 0px))");
    expect(
      menubarHorizontalPadding({
        side: "right",
        trafficLightClearance: false,
        cornerFloor: false,
      })
    ).toBe("calc(0.5rem + env(safe-area-inset-right, 0px))");
  });

  test("wide touch uses a 12px inset floor outside the 0.5rem rhythm", () => {
    expect(
      menubarHorizontalPadding({
        side: "left",
        trafficLightClearance: false,
        cornerFloor: true,
      })
    ).toBe("calc(max(env(safe-area-inset-left, 0px), 12px) + 0.5rem)");
    expect(
      menubarHorizontalPadding({
        side: "right",
        trafficLightClearance: false,
        cornerFloor: true,
      })
    ).toBe("calc(max(env(safe-area-inset-right, 0px), 12px) + 0.5rem)");
  });

  test("traffic-light clearance stays 78px plus the raw inset, even when the floor is on", () => {
    expect(
      menubarHorizontalPadding({
        side: "left",
        trafficLightClearance: true,
        cornerFloor: true,
      })
    ).toBe("calc(78px + env(safe-area-inset-left, 0px))");
    expect(
      menubarHorizontalPadding({
        side: "right",
        trafficLightClearance: true,
        cornerFloor: false,
      })
    ).toBe("calc(0.5rem + env(safe-area-inset-right, 0px))");
  });

  test("the corner floor applies only to wide coarse-touch viewports", () => {
    expect(PHONE_LAYOUT_MAX_WIDTH_PX).toBe(640);
    expect(
      shouldApplyDisplayCornerFloor({ coarseTouch: false, viewportWidth: 1440 })
    ).toBe(false);
    expect(
      shouldApplyDisplayCornerFloor({ coarseTouch: false, viewportWidth: 1024 })
    ).toBe(false);
    expect(
      shouldApplyDisplayCornerFloor({ coarseTouch: true, viewportWidth: 390 })
    ).toBe(false);
    expect(
      shouldApplyDisplayCornerFloor({ coarseTouch: true, viewportWidth: 640 })
    ).toBe(false);
    expect(
      shouldApplyDisplayCornerFloor({ coarseTouch: true, viewportWidth: 641 })
    ).toBe(true);
    expect(
      shouldApplyDisplayCornerFloor({ coarseTouch: true, viewportWidth: 1180 })
    ).toBe(true);
  });

  test("taskbar row padding is the raw inset, with the same 12px floor on wide touch", () => {
    expect(
      edgeChromeHorizontalPadding({ side: "left", cornerFloor: false })
    ).toBe("env(safe-area-inset-left, 0px)");
    expect(
      edgeChromeHorizontalPadding({ side: "right", cornerFloor: true })
    ).toBe("max(env(safe-area-inset-right, 0px), 12px)");
  });

  test("centered dock clearance consumes the inset without a hardcoded floor", () => {
    expect(safeAreaInsetPadding("left")).toBe("env(safe-area-inset-left, 0px)");
    expect(safeAreaInsetPadding("right")).toBe("env(safe-area-inset-right, 0px)");
    expect(safeAreaInsetPadding("bottom")).toBe("env(safe-area-inset-bottom, 0px)");
  });
});
