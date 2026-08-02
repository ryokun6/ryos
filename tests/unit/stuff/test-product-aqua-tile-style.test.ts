#!/usr/bin/env bun
import { describe, expect, test } from "bun:test";
import {
  aquaTilePlaceholderSurfaceLuminance,
  productAquaPhotoTileStyle,
  productAquaTileStyle,
  productAquaTileTextColor,
} from "../../../src/apps/stuff/utils/productAquaTileStyle";

describe("productAquaTileStyle", () => {
  test("returns gradient and inset shadow chrome", () => {
    const style = productAquaTileStyle("#2f6fed");
    expect(style.background).toContain("linear-gradient");
    expect(String(style.boxShadow)).toContain("inset");
  });

  test("falls back to aqua blue tint without tag color", () => {
    const style = productAquaTileStyle();
    expect(String(style.background)).toContain("33, 160, 196");
  });

  test("photo tile uses a light clear fill, not strong tinted gel", () => {
    const style = productAquaPhotoTileStyle("#2f6fed");
    expect(String(style.background)).toContain("255, 255, 255, 0.96");
    expect(String(style.background)).toContain("0.14");
    expect(String(style.background)).not.toContain("0.72");
    expect(String(style.boxShadow)).toContain("inset");
  });

  test("uses dark text on light gel surfaces (typical tags)", () => {
    expect(productAquaTileTextColor("#2f6fed")).toContain("20, 36, 48");
    expect(productAquaTileTextColor("#003366")).toContain("20, 36, 48");
    expect(productAquaTileTextColor("#ffffff")).toContain("20, 36, 48");
  });

  test("placeholder surface luminance reflects mid stop on white, not raw tag", () => {
    expect(aquaTilePlaceholderSurfaceLuminance("#003366")).toBeGreaterThan(0.5);
    expect(aquaTilePlaceholderSurfaceLuminance("#ffffff")).toBeGreaterThan(0.8);
  });
});
