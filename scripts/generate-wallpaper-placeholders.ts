#!/usr/bin/env node
/**
 * Generates blur-up loading placeholders for built-in wallpapers.
 *
 * For every photo we emit:
 *   - `color`: the average RGB of the image as a hex string. Used as an instant
 *     solid-color base while the blurred + full images decode.
 *   - `blur`: a tiny (~24px wide) heavily-compressed JPEG encoded as a base64
 *     data URI. Painted (CSS-blurred) immediately as a low-quality placeholder
 *     so the desktop never shows a blank flash while the multi-MB full image
 *     downloads.
 *
 * Tiles only get a `color` (they are small, tile at 64px, and load fast, so a
 * blurred LQIP is meaningless). Videos are skipped entirely.
 *
 * Output: public/wallpapers/placeholders.json — kept separate from
 * manifest.json (which is fetched `no-store` on every load) so the larger blur
 * payload can be cached aggressively.
 *
 * Run AFTER the manifest exists: `bun run generate:wallpapers` chains this.
 * Sharp aborts under Bun, so this script is executed with Node (via tsx).
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const WALLPAPERS_ROOT = "public/wallpapers";
const MANIFEST_PATH = join(WALLPAPERS_ROOT, "manifest.json");
const OUT_PATH = join(WALLPAPERS_ROOT, "placeholders.json");

/** Low-quality image placeholder tuning (small + blurry = tiny payload). */
const LQIP_WIDTH = 24;
const LQIP_QUALITY = 40;

interface WallpaperManifest {
  tiles: string[];
  photos: Record<string, string[]>;
  videos: string[];
}

interface WallpaperPlaceholder {
  /** Average color as `#rrggbb`. */
  color: string;
  /** Tiny blurred JPEG data URI (photos only). */
  blur?: string;
}

interface PlaceholderManifest {
  version: number;
  generatedAt: string;
  placeholders: Record<string, WallpaperPlaceholder>;
}

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function toHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b].map((v) => clampByte(v).toString(16).padStart(2, "0")).join("")
  );
}

/** Average (mean) color — blends smoothly under the blurred placeholder. */
async function averageColor(absPath: string): Promise<string> {
  const stats = await sharp(absPath).stats();
  const ch = stats.channels;
  // Grayscale images expose a single channel; replicate it across RGB.
  if (ch.length === 1) return toHex(ch[0].mean, ch[0].mean, ch[0].mean);
  return toHex(ch[0].mean, ch[1].mean, ch[2].mean);
}

/** Tiny CSS-blurrable JPEG data URI. */
async function lqipDataUri(absPath: string): Promise<string> {
  const buf = await sharp(absPath)
    .resize(LQIP_WIDTH, null, { fit: "inside", withoutEnlargement: true })
    .blur(1)
    .jpeg({ quality: LQIP_QUALITY, chromaSubsampling: "4:2:0" })
    .toBuffer();
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

async function build() {
  const manifestRaw = await readFile(MANIFEST_PATH, "utf8");
  const manifest = JSON.parse(manifestRaw) as WallpaperManifest;

  const placeholders: Record<string, WallpaperPlaceholder> = {};

  const photoPaths = Object.values(manifest.photos ?? {}).flat();
  let done = 0;
  const total = photoPaths.length + (manifest.tiles?.length ?? 0);

  for (const rel of photoPaths) {
    const abs = join(WALLPAPERS_ROOT, rel);
    try {
      const [color, blur] = await Promise.all([
        averageColor(abs),
        lqipDataUri(abs),
      ]);
      placeholders[rel] = { color, blur };
    } catch (err) {
      console.warn(`[wallpaper-placeholders] skip ${rel}:`, (err as Error).message);
    }
    if (++done % 25 === 0) {
      console.log(`[wallpaper-placeholders] ${done}/${total}`);
    }
  }

  for (const rel of manifest.tiles ?? []) {
    const abs = join(WALLPAPERS_ROOT, rel);
    try {
      placeholders[rel] = { color: await averageColor(abs) };
    } catch (err) {
      console.warn(`[wallpaper-placeholders] skip ${rel}:`, (err as Error).message);
    }
    done++;
  }

  const out: PlaceholderManifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    placeholders,
  };

  await writeFile(OUT_PATH, JSON.stringify(out) + "\n");
  const bytes = Buffer.byteLength(JSON.stringify(out));
  console.log(
    `[wallpaper-placeholders] Wrote ${OUT_PATH} (${Object.keys(placeholders).length} entries, ${(bytes / 1024).toFixed(1)} KB)`
  );
}

build().catch((err) => {
  console.error("[wallpaper-placeholders] Failed:", err);
  process.exit(1);
});
