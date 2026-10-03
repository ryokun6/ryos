#!/usr/bin/env bun

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  BOTTOM_DOCK_LAYOUT,
  SIDE_DOCK_GUTTER_PX,
  SIDE_DOCK_CLEARANCE_PX,
  SIDE_DOCK_MIN_INSET_PX,
  fitSideDockButtonSize,
  getDockLayout,
  resolveDockLayout,
  sideDockEndPadding,
  sideDockHiddenOffset,
} from "../../../src/components/layout/dock/dockPlacement";
import { desktopContentBounds } from "../../../src/utils/desktopContentBounds";
import {
  SIDE_BAR_EXTENT_VAR,
  SIDE_STATUS_BAR_EXTENT_EVENT,
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
  test("the top sits 12px below the shell-reported status cluster", () => {
    expect(SIDE_DOCK_CLEARANCE_PX).toBe(12);
    expect(sideDockEndPadding("top")).toBe(
      "calc(var(--side-bar-extent, 0px) + 12px)",
    );
  });

  test("the bottom keeps a 12px margin, independent of the safe-area insets", () => {
    expect(sideDockEndPadding("bottom")).toBe("12px");
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
