import { describe, expect, test } from "bun:test";

import {
  coverSrcMayHaveAlpha,
  findOpaqueAlphaBounds,
  imageDataHasCutoutTransparency,
  invalidateCoverTransparencyCache,
} from "../../../src/apps/stuff/utils/stuffCoverCutout";

function rgbaBuffer(
  width: number,
  height: number,
  paint: (x: number, y: number) => number
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = 255;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = paint(x, y);
    }
  }
  return data;
}

describe("findOpaqueAlphaBounds", () => {
  test("returns null for fully transparent images", () => {
    const data = rgbaBuffer(4, 4, () => 0);
    expect(findOpaqueAlphaBounds(data, 4, 4)).toBeNull();
  });

  test("finds the opaque subject bounding box", () => {
    const data = rgbaBuffer(8, 8, (x, y) =>
      x >= 2 && x <= 5 && y >= 3 && y <= 6 ? 255 : 0
    );
    expect(findOpaqueAlphaBounds(data, 8, 8)).toEqual({
      minX: 2,
      minY: 3,
      maxX: 5,
      maxY: 6,
    });
  });

  test("ignores nearly-transparent fringe below the alpha threshold", () => {
    const data = rgbaBuffer(6, 6, (x, y) => {
      if (x === 1 && y === 1) return 4; // below default threshold
      if (x === 3 && y === 4) return 255;
      return 0;
    });
    expect(findOpaqueAlphaBounds(data, 6, 6)).toEqual({
      minX: 3,
      minY: 4,
      maxX: 3,
      maxY: 4,
    });
  });
});

describe("imageDataHasCutoutTransparency", () => {
  test("returns false for fully opaque pixels", () => {
    const data = rgbaBuffer(4, 4, () => 255);
    expect(imageDataHasCutoutTransparency(data)).toBe(false);
  });

  test("returns false for fully transparent pixels", () => {
    const data = rgbaBuffer(4, 4, () => 0);
    expect(imageDataHasCutoutTransparency(data)).toBe(false);
  });

  test("returns true when opaque subject sits on transparent pixels", () => {
    const data = rgbaBuffer(4, 4, (x, y) =>
      x === 1 && y === 1 ? 255 : 0
    );
    expect(imageDataHasCutoutTransparency(data)).toBe(true);
  });
});

describe("coverSrcMayHaveAlpha", () => {
  test("rejects JPEG data URLs and extensions", () => {
    expect(coverSrcMayHaveAlpha("data:image/jpeg;base64,abc")).toBe(false);
    expect(coverSrcMayHaveAlpha("https://cdn.example/cover.jpg")).toBe(false);
    expect(coverSrcMayHaveAlpha("https://cdn.example/cover.jpeg?x=1")).toBe(
      false
    );
  });

  test("allows PNG/WebP and blob URLs", () => {
    expect(coverSrcMayHaveAlpha("data:image/png;base64,abc")).toBe(true);
    expect(coverSrcMayHaveAlpha("data:image/webp;base64,abc")).toBe(true);
    expect(coverSrcMayHaveAlpha("blob:https://example/uuid")).toBe(true);
    expect(coverSrcMayHaveAlpha("https://cdn.example/cutout.png")).toBe(true);
  });

  test("invalidate clears cache entries", () => {
    invalidateCoverTransparencyCache();
    invalidateCoverTransparencyCache("blob-1");
  });
});
