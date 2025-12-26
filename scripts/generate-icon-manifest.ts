#!/usr/bin/env bun
/**
 * Generate an icon manifest for themed icons.
 * Currently only processes the `default` theme folder under public/icons/default.
 * Later, additional theme folders (e.g. system7, macosx) can be added.
 */
import { readdir, stat, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const ICONS_ROOT = "public/icons";
// Auto-detect theme directories under public/icons (any subdirectory)
async function detectThemeDirs(): Promise<string[]> {
  try {
    const entries = await readdir(ICONS_ROOT, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .filter((name) => !name.startsWith("."))
      .sort();
  } catch (e) {
    console.warn(
      "[manifest] Failed to detect theme directories:",
      (e as Error).message
    );
    return ["default"]; // fallback
  }
}

async function collectFiles(theme: string) {
  const themeRoot = join(ICONS_ROOT, theme);
  const files: string[] = [];

  async function walk(dir: string) {
    const entries = await readdir(dir);
    for (const entry of entries) {
      if (entry.startsWith(".")) continue; // skip hidden
      const full = join(dir, entry);
      const s = await stat(full);
      if (s.isDirectory()) {
        await walk(full);
      } else {
        files.push(relative(themeRoot, full).split(sep).join("/"));
      }
    }
  }

  try {
    await walk(themeRoot);
  } catch (e) {
    console.warn(`[manifest] Skipping theme '${theme}':`, (e as Error).message);
  }

  files.sort();
  return files;
}

async function build() {
  const themes: Record<string, string[]> = {};
  const themeDirs = await detectThemeDirs();
  for (const theme of themeDirs) {
    themes[theme] = await collectFiles(theme);
  }

  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    themes,
  };

  const outPath = join(ICONS_ROOT, "manifest.json");
  await writeFile(outPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`[manifest] Wrote ${outPath}`);
}

build().catch((err) => {
  console.error("[manifest] Failed:", err);
  process.exit(1);
});
