import { describe, expect, test } from "bun:test";
import { resolveDrawerLayout } from "../src/components/shared/appDrawerLayout";

const baseSide = {
  isCompact: false,
  viewport: { width: 1280, height: 800 },
  topInset: 30,
  bottomInset: 0,
  sideProtrusionPx: 240,
  sheetMaxHeightPx: 224,
  sideMarginPx: 0,
  sheetMarginPx: 12,
  minSize: { width: 300, height: 380 },
};

const baseSheet = {
  ...baseSide,
  isCompact: true,
  viewport: { width: 390, height: 844 },
  topInset: 28,
  bottomInset: 20,
};

describe("resolveDrawerLayout — desktop side drawer", () => {
  test("uses right side when there is room", () => {
    const result = resolveDrawerLayout({
      ...baseSide,
      window: { x: 100, y: 60, width: 600, height: 500 },
    });
    expect(result.placement).toBe("right");
    expect(result.windowAdjust).toBeNull();
  });

  test("falls back to left side when right does not fit", () => {
    const result = resolveDrawerLayout({
      ...baseSide,
      // Window flush to the right edge; left side has plenty of room.
      window: { x: 600, y: 60, width: 680, height: 500 },
    });
    expect(result.placement).toBe("left");
    expect(result.windowAdjust).toBeNull();
  });

  test("repositions the window when neither side fits", () => {
    // Window is wide but offset such that neither side has 240px of room.
    const result = resolveDrawerLayout({
      ...baseSide,
      window: { x: 50, y: 60, width: 1100, height: 500 },
    });
    expect(result.placement).toBe("right");
    expect(result.windowAdjust).not.toBeNull();
    const adj = result.windowAdjust!;
    // After the adjustment, right side must fit.
    expect(adj.x + adj.width + 240).toBeLessThanOrEqual(1280);
    // Should respect top inset.
    expect(adj.y).toBeGreaterThanOrEqual(30);
  });

  test("resizes the window down when it is too wide", () => {
    // Window is wider than viewport - drawer protrusion; needs both x reposition + width shrink.
    const result = resolveDrawerLayout({
      ...baseSide,
      window: { x: 0, y: 60, width: 1200, height: 500 },
    });
    expect(result.placement).toBe("right");
    expect(result.windowAdjust).not.toBeNull();
    const adj = result.windowAdjust!;
    expect(adj.width).toBeLessThanOrEqual(1280 - 240);
    expect(adj.x + adj.width + 240).toBeLessThanOrEqual(1280);
    expect(adj.width).toBeGreaterThanOrEqual(300);
  });

  test("returns a best-effort placement when even minWidth cannot fit", () => {
    const result = resolveDrawerLayout({
      ...baseSide,
      viewport: { width: 400, height: 800 },
      window: { x: 0, y: 60, width: 350, height: 500 },
    });
    expect(result.placement).toBe("right");
    expect(result.windowAdjust).not.toBeNull();
    expect(result.windowAdjust!.x).toBe(0);
  });
});

describe("resolveDrawerLayout — compact bottom sheet", () => {
  test("uses bottom when there is room", () => {
    const result = resolveDrawerLayout({
      ...baseSheet,
      window: { x: 0, y: 28, width: 390, height: 400 },
    });
    expect(result.placement).toBe("bottom");
    expect(result.windowAdjust).toBeNull();
  });

  test("falls back to top when bottom does not fit but top does", () => {
    const result = resolveDrawerLayout({
      ...baseSheet,
      // Window pushed near the bottom of the viewport, leaving plenty of room above.
      window: { x: 0, y: 280, width: 390, height: 540 },
    });
    expect(result.placement).toBe("top");
    expect(result.windowAdjust).toBeNull();
  });

  test("repositions vertically when neither side fits", () => {
    const result = resolveDrawerLayout({
      ...baseSheet,
      // Window fills nearly the whole vertical space starting near the top.
      window: { x: 0, y: 60, width: 390, height: 700 },
    });
    expect(result.placement).toBe("bottom");
    expect(result.windowAdjust).not.toBeNull();
    const adj = result.windowAdjust!;
    // After reposition the sheet must fit at the bottom.
    expect(adj.y + adj.height + 224 + 12).toBeLessThanOrEqual(844 - 20);
  });

  test("respects minHeight when forced to shrink", () => {
    const result = resolveDrawerLayout({
      ...baseSheet,
      // Window is taller than the viewport-minus-sheet space → must shrink.
      window: { x: 0, y: 28, width: 390, height: 760 },
    });
    expect(result.placement).toBe("bottom");
    expect(result.windowAdjust).not.toBeNull();
    const adj = result.windowAdjust!;
    expect(adj.height).toBeGreaterThanOrEqual(380);
    expect(adj.y + adj.height + 224 + 12).toBeLessThanOrEqual(844 - 20);
  });
});
