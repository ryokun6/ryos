#!/usr/bin/env bun
/**
 * Generate a wallpaper manifest similar to the icon manifest.
 * Scans public/wallpapers for tiles, photos (grouped by category), and videos.
 */
import { readdir, stat, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const WALLPAPERS_ROOT = "public/wallpapers";

interface WallpaperManifest {
  version: number;
  generatedAt: string;
  tiles: string[]; // e.g. ["tiles/azul_dark.png"]
  photos: Record<string, string[]>; // category -> ["photos/category/file.jpg"]
  videos: string[]; // e.g. ["videos/blue_flowers_loop.mp4"]
}

async function safeReaddir(path: string): Promise<string[]> {
  try {
    return await readdir(path);
  } catch {
    return [];
  }
}

async function collectTiles(): Promise<string[]> {
  const dir = join(WALLPAPERS_ROOT, "tiles");
  const entries = await safeReaddir(dir);
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.startsWith(".")) continue;
    const full = join(dir, entry);
    try {
      const s = await stat(full);
      if (s.isFile()) {
        files.push(relative(WALLPAPERS_ROOT, full).split(sep).join("/"));
      }
    } catch {
      // ignore
    }
  }
  files.sort();
  return files;
}

async function collectVideos(): Promise<string[]> {
  const dir = join(WALLPAPERS_ROOT, "videos");
  const entries = await safeReaddir(dir);
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.startsWith(".")) continue;
    const full = join(dir, entry);
    try {
      const s = await stat(full);
      if (s.isFile()) {
        files.push(relative(WALLPAPERS_ROOT, full).split(sep).join("/"));
      }
    } catch {
      // ignore
    }
  }
  files.sort();
  return files;
}

async function collectPhotos(): Promise<Record<string, string[]>> {
  const photosRoot = join(WALLPAPERS_ROOT, "photos");
  const categories: Record<string, string[]> = {};
  const catEntries = await safeReaddir(photosRoot);
  for (const cat of catEntries) {
    if (cat.startsWith(".")) continue;
    const catDir = join(photosRoot, cat);
    try {
      const s = await stat(catDir);
      if (!s.isDirectory()) continue;
    } catch {
      continue;
    }
    const files: string[] = [];
    const photoEntries = await safeReaddir(catDir);
    for (const f of photoEntries) {
      if (f.startsWith(".")) continue;
      const full = join(catDir, f);
      try {
        const st = await stat(full);
        if (st.isFile()) {
          files.push(relative(WALLPAPERS_ROOT, full).split(sep).join("/"));
        }
      } catch {
        // ignore
      }
    }
    files.sort();
    categories[cat] = files;
  }
  return categories;
}

async function build() {
  const manifest: WallpaperManifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    tiles: await collectTiles(),
    photos: await collectPhotos(),
    videos: await collectVideos(),
  };

  const outPath = join(WALLPAPERS_ROOT, "manifest.json");
  await writeFile(outPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`[wallpaper-manifest] Wrote ${outPath}`);
}

build().catch((err) => {
  console.error("[wallpaper-manifest] Failed:", err);
  process.exit(1);
});
