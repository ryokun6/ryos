#!/usr/bin/env bun

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  BOTTOM_DOCK_LAYOUT,
  SIDE_DOCK_GUTTER_PX,
  SIDE_DOCK_MIN_INSET_PX,
  SIDE_DOCK_STATUS_BAR_EXTENT_PX,
  SIDE_DOCK_STATUS_BAR_GAP_PX,
  fitSideDockButtonSize,
  getDockLayout,
  resolveDockLayout,
  sideDockEndPadding,
  sideDockHiddenOffset,
} from "../../../src/components/layout/dock/dockPlacement";
import { desktopContentBounds } from "../../../src/utils/desktopContentBounds";
import {
  SIDE_STATUS_BAR_EXTENT_EVENT,
  SIDE_STATUS_BAR_EXTENT_VAR,
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

describe("sideDockEndPadding", () => {
  test("the top clears the taller of the reported and measured status cluster", () => {
    expect(SIDE_DOCK_STATUS_BAR_EXTENT_PX + SIDE_DOCK_STATUS_BAR_GAP_PX).toBe(164);
    expect(sideDockEndPadding("top")).toBe(
      "max(var(--sat-safe-area-top, 0px), var(--ios-side-status-bar-extent, 0px) + 12px, 164px)",
    );
  });

  test("the bottom clears the display corner unless the system inset is larger", () => {
    expect(sideDockEndPadding("bottom")).toBe(
      "max(var(--sat-safe-area-bottom, 0px), 48px)",
    );
  });
});

describe("iOS shell side status-bar extent", () => {
  const g = globalThis as Record<string, unknown>;
  const saved = {
    window: Object.getOwnPropertyDescriptor(globalThis, "window"),
    document: Object.getOwnPropertyDescriptor(globalThis, "document"),
  };
  const events = new EventTarget();
  const cssVars = new Map<string, string>();

  beforeEach(() => {
    cssVars.clear();
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

  test("mirrors the bridge value and its change events into the CSS variable", () => {
    markIosShellDocument();
    expect(cssVars.get(SIDE_STATUS_BAR_EXTENT_VAR)).toBe("150px");

    events.dispatchEvent(new CustomEvent(SIDE_STATUS_BAR_EXTENT_EVENT, { detail: 196 }));
    expect(cssVars.get(SIDE_STATUS_BAR_EXTENT_VAR)).toBe("196px");

    events.dispatchEvent(new CustomEvent(SIDE_STATUS_BAR_EXTENT_EVENT, { detail: "bogus" }));
    expect(cssVars.get(SIDE_STATUS_BAR_EXTENT_VAR)).toBe("0px");
  });

  test("a regular browser never sets the variable", () => {
    (g.window as { ryosDesktop?: unknown }).ryosDesktop = undefined;
    markIosShellDocument();
    expect(cssVars.has(SIDE_STATUS_BAR_EXTENT_VAR)).toBe(false);
  });
});

describe("getDockLayout", () => {
  test("returns a referentially stable snapshot while the insets are unchanged", () => {
    expect(getDockLayout()).toBe(getDockLayout());
  });
});
