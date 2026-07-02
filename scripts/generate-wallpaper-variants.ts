#!/usr/bin/env node
/**
 * Generates responsive WebP variants for built-in photo wallpapers. Canonical
 * source paths remain the persisted identity; render code selects one of these
 * files based on viewport width and device pixel ratio.
 */
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import sharp from "sharp";

const WALLPAPERS_ROOT = "public/wallpapers";
const MANIFEST_PATH = join(WALLPAPERS_ROOT, "manifest.json");
const WIDTHS = [1280, 1920, 2560] as const;
const WEBP_QUALITY = 72;
const CONCURRENCY = 4;

interface WallpaperManifest {
  photos: Record<string, string[]>;
}

function variantRelativePath(sourceRelativePath: string, width: number): string {
  const extension = extname(sourceRelativePath);
  const base = sourceRelativePath.slice(0, -extension.length);
  return `variants/${width}w/${base}.webp`;
}

async function isCurrent(sourcePath: string, outputPath: string): Promise<boolean> {
  try {
    const [source, output] = await Promise.all([
      stat(sourcePath),
      stat(outputPath),
    ]);
    return output.size > 0 && output.mtimeMs >= source.mtimeMs;
  } catch {
    return false;
  }
}

async function generateVariant(
  sourceRelativePath: string,
  width: number
): Promise<boolean> {
  const sourcePath = join(WALLPAPERS_ROOT, sourceRelativePath);
  const outputPath = join(
    WALLPAPERS_ROOT,
    variantRelativePath(sourceRelativePath, width)
  );
  if (await isCurrent(sourcePath, outputPath)) {
    return false;
  }

  await mkdir(dirname(outputPath), { recursive: true });
  const output = await sharp(sourcePath)
    .resize(width, null, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY, effort: 4 })
    .toBuffer();
  await writeFile(outputPath, output);
  return true;
}

async function runPool<T>(
  items: readonly T[],
  worker: (item: T) => Promise<void>
): Promise<void> {
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(CONCURRENCY, items.length) },
    async () => {
      while (cursor < items.length) {
        const item = items[cursor++];
        await worker(item);
      }
    }
  );
  await Promise.all(workers);
}

async function build() {
  const manifest = JSON.parse(
    await readFile(MANIFEST_PATH, "utf8")
  ) as WallpaperManifest;
  const photos = Object.values(manifest.photos ?? {}).flat();
  const jobs = photos.flatMap((photo) =>
    WIDTHS.map((width) => ({ photo, width }))
  );

  let completed = 0;
  let generated = 0;
  await runPool(jobs, async ({ photo, width }) => {
    if (await generateVariant(photo, width)) {
      generated++;
    }
    completed++;
    if (completed % 25 === 0 || completed === jobs.length) {
      console.log(`[wallpaper-variants] ${completed}/${jobs.length}`);
    }
  });

  console.log(
    `[wallpaper-variants] Generated ${generated}; ${jobs.length - generated} already current`
  );
}

build().catch((error) => {
  console.error("[wallpaper-variants] Failed:", error);
  process.exit(1);
});
