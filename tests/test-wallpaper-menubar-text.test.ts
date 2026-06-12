import { describe, expect, test } from "bun:test";
import {
  MENUBAR_LUMINANCE_THRESHOLD,
  menubarTextColorForLuminance,
  menubarTextToneForLuminance,
  wallpaperLuminance,
} from "../src/themes/wallpaperMenubarText";

describe("wallpaper menubar text", () => {
  test("light wallpaper yields dark labels", () => {
    const lum = wallpaperLuminance(220, 200, 240);
    expect(lum).toBeGreaterThan(MENUBAR_LUMINANCE_THRESHOLD);
    expect(menubarTextToneForLuminance(lum)).toBe("dark");
    expect(menubarTextColorForLuminance(lum)).toBe("#000000");
  });

  test("dark wallpaper yields light labels", () => {
    const lum = wallpaperLuminance(30, 25, 40);
    expect(lum).toBeLessThan(MENUBAR_LUMINANCE_THRESHOLD);
    expect(menubarTextToneForLuminance(lum)).toBe("light");
    expect(menubarTextColorForLuminance(lum)).toBe("#f4f4f5");
  });
});
