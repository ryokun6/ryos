import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  getSafeAnimatePresenceMode,
  getSafeLayoutProp,
  isUnsafeMotionVisualKey,
  sanitizeMotionVariantMap,
  sanitizeMotionVisuals,
} from "../../../src/utils/motionSafe";

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), "utf-8");

describe("motionSafe iOS Safari WAAPI guards", () => {
  test("downgrades popLayout to sync on iOS Safari only", () => {
    expect(getSafeAnimatePresenceMode("popLayout", true)).toBe("sync");
    expect(getSafeAnimatePresenceMode("popLayout", false)).toBe("popLayout");
    expect(getSafeAnimatePresenceMode("wait", true)).toBe("wait");
  });

  test("disables layout projection on iOS Safari only", () => {
    expect(getSafeLayoutProp("position", true)).toBeUndefined();
    expect(getSafeLayoutProp(true, true)).toBeUndefined();
    expect(getSafeLayoutProp("position", false)).toBe("position");
  });

  test("strips filter and textShadow from variants and transitions on iOS Safari", () => {
    const variants = {
      initial: { opacity: 0, filter: "none", textShadow: "0 0 6px #000", y: 10 },
      animate: { opacity: 1, filter: "none", textShadow: "0 0 6px #fff", y: 0 },
    };
    const safe = sanitizeMotionVariantMap(variants, true);
    expect(safe.initial).toEqual({ opacity: 0, y: 10 });
    expect(safe.animate).toEqual({ opacity: 1, y: 0 });
    expect(sanitizeMotionVariantMap(variants, false)).toEqual(variants);

    const transition = {
      duration: 0.15,
      filter: { duration: 0.2 },
      textShadow: { duration: 0.15 },
      opacity: { duration: 0.15 },
    };
    expect(sanitizeMotionVisuals(transition, true)).toEqual({
      duration: 0.15,
      opacity: { duration: 0.15 },
    });
    expect(isUnsafeMotionVisualKey("filter")).toBe(true);
    expect(isUnsafeMotionVisualKey("opacity")).toBe(false);
  });

  test("lyrics lines skip Motion entirely on iOS WebKit", () => {
    const lyrics = readSource(
      "src/apps/ipod/components/lyrics-display/LyricsDisplayLines.tsx",
    );
    const titleCard = readSource(
      "src/apps/karaoke/components/karaoke-lyrics-playback/KaraokeTitleCard.tsx",
    );
    const lyricsDisplay = readSource(
      "src/apps/ipod/components/lyrics-display/LyricsDisplay.tsx",
    );

    expect(lyrics).toContain("isIosWebKit");
    expect(lyrics).toContain("shouldUseStaticLyricsRenderer");
    expect(lyrics).toContain("useStaticLyrics");
    expect(lyrics).not.toMatch(/mode="popLayout"/);
    expect(lyrics).not.toMatch(/layout="position"/);
    expect(lyrics).not.toContain("isMobileSafari");
    expect(titleCard).toContain("shouldUseStaticLyricsRenderer");
    expect(titleCard).not.toMatch(/layout="position"/);
    expect(lyricsDisplay).toContain("IsolatingErrorBoundary");
  });

  test("desktop chrome and wallpaper isolate Motion throws from Desktop", () => {
    const wallpaper = readSource(
      "src/components/layout/desktop/DesktopDynamicWallpaper.tsx",
    );
    const cover = readSource(
      "src/components/layout/desktop/DesktopCoverWallpaperLayer.tsx",
    );
    const dock = readSource("src/components/layout/dock/MacDock.tsx");
    const taskbar = readSource(
      "src/components/layout/menu-bar/WindowsTaskbar.tsx",
    );
    const appManager = readSource(
      "src/apps/base/app-manager/AppManagerView.tsx",
    );
    expect(wallpaper).toContain("IsolatingErrorBoundary");
    expect(wallpaper.match(/IsolatingErrorBoundary/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(cover).toContain("getSafeAnimatePresenceMode");
    expect(cover).toContain("isIosWebKit");
    expect(dock).toContain("getSafeAnimatePresenceMode");
    expect(dock).not.toMatch(/mode="popLayout"/);
    expect(taskbar).toContain("getSafeAnimatePresenceMode");
    expect(appManager).toContain("<Dock />");
    expect(appManager).toMatch(/<IsolatingErrorBoundary[\s\S]*<Dock/);
    expect(appManager).toMatch(/<IsolatingErrorBoundary[\s\S]*<Desktop/);
  });
});
