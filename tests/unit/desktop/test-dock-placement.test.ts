#!/usr/bin/env bun

import { describe, expect, test } from "bun:test";
import {
  BOTTOM_DOCK_LAYOUT,
  SIDE_DOCK_GUTTER_PX,
  SIDE_DOCK_MIN_INSET_PX,
  fitSideDockButtonSize,
  getDockLayout,
  resolveDockLayout,
  sideDockEndPadding,
  sideDockHiddenOffset,
} from "../../../src/components/layout/dock/dockPlacement";
import { desktopContentBounds } from "../../../src/utils/desktopContentBounds";

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
  test("clears the status-bar ends unless the system inset is larger", () => {
    expect(sideDockEndPadding("top")).toBe(
      "max(var(--sat-safe-area-top, 0px), 64px)",
    );
    expect(sideDockEndPadding("bottom")).toBe(
      "max(var(--sat-safe-area-bottom, 0px), 64px)",
    );
  });
});

describe("getDockLayout", () => {
  test("returns a referentially stable snapshot while the insets are unchanged", () => {
    expect(getDockLayout()).toBe(getDockLayout());
  });
});
