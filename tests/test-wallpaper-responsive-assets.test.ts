import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");

describe("responsive wallpaper assets", () => {
  test("has a generated WebP variant for every built-in photo and width", () => {
    const manifest = JSON.parse(
      readFileSync(
        path.join(ROOT, "public/wallpapers/manifest.json"),
        "utf8"
      )
    ) as {
      version: number;
      photoRender: {
        widths: number[];
        formats: string[];
      };
      photos: Record<string, string[]>;
    };

    expect(manifest.version).toBe(2);
    expect(manifest.photoRender.formats).toEqual(["webp"]);
    const photos = Object.values(manifest.photos).flat();
    expect(photos.length).toBeGreaterThan(100);

    for (const photo of photos) {
      const base = photo.replace(/\.[^.]+$/, "");
      for (const width of manifest.photoRender.widths) {
        const variantPath = path.join(
          ROOT,
          "public/wallpapers/variants",
          `${width}w`,
          `${base}.webp`
        );
        expect(existsSync(variantPath)).toBe(true);
        expect(statSync(variantPath).size).toBeGreaterThan(0);
      }
    }
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
