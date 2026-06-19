import { describe, expect, test } from "bun:test";

import {
  getDesktopDownloadAssetName,
  getDesktopDownloadUrl,
  getSupportedDesktopDownloadTarget,
} from "../src/utils/desktopDownload";

describe("desktop download URLs", () => {
  test("uses the desktop release tag for macOS Apple Silicon DMGs", () => {
    expect(
      getDesktopDownloadUrl("1.0.5", { platform: "mac", arch: "aarch64" })
    ).toBe(
      "https://github.com/ryokun6/ryos/releases/download/v1.0.5/ryOS_1.0.5_aarch64.dmg"
    );
  });

  test("uses the desktop release tag for Windows x64 installers", () => {
    expect(
      getDesktopDownloadUrl("1.0.5", { platform: "windows", arch: "x64" })
    ).toBe(
      "https://github.com/ryokun6/ryos/releases/download/v1.0.5/ryOS_1.0.5_x64.exe"
    );
  });

  test("maps detected Mac browsers to the Apple Silicon DMG target", () => {
    const target = getSupportedDesktopDownloadTarget({ platform: "MacIntel" });

    expect(target).toEqual({
      platform: "mac",
      arch: "aarch64",
      platformLabel: "Mac",
    });
    expect(target && getDesktopDownloadUrl("1.0.5", target)).toBe(
      "https://github.com/ryokun6/ryos/releases/download/v1.0.5/ryOS_1.0.5_aarch64.dmg"
    );
  });

  test("maps any detected Windows runtime to the x64 installer target", () => {
    for (const runtimeInfo of [
      { platform: "Win32" },
      { platform: "Win64" },
      { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      { desktopPlatform: "win32" },
    ]) {
      const target = getSupportedDesktopDownloadTarget(runtimeInfo);

      expect(target).toEqual({
        platform: "windows",
        arch: "x64",
        platformLabel: "Windows",
      });
      expect(target && getDesktopDownloadUrl("1.0.5", target)).toBe(
        "https://github.com/ryokun6/ryos/releases/download/v1.0.5/ryOS_1.0.5_x64.exe"
      );
    }
  });

  test("does not offer a desktop download on mobile browsers", () => {
    const mobileRuntimes: Array<{
      label: string;
      runtime: Parameters<typeof getSupportedDesktopDownloadTarget>[0];
    }> = [
      {
        label: "iPhone Safari (UA contains 'like Mac OS X')",
        runtime: {
          platform: "iPhone",
          userAgent:
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
          maxTouchPoints: 5,
        },
      },
      {
        label: "iPadOS Safari masquerading as Macintosh",
        runtime: {
          platform: "MacIntel",
          userAgent:
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
          maxTouchPoints: 5,
        },
      },
      {
        label: "Android Chrome",
        runtime: {
          platform: "Linux armv8l",
          userAgent:
            "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
          maxTouchPoints: 5,
        },
      },
    ];

    for (const { label, runtime } of mobileRuntimes) {
      expect(getSupportedDesktopDownloadTarget(runtime), label).toBeNull();
    }
  });

  test("still offers a desktop download for non-touch Mac and Windows browsers", () => {
    expect(
      getSupportedDesktopDownloadTarget({
        platform: "MacIntel",
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
        maxTouchPoints: 0,
      })?.platform
    ).toBe("mac");
    expect(
      getSupportedDesktopDownloadTarget({
        platform: "Win32",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        maxTouchPoints: 0,
      })?.platform
    ).toBe("windows");
  });

  test("preserves package-derived versions without hardcoding a release", () => {
    expect(
      getDesktopDownloadUrl("2.3.4", { platform: "mac", arch: "aarch64" })
    ).toBe(
      "https://github.com/ryokun6/ryos/releases/download/v2.3.4/ryOS_2.3.4_aarch64.dmg"
    );
  });

  test("returns no asset for unsupported platforms or architectures", () => {
    expect(
      getDesktopDownloadAssetName("1.0.5", { platform: "mac", arch: "x64" })
    ).toBeNull();
    expect(
      getDesktopDownloadUrl("1.0.5", { platform: "windows", arch: "arm64" })
    ).toBeNull();
    expect(
      getDesktopDownloadUrl("1.0.5", { platform: "linux", arch: "x64" })
    ).toBeNull();
    expect(getSupportedDesktopDownloadTarget({ platform: "Linux x86_64" })).toBeNull();
  });
});
