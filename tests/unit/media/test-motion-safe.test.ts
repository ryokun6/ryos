import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), "utf-8");

describe("Motion 12 animation paths stay enabled on iOS", () => {
  test("lyrics and title card use Motion layout animations", () => {
    const lyrics = readSource(
      "src/apps/ipod/components/lyrics-display/LyricsDisplayLines.tsx",
    );
    const titleCard = readSource(
      "src/apps/karaoke/components/karaoke-lyrics-playback/KaraokeTitleCard.tsx",
    );
    const lyricsDisplay = readSource(
      "src/apps/ipod/components/lyrics-display/LyricsDisplay.tsx",
    );

    expect(lyrics).toContain('mode="popLayout"');
    expect(lyrics).toContain('layout="position"');
    expect(lyrics).not.toContain("shouldUseStaticLyricsRenderer");
    expect(lyrics).not.toContain("useStaticLyrics");
    expect(lyrics).not.toContain("motionSafe");
    expect(titleCard).toContain('layout="position"');
    expect(titleCard).not.toContain("shouldUseStaticLyricsRenderer");
    expect(titleCard).not.toContain("motionSafe");
    expect(lyricsDisplay).toContain("IsolatingErrorBoundary");
  });

  test("dock, taskbar, and wallpaper keep popLayout and isolate throws", () => {
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

    expect(cover).toContain('mode="popLayout"');
    expect(cover).not.toContain("motionSafe");
    expect(dock).toContain('mode="popLayout"');
    expect(dock).not.toContain("motionSafe");
    expect(taskbar).toContain('mode="popLayout"');
    expect(taskbar).not.toContain("motionSafe");
    expect(wallpaper).toContain("IsolatingErrorBoundary");
    expect(wallpaper.match(/IsolatingErrorBoundary/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(appManager).toContain("<Dock />");
    expect(appManager).toMatch(/<IsolatingErrorBoundary[\s\S]*<Dock/);
    expect(appManager).toMatch(/<IsolatingErrorBoundary[\s\S]*<Desktop/);
  });

  test("motion stays on the main-compatible 12.x range", () => {
    const pkg = JSON.parse(readSource("package.json")) as { dependencies: Record<string, string> };
    expect(pkg.dependencies.motion).toMatch(/^\^12\./);
  });
});
