import { describe, expect, test } from "bun:test";
import {
  collectActiveThemeIconUrls,
  getCoreSoundUrls,
  getThemeStaticAssetUrls,
} from "../src/utils/prefetchAssets";
import type { IconManifest } from "../src/utils/icons";

const manifest: IconManifest = {
  version: 1,
  generatedAt: "test",
  themes: {
    default: ["finder.png", "file.png", "settings.png"],
    macosx: ["finder.png"],
    xp: ["finder.png", "settings.png"],
  },
};

describe("idle shell asset warming", () => {
  test("resolves only requested icons for the active theme", () => {
    const urls = collectActiveThemeIconUrls({
      theme: "macosx",
      manifest,
      iconPaths: [
        "/icons/default/finder.png",
        "/icons/xp/settings.png",
        "/icons/default/file.png",
        "/icons/default/file.png",
        "📦",
      ],
    });
    expect(urls).toEqual([
      "/icons/macosx/finder.png",
      "/icons/default/settings.png",
      "/icons/default/file.png",
    ]);
    expect(urls.some((url) => url.includes("/xp/"))).toBe(false);
  });

  test("warms theme-specific shell art instead of every splash screen", () => {
    expect(getThemeStaticAssetUrls("xp")).toEqual([
      "/assets/splash/xp.png",
      "/assets/splash/xp-boot.gif",
    ]);
    expect(getThemeStaticAssetUrls("xp")).not.toContain(
      "/assets/splash/macos.svg"
    );
    expect(getThemeStaticAssetUrls("macosx")).toContain(
      "/assets/brushed-metal.jpg"
    );
  });

  test("limits sound warmup to common shell feedback", () => {
    const sounds = getCoreSoundUrls();
    expect(sounds).toContain("/sounds/WindowOpen.mp3");
    expect(sounds).toContain("/sounds/MenuOpen.mp3");
    expect(sounds.length).toBeLessThan(20);
  });
});
