import { describe, expect, test } from "bun:test";
import { coerceDisplayMode, DisplayMode } from "@/types/lyrics";

describe("coerceDisplayMode", () => {
  test("allows valid persisted enum strings", () => {
    expect(coerceDisplayMode(DisplayMode.Mesh)).toBe(DisplayMode.Mesh);
    expect(coerceDisplayMode("water")).toBe(DisplayMode.Water);
  });

  test("maps unknown legacy or corrupt values back to Video", () => {
    expect(coerceDisplayMode("liquid")).toBe(DisplayMode.Video);
    expect(coerceDisplayMode("")).toBe(DisplayMode.Video);
    expect(coerceDisplayMode(null)).toBe(DisplayMode.Video);
    expect(coerceDisplayMode(undefined)).toBe(DisplayMode.Video);
  });
});
