#!/usr/bin/env bun

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  BOTTOM_DOCK_LAYOUT,
  SIDE_DOCK_GUTTER_PX,
  SIDE_DOCK_CLEARANCE_PX,
  SIDE_DOCK_MIN_INSET_PX,
  SIDE_DOCK_DIVIDER_LENGTH_PX,
  SIDE_DOCK_ITEM_MARGIN_PX,
  SIDE_DOCK_MIN_BUTTON_PX,
  fitSideDockButtonLength,
  fitSideDockButtonSize,
  getDockLayout,
  phoneWindowFlushEdge,
  sideDockCenterFromEdge,
  sideDockCrossPadding,
  resolveDockLayout,
  sideDockEndPadding,
  sideDockHiddenOffset,
} from "../../../src/components/layout/dock/dockPlacement";
import { desktopContentBounds } from "../../../src/utils/desktopContentBounds";
import {
  SIDE_BAR_EXTENT_VAR,
  SIDE_STATUS_BAR_EXTENT_EVENT,
  getSideStatusBarCenter,
  markIosShellDocument,
} from "../../../src/utils/platform";

function layoutFor(
  viewportWidth: number,
  insets: { left: number; right: number },
) {
  return resolveDockLayout(
    viewportWidth,
    desktopContentBounds({ viewportWidth, viewportHeight: 678, insets }),
  );
}

describe("resolveDockLayout", () => {
  test("folded iPhone Duo cover display puts the dock in the 84px right strip", () => {
    expect(layoutFor(466, { left: 0, right: 84 })).toEqual({
      placement: "right",
      stripWidth: 84,
    });
    expect(layoutFor(678, { left: 0, right: 84 })).toEqual({
      placement: "right",
      stripWidth: 84,
    });
  });

  test("a large left strip puts the dock on the left", () => {
    expect(layoutFor(466, { left: 84, right: 0 })).toEqual({
      placement: "left",
      stripWidth: 84,
    });
  });

  test("regular iPhone landscape insets keep the bottom dock", () => {
    expect(layoutFor(852, { left: 59, right: 59 })).toBe(BOTTOM_DOCK_LAYOUT);
    expect(layoutFor(932, { left: 62, right: 62 })).toBe(BOTTOM_DOCK_LAYOUT);
  });

  test("browsers and the wide-iPad 12px left floor keep the bottom dock", () => {
    expect(layoutFor(1440, { left: 0, right: 0 })).toBe(BOTTOM_DOCK_LAYOUT);
    expect(layoutFor(1180, { left: 12, right: 0 })).toBe(BOTTOM_DOCK_LAYOUT);
  });

  test("uses the minimum inset as an inclusive threshold", () => {
    expect(
      layoutFor(466, { left: 0, right: SIDE_DOCK_MIN_INSET_PX }).placement,
    ).toBe("right");
    expect(
      layoutFor(466, { left: 0, right: SIDE_DOCK_MIN_INSET_PX - 1 }).placement,
    ).toBe("bottom");
  });

  test("the larger qualifying side wins and the right side wins a tie", () => {
    expect(layoutFor(700, { left: 84, right: 84 })).toEqual({
      placement: "right",
      stripWidth: 84,
    });
    expect(layoutFor(700, { left: 90, right: 80 })).toEqual({
      placement: "left",
      stripWidth: 90,
    });
    expect(layoutFor(700, { left: 60, right: 80 })).toEqual({
      placement: "right",
      stripWidth: 80,
    });
  });
});

describe("fitSideDockButtonSize", () => {
  test("keeps the user's icon size when it fits the strip", () => {
    expect(
      fitSideDockButtonSize({ stripWidth: 84, buttonSize: 48, crossPadding: 4 }),
    ).toBe(48);
    expect(
      fitSideDockButtonSize({ stripWidth: 84, buttonSize: 48, crossPadding: 8 }),
    ).toBe(48);
    expect(
      fitSideDockButtonSize({ stripWidth: 84, buttonSize: 30, crossPadding: 3 }),
    ).toBe(30);
  });

  test("shrinks a large dock scale so the bar stays inside the strip", () => {
    const stripWidth = 84;
    const crossPadding = 12;
    const size = fitSideDockButtonSize({
      stripWidth,
      buttonSize: 72,
      crossPadding,
    });
    expect(size).toBe(48);
    expect(size + 2 * crossPadding + 2 * SIDE_DOCK_GUTTER_PX).toBeLessThanOrEqual(
      stripWidth,
    );
  });

  test("never returns a negative size", () => {
    expect(
      fitSideDockButtonSize({ stripWidth: 20, buttonSize: 48, crossPadding: 8 }),
    ).toBe(0);
  });
});

describe("fitSideDockButtonLength", () => {
  // Folded Duo: 678pt tall, 34pt bottom margin; 7 icons, 1 divider, 4px padding.
  const barLength = (size: number, items: number, dividers: number, padding: number) =>
    2 * padding +
    items * (size + 2 * SIDE_DOCK_ITEM_MARGIN_PX) +
    dividers * SIDE_DOCK_DIVIDER_LENGTH_PX;

  test("keeps the icon size while the dock fits under the resting cluster", () => {
    // Status column bottom 174 → top padding 186.
    const stripLength = 678 - 186 - 34;
    expect(
      fitSideDockButtonLength({ stripLength, buttonSize: 48, itemCount: 7, dividerCount: 1, padding: 4 }),
    ).toBe(48);
  });

  test("shrinks the icons when a grown Dynamic Island pushes the top down", () => {
    // Live Activity: status column bottom 254 → top padding 266.
    const stripLength = 678 - 266 - 34;
    const size = fitSideDockButtonLength({ stripLength, buttonSize: 48, itemCount: 7, dividerCount: 1, padding: 4 });
    expect(size).toBeLessThan(48);
    expect(barLength(size, 7, 1, 4)).toBeLessThanOrEqual(stripLength);
    expect(barLength(size + 1, 7, 1, 4)).toBeGreaterThan(stripLength);
  });

  test("stops at the minimum icon and lets the dock scroll", () => {
    expect(
      fitSideDockButtonLength({ stripLength: 120, buttonSize: 48, itemCount: 12, dividerCount: 2, padding: 4 }),
    ).toBe(SIDE_DOCK_MIN_BUTTON_PX);
    // Never grows a smaller user size up to the minimum.
    expect(
      fitSideDockButtonLength({ stripLength: 120, buttonSize: 20, itemCount: 12, dividerCount: 2, padding: 4 }),
    ).toBe(20);
  });

  test("an unmeasured strip keeps the size", () => {
    expect(
      fitSideDockButtonLength({ stripLength: null, buttonSize: 48, itemCount: 7, dividerCount: 1, padding: 4 }),
    ).toBe(48);
    expect(
      fitSideDockButtonLength({ stripLength: 0, buttonSize: 48, itemCount: 7, dividerCount: 1, padding: 4 }),
    ).toBe(48);
  });
});

describe("sideDockHiddenOffset", () => {
  test("slides a right dock right and a left dock left, fully past the edge", () => {
    const stripWidth = 84;
    const thickness = 64;
    const right = sideDockHiddenOffset({
      placement: "right",
      stripWidth,
      thickness,
    });
    const left = sideDockHiddenOffset({
      placement: "left",
      stripWidth,
      thickness,
    });
    expect(right).toBeGreaterThan(0);
    expect(left).toBe(-right);
    // The bar's inner edge starts (strip + thickness) / 2 from the screen edge.
    expect(right).toBeGreaterThanOrEqual((stripWidth + thickness) / 2);
  });
});

describe("side dock centre line", () => {
  // Folded Duo cover: 84pt strip, Aqua dock 48 + 2 * 8 = 64 wide. The shell
  // measures the status column 48pt from the edge (camera region centre).
  const stripWidth = 84;
  const thickness = 64;

  test("lines up with the measured status column, 6px inward of the strip centre", () => {
    expect(sideDockCenterFromEdge({ stripWidth, thickness, center: 48 })).toBe(48);
    // Outer padding 12: the content box is 72 wide and the dock centres in
    // it, 12 + 36 = 48 from the edge; the dock keeps its width.
    expect(sideDockCrossPadding({ stripWidth, thickness, center: 48 })).toEqual({
      outer: 12,
      inner: 0,
    });
    // It now keeps 48 - 32 = 16px from the screen edge (10 before).
    expect(48 - thickness / 2).toBe(16);
  });

  test("without a measured centre it stays centred in the strip", () => {
    for (const center of [null, 0, -3, Number.NaN]) {
      expect(sideDockCenterFromEdge({ stripWidth, thickness, center })).toBe(42);
      expect(sideDockCrossPadding({ stripWidth, thickness, center })).toEqual({
        outer: 0,
        inner: 0,
      });
    }
  });

  test("never pushes the dock past either edge of its strip", () => {
    expect(sideDockCenterFromEdge({ stripWidth, thickness, center: 80 })).toBe(52);
    expect(sideDockCenterFromEdge({ stripWidth, thickness, center: 10 })).toBe(32);
    expect(sideDockCrossPadding({ stripWidth, thickness, center: 10 })).toEqual({
      outer: 0,
      inner: 20,
    });
    // A dock as wide as the strip stays centred.
    expect(sideDockCenterFromEdge({ stripWidth, thickness: 90, center: 48 })).toBe(42);
  });

  test("the hidden dock still clears the screen edge from the moved centre", () => {
    const centerFromEdge = sideDockCenterFromEdge({ stripWidth, thickness, center: 48 });
    const right = sideDockHiddenOffset({ placement: "right", stripWidth, thickness, centerFromEdge });
    expect(right).toBeGreaterThanOrEqual(centerFromEdge + thickness / 2);
    expect(sideDockHiddenOffset({ placement: "left", stripWidth, thickness, centerFromEdge })).toBe(-right);
    // Without a centre the distance is what it always was.
    expect(sideDockHiddenOffset({ placement: "right", stripWidth, thickness })).toBe(
      Math.ceil((stripWidth + thickness) / 2) + 10,
    );
  });
});

describe("phoneWindowFlushEdge", () => {
  test("phone-width windows drop their padding on the side-dock edge only", () => {
    expect(phoneWindowFlushEdge(466, layoutFor(466, { left: 0, right: 84 }))).toBe(
      "right",
    );
    expect(phoneWindowFlushEdge(466, layoutFor(466, { left: 84, right: 0 }))).toBe(
      "left",
    );
  });

  test("bottom docks and md+ layouts keep the padding as it is today", () => {
    expect(phoneWindowFlushEdge(393, layoutFor(393, { left: 0, right: 0 }))).toBeNull();
    expect(phoneWindowFlushEdge(951, layoutFor(951, { left: 0, right: 84 }))).toBeNull();
  });
});

describe("sideDockEndPadding", () => {
  test("the top sits 12px below the shell-reported status cluster", () => {
    expect(SIDE_DOCK_CLEARANCE_PX).toBe(12);
    expect(sideDockEndPadding("top")).toBe(
      "calc(var(--side-bar-extent, 0px) + 12px)",
    );
  });

  test("the bottom keeps at least 12px and clears the home-indicator zone", () => {
    expect(sideDockEndPadding("bottom")).toBe(
      "max(12px, env(safe-area-inset-bottom))",
    );
  });

  test("the top ignores the safe-area insets", () => {
    expect(sideDockEndPadding("top")).not.toContain("safe-area");
  });
});

describe("iOS shell side status-bar extent", () => {
  const g = globalThis as Record<string, unknown>;
  const saved = {
    window: Object.getOwnPropertyDescriptor(globalThis, "window"),
    document: Object.getOwnPropertyDescriptor(globalThis, "document"),
  };
  let events = new EventTarget();
  const cssVars = new Map<string, string>();

  beforeEach(() => {
    cssVars.clear();
    events = new EventTarget();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      writable: true,
      value: {
        ryosDesktop: { platform: "ios", sideStatusBarExtent: 150 },
        addEventListener: events.addEventListener.bind(events),
      },
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      writable: true,
      value: {
        documentElement: {
          setAttribute() {},
          removeAttribute() {},
          style: { setProperty: (name: string, value: string) => cssVars.set(name, value) },
        },
      },
    });
  });

  afterEach(() => {
    for (const key of ["window", "document"] as const) {
      const descriptor = saved[key];
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete g[key];
    }
  });

  const emit = (detail: unknown) =>
    events.dispatchEvent(new CustomEvent(SIDE_STATUS_BAR_EXTENT_EVENT, { detail }));

  test("reads the bridge once, then follows fold events", () => {
    markIosShellDocument();
    expect(cssVars.get(SIDE_BAR_EXTENT_VAR)).toBe("150px");

    emit({ extent: 88, hasCamera: false });
    expect(cssVars.get(SIDE_BAR_EXTENT_VAR)).toBe("88px");

    emit({ extent: 150, hasCamera: true });
    expect(cssVars.get(SIDE_BAR_EXTENT_VAR)).toBe("150px");

    emit({ extent: 0, hasCamera: false });
    expect(cssVars.get(SIDE_BAR_EXTENT_VAR)).toBe("0px");
  });

  test("falls back to the bridge property and treats bad values as 0", () => {
    markIosShellDocument();
    const bridge = (g.window as { ryosDesktop: { sideStatusBarExtent?: unknown } })
      .ryosDesktop;
    bridge.sideStatusBarExtent = 88;
    emit(undefined);
    expect(cssVars.get(SIDE_BAR_EXTENT_VAR)).toBe("88px");

    emit({ extent: "bogus" });
    expect(cssVars.get(SIDE_BAR_EXTENT_VAR)).toBe("0px");
  });

  test("reads the shell's status column centre, null when unknown", () => {
    const bridge = (g.window as { ryosDesktop: { sideStatusBarCenter?: unknown } })
      .ryosDesktop;
    expect(getSideStatusBarCenter()).toBeNull();
    bridge.sideStatusBarCenter = 48;
    expect(getSideStatusBarCenter()).toBe(48);
    bridge.sideStatusBarCenter = 0;
    expect(getSideStatusBarCenter()).toBeNull();
    bridge.sideStatusBarCenter = "bogus";
    expect(getSideStatusBarCenter()).toBeNull();
  });

  test("a shell without the property reads 0", () => {
    (g.window as { ryosDesktop: { sideStatusBarExtent?: unknown } }).ryosDesktop = {
      platform: "ios",
    };
    markIosShellDocument();
    expect(cssVars.get(SIDE_BAR_EXTENT_VAR)).toBe("0px");
  });

  test("a regular browser never sets the variable", () => {
    (g.window as { ryosDesktop?: unknown }).ryosDesktop = undefined;
    markIosShellDocument();
    expect(cssVars.has(SIDE_BAR_EXTENT_VAR)).toBe(false);
  });
});

describe("getDockLayout", () => {
  test("returns a referentially stable snapshot while the insets are unchanged", () => {
    expect(getDockLayout()).toBe(getDockLayout());
  });
});
