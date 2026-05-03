/**
 * Computes per-image dominant-accent RGB for Infinite Mac / Infinite PC thumbnails and PC game images,
 * then writes generated TS modules used for card overlay and loading-placeholder backgrounds.
 * Uses the most common “accent” color (most saturated among top palette colors) instead of
 * average, so cards look less dull.
 *
 * Run: bun run generate:average-colors
 * Requires: ImageMagick (`magick` on PATH; `brew install imagemagick` on macOS).
 */

import { readdirSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";

const ROOT = join(import.meta.dir, "..");
const DEFAULT_RGB = "90,95,110";
/** Darken factor for the chosen accent so it still works as card bg. */
const DARKEN = 0.7;

// Game id → path relative to project root (public/...)
const GAME_IMAGE_PATHS: { id: string; path: string }[] = [
  { id: "doom", path: "public/assets/games/images/doom.webp" },
  { id: "simcity2000", path: "public/assets/games/images/simcity2000.webp" },
  { id: "mario", path: "public/assets/games/images/mario.webp" },
  { id: "princeofpersia", path: "public/assets/games/images/prince.webp" },
  { id: "aladdin", path: "public/assets/games/images/aladdin.webp" },
  { id: "oregontrail", path: "public/assets/games/images/oregon-trail.webp" },
  { id: "commandandconquer", path: "public/assets/games/images/command-conquer.webp" },
  { id: "atrain", path: "public/assets/games/images/a-train.webp" },
  { id: "simrefinery", path: "public/assets/games/images/simrefinery.webp" },
];

function saturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

/** Weighted average RGB from palette (count * r, etc.). */
function weightedAvg(parsed: { count: number; r: number; g: number; b: number }[]): { r: number; g: number; b: number } {
  let t = 0, tr = 0, tg = 0, tb = 0;
  for (const p of parsed) {
    t += p.count;
    tr += p.count * p.r;
    tg += p.count * p.g;
    tb += p.count * p.b;
  }
  if (t === 0) return { r: 0, g: 0, b: 0 };
  return {
    r: Math.round(tr / t),
    g: Math.round(tg / t),
    b: Math.round(tb / t),
  };
}

/** Picks the dominant “accent” color: most saturated among the top palette colors by frequency.
 *  For nearly grayscale images (chosen accent saturation < threshold), uses weighted average
 *  so similar B&W thumbnails (e.g. System 1 vs 6) get similar grays. */
const GRAYSCALE_SAT_THRESHOLD = 0.08;

function magickBin(): string {
  const fromEnv = process.env.MAGICK_BIN;
  if (fromEnv) return fromEnv;
  const brew = "/opt/homebrew/bin/magick";
  try {
    const check = spawnSync(brew, ["-version"], { encoding: "utf8" });
    if (check.status === 0) return brew;
  } catch {
    /* use PATH */
  }
  return "magick";
}

function computeDominantAccentRgb(imagePath: string): string {
  const result = spawnSync(
    magickBin(),
    [
      imagePath,
      "-resize",
      "80x80!",
      "-colors",
      "24",
      "-format",
      "%c",
      "histogram:info:-",
    ],
    { encoding: "utf8", cwd: ROOT }
  );
  if (result.error || result.status !== 0) {
    return DEFAULT_RGB;
  }
  const lines = (result.stdout ?? "").trim().split("\n").filter(Boolean);
  const parsed: { count: number; r: number; g: number; b: number }[] = [];
  for (const line of lines) {
    const m = /^\s*(\d+):\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/.exec(line);
    if (!m) continue;
    parsed.push({
      count: Number(m[1]),
      r: Math.round(Number(m[2])),
      g: Math.round(Number(m[3])),
      b: Math.round(Number(m[4])),
    });
  }
  if (parsed.length === 0) return DEFAULT_RGB;
  parsed.sort((a, b) => b.count - a.count);
  const top = parsed.slice(0, Math.min(8, parsed.length));
  const best = top.reduce((acc, cur) =>
    saturation(cur.r, cur.g, cur.b) >= saturation(acc.r, acc.g, acc.b) ? cur : acc
  );
  const sat = saturation(best.r, best.g, best.b);
  const source = sat < GRAYSCALE_SAT_THRESHOLD ? weightedAvg(parsed) : best;
  const r = Math.round(source.r * DARKEN);
  const g = Math.round(source.g * DARKEN);
  const b = Math.round(source.b * DARKEN);
  return `${r},${g},${b}`;
}

function main() {
  function colorsFromThumbnailDir(dir: string, label: string): [string, string][] {
    const entries: [string, string][] = [];
    try {
      const files = readdirSync(dir);
      for (const f of files) {
        if (!f.endsWith(".png")) continue;
        const id = f.replace(/\.png$/, "");
        entries.push([id, computeDominantAccentRgb(join(dir, f))]);
      }
    } catch (e) {
      console.warn(`${label} thumbnails dir not found or unreadable:`, dir, e);
    }
    return entries;
  }

  const macPresetEntries = colorsFromThumbnailDir(
    join(ROOT, "public/assets/infinite-mac-thumbnails"),
    "Infinite Mac"
  );
  const pcPresetEntries = colorsFromThumbnailDir(
    join(ROOT, "public/assets/infinite-pc-thumbnails"),
    "Infinite PC"
  );

  const gameEntries: [string, string][] = GAME_IMAGE_PATHS.map(({ id, path }) => {
    const abs = join(ROOT, path);
    return [id, computeDominantAccentRgb(abs)];
  });

  const macPresetLines = macPresetEntries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, rgb]) => `  "${id}": "${rgb}",`)
    .join("\n");

  const pcPresetLines = pcPresetEntries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, rgb]) => `  "${id}": "${rgb}",`)
    .join("\n");

  const gameLines = gameEntries
    .map(([id, rgb]) => `  "${id}": "${rgb}",`)
    .join("\n");

  const macPresetFile = `/** Generated by scripts/compute-average-colors.ts — do not edit by hand. */\n\nexport const PRESET_AVERAGE_COLORS: Record<string, string> = {\n${macPresetLines}\n};\n`;
  const pcPresetFile = `/** Generated by scripts/compute-average-colors.ts — do not edit by hand. */\n\nexport const INFINITE_PC_PRESET_AVERAGE_COLORS: Record<string, string> = {\n${pcPresetLines}\n};\n`;
  const gameFile = `/** Generated by scripts/compute-average-colors.ts — do not edit by hand. */\n\nexport const GAME_AVERAGE_COLORS: Record<string, string> = {\n${gameLines}\n};\n`;

  const macPresetOut = join(ROOT, "src/apps/infinite-mac/presetAverageColors.generated.ts");
  const pcPresetOut = join(
    ROOT,
    "src/apps/infinite-pc/presetAverageColors.generated.ts"
  );
  const gameOut = join(ROOT, "src/apps/pc/gameAverageColors.generated.ts");
  mkdirSync(join(ROOT, "src/apps/infinite-mac"), { recursive: true });
  mkdirSync(join(ROOT, "src/apps/infinite-pc"), { recursive: true });
  mkdirSync(join(ROOT, "src/apps/pc"), { recursive: true });
  writeFileSync(macPresetOut, macPresetFile);
  writeFileSync(pcPresetOut, pcPresetFile);
  writeFileSync(gameOut, gameFile);
  console.log("Wrote", macPresetOut, pcPresetOut, "and", gameOut);
}

main();
