import { describe, expect, test } from "bun:test";
import {
  INNER_STATUS_PILL_CENTER_Y_PX,
  INNER_STATUS_PILL_LEFT_PX,
  STATUS_PILL_CLEARANCE_PX,
  raisedMenubarBox,
  shouldRaiseMenubarBesideStatusPill,
  statusPillRightClearance,
} from "../../../src/components/layout/menu-bar/menubarEdgePadding";

const innerUpright = {
  iosShell: true,
  coarseTouch: true,
  viewportWidth: 669,
  viewportHeight: 951,
  safeTop: 82,
};

describe("menubar beside the status pill (inner display upright)", () => {
  test("raises only on the inner display held upright inside the iOS shell", () => {
    expect(shouldRaiseMenubarBesideStatusPill(innerUpright)).toBe(true);
  });

  test("the browser never raises", () => {
    expect(
      shouldRaiseMenubarBesideStatusPill({ ...innerUpright, iosShell: false }),
    ).toBe(false);
    expect(
      shouldRaiseMenubarBesideStatusPill({ ...innerUpright, coarseTouch: false }),
    ).toBe(false);
  });

  test("other displays and orientations keep the layout", () => {
    // Inner display sideways.
    expect(
      shouldRaiseMenubarBesideStatusPill({
        ...innerUpright,
        viewportWidth: 951,
        viewportHeight: 669,
        safeTop: 20,
      }),
    ).toBe(false);
    // Folded cover display.
    expect(
      shouldRaiseMenubarBesideStatusPill({
        ...innerUpright,
        viewportWidth: 466,
        viewportHeight: 678,
        safeTop: 20,
      }),
    ).toBe(false);
    // Regular iPhone portrait.
    expect(
      shouldRaiseMenubarBesideStatusPill({
        ...innerUpright,
        viewportWidth: 440,
        viewportHeight: 956,
        safeTop: 62,
      }),
    ).toBe(false);
    // iPad full screen portrait.
    expect(
      shouldRaiseMenubarBesideStatusPill({
        ...innerUpright,
        viewportWidth: 1032,
        viewportHeight: 1376,
        safeTop: 24,
      }),
    ).toBe(false);
    // An iPad window the same size as the inner display has a short top inset.
    expect(
      shouldRaiseMenubarBesideStatusPill({ ...innerUpright, safeTop: 32 }),
    ).toBe(false);
  });

  test("the row stops 12px short of the pill's left edge", () => {
    expect(INNER_STATUS_PILL_LEFT_PX).toBe(542);
    expect(STATUS_PILL_CLEARANCE_PX).toBe(12);
    // 669 - 542 + 12 = 139 from the right edge, so the row ends at x = 530.
    expect(statusPillRightClearance(669)).toBe(139);
  });

  test("an inset bar is centred on the pill's centre line at its own height", () => {
    expect(INNER_STATUS_PILL_CENTER_Y_PX).toBe(47);
    const box = raisedMenubarBox({
      fillsSafeArea: false,
      contentHeight: "var(--os-metrics-menubar-height)",
      viewportWidth: 669,
    });
    expect(box.top).toBe("calc(47px - (var(--os-metrics-menubar-height)) / 2)");
    expect(box.height).toBe("var(--os-metrics-menubar-height)");
    expect(box.right).toBe("139px");
    expect(box.paddingTop).toBe("0px");
    expect(box.paddingRight).toBe("0.5rem");
  });

  test("an opaque bar still paints from the top edge, row moved by padding", () => {
    const box = raisedMenubarBox({
      fillsSafeArea: true,
      contentHeight: "var(--os-metrics-menubar-height)",
      viewportWidth: 669,
    });
    expect(box.top).toBe("0px");
    expect(box.right).toBe("0px");
    expect(box.height).toBe("calc(47px + (var(--os-metrics-menubar-height)) / 2)");
    expect(box.paddingTop).toBe(
      "calc(47px - (var(--os-metrics-menubar-height)) / 2)",
    );
    expect(box.paddingRight).toBe("calc(139px + 0.5rem)");
  });
});
