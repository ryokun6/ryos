import { describe, expect, test } from "bun:test";
import { normalizeWindowFrame } from "../src/hooks/windowFrameGeometry";

describe("normalizeWindowFrame", () => {
  test("pins a desktop window to the mobile viewport", () => {
    const result = normalizeWindowFrame({
      position: { x: 720, y: 900 },
      size: { width: 680, height: 400 },
      viewport: { width: 390, height: 844 },
      topInset: 28,
      bottomInset: 20,
      isMobile: true,
      mobileSize: { width: 390, height: 400 },
    });

    expect(result.position.x).toBe(0);
    expect(result.position.y).toBeLessThanOrEqual(744);
    expect(result.size).toEqual({ width: 390, height: 400 });
  });

  test("keeps a mobile window below the menu bar", () => {
    const result = normalizeWindowFrame({
      position: { x: 0, y: 0 },
      size: { width: 390, height: 400 },
      viewport: { width: 390, height: 844 },
      topInset: 28,
      bottomInset: 20,
      isMobile: true,
      mobileSize: { width: 390, height: 400 },
    });

    expect(result.position).toEqual({ x: 0, y: 28 });
  });

  test("clamps an off-screen desktop frame back into view", () => {
    const result = normalizeWindowFrame({
      position: { x: 1400, y: 900 },
      size: { width: 680, height: 400 },
      viewport: { width: 1024, height: 768 },
      topInset: 24,
      bottomInset: 0,
      isMobile: false,
      mobileSize: { width: 390, height: 400 },
    });

    expect(result.position).toEqual({ x: 344, y: 688 });
    expect(result.size).toEqual({ width: 680, height: 400 });
  });

  test("shrinks a desktop frame wider than the viewport", () => {
    const result = normalizeWindowFrame({
      position: { x: 300, y: 40 },
      size: { width: 1280, height: 500 },
      viewport: { width: 1024, height: 768 },
      topInset: 24,
      bottomInset: 0,
      isMobile: false,
      mobileSize: { width: 390, height: 400 },
    });

    expect(result.position.x).toBe(0);
    expect(result.size.width).toBe(1024);
  });
});
