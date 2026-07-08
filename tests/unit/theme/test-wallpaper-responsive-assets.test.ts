import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..", "..", "..");

describe("wallpaper quality safeguards", () => {
  test("does not generate or advertise lossy responsive variants", () => {
    const manifest = JSON.parse(
      readFileSync(
        path.join(ROOT, "public/wallpapers/manifest.json"),
        "utf8"
      )
    ) as Record<string, unknown>;
    const packageJson = readFileSync(path.join(ROOT, "package.json"), "utf8");

    expect(manifest.version).toBe(1);
    expect(manifest).not.toHaveProperty("photoRender");
    expect(packageJson).not.toContain("generate:wallpaper-variants");
    expect(
      existsSync(path.join(ROOT, "public/wallpapers/variants"))
    ).toBe(false);
  });

  test("resolves shuffle wallpapers without waiting for idle time", () => {
    const source = readFileSync(
      path.join(ROOT, "src/hooks/useShuffleWallpaper.ts"),
      "utf8"
    );
    expect(source).toContain("startManifestLoad();");
    expect(source).not.toContain("requestIdleCallback(startManifestLoad");
  });
});
