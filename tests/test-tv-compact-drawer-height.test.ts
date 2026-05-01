import { describe, expect, test } from "bun:test";
import {
  clampTvCompactDrawerHeightPx,
  defaultTvCompactDrawerHeightPx,
  getTvCompactDrawerHeightBounds,
} from "../src/apps/tv/utils/compactDrawerHeight";

describe("defaultTvCompactDrawerHeightPx", () => {
  test("matches min(28% inner height, 200px)", () => {
    expect(defaultTvCompactDrawerHeightPx(500)).toBe(Math.round(Math.min(500 * 0.28, 200)));
    expect(defaultTvCompactDrawerHeightPx(1000)).toBe(200);
  });
});

describe("clampTvCompactDrawerHeightPx / getTvCompactDrawerHeightBounds", () => {
  test("bounds min is 120 and max is reachable from viewport", () => {
    const vh = 700;
    const { minPx, maxPx } = getTvCompactDrawerHeightBounds(vh);
    expect(minPx).toBe(120);
    expect(maxPx).toBeGreaterThan(minPx);
    expect(maxPx).toBe(Math.max(120, Math.round(Math.min(vh * 0.58, vh - 160))));
  });

  test("clamps below min and above max", () => {
    const vh = 640;
    const { minPx, maxPx } = getTvCompactDrawerHeightBounds(vh);
    expect(clampTvCompactDrawerHeightPx(40, vh)).toBe(minPx);
    expect(clampTvCompactDrawerHeightPx(9999, vh)).toBe(maxPx);
  });

  test("allows growth past old 200px cap when viewport permits", () => {
    const vh = 800;
    expect(clampTvCompactDrawerHeightPx(350, vh)).toBeGreaterThanOrEqual(350);
  });
});
