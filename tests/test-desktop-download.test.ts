import { describe, expect, test } from "bun:test";

import {
  getDesktopDownloadAssetName,
  getDesktopDownloadUrl,
  getSupportedDesktopDownloadTarget,
} from "../src/utils/desktopDownload";

describe("desktop download URLs", () => {
  test("uses the main release tag for macOS Apple Silicon DMGs", () => {
    expect(
      getDesktopDownloadUrl("1.0.4", { platform: "mac", arch: "aarch64" })
    ).toBe(
      "https://github.com/ryokun6/ryos/releases/download/main/ryOS_1.0.4_aarch64.dmg"
    );
  });

  test("uses the main release tag for Windows x64 installers", () => {
    expect(
      getDesktopDownloadUrl("1.0.4", { platform: "windows", arch: "x64" })
    ).toBe(
      "https://github.com/ryokun6/ryos/releases/download/main/ryOS_1.0.4_x64.exe"
    );
  });

  test("maps detected Mac browsers to the Apple Silicon DMG target", () => {
    const target = getSupportedDesktopDownloadTarget({ platform: "MacIntel" });

    expect(target).toEqual({
      platform: "mac",
      arch: "aarch64",
      platformLabel: "Mac",
    });
    expect(target && getDesktopDownloadUrl("1.0.4", target)).toBe(
      "https://github.com/ryokun6/ryos/releases/download/main/ryOS_1.0.4_aarch64.dmg"
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
      expect(target && getDesktopDownloadUrl("1.0.4", target)).toBe(
        "https://github.com/ryokun6/ryos/releases/download/main/ryOS_1.0.4_x64.exe"
      );
    }
  });

  test("preserves package-derived versions without hardcoding a release", () => {
    expect(
      getDesktopDownloadUrl("2.3.4", { platform: "mac", arch: "aarch64" })
    ).toBe(
      "https://github.com/ryokun6/ryos/releases/download/main/ryOS_2.3.4_aarch64.dmg"
    );
  });

  test("returns no asset for unsupported platforms or architectures", () => {
    expect(
      getDesktopDownloadAssetName("1.0.4", { platform: "mac", arch: "x64" })
    ).toBeNull();
    expect(
      getDesktopDownloadUrl("1.0.4", { platform: "windows", arch: "arm64" })
    ).toBeNull();
    expect(
      getDesktopDownloadUrl("1.0.4", { platform: "linux", arch: "x64" })
    ).toBeNull();
    expect(getSupportedDesktopDownloadTarget({ platform: "Linux x86_64" })).toBeNull();
  });
});
