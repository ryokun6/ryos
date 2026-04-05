#!/usr/bin/env bun
/**
 * Adds permissively-licensed retro OS icons under `public/icons/default/vendor/`
 * only (does not touch `win98/`, `xp/`, `macosx/`, or top-level `default/` icons).
 *
 * Exports **everything** from each source:
 * - All PNGs from @react95/icons package `png/` (preserves filenames, all sizes → scaled to 32×32)
 * - All `png 64px/{n}.png` from bearz314/MacOS9-icons for n = 1..92 (missing indices skipped)
 *
 * Sources (cached under node_modules/.cache; not committed):
 * - @react95/icons (MIT) — https://github.com/React95/React95
 * - bearz314/MacOS9-icons (MIT) — https://github.com/bearz314/MacOS9-icons
 *
 * Run: bun run vendor:icons
 * Then: bun run generate:icons
 *
 * Pass `--skip-existing` to leave already-written vendor files unchanged (faster re-runs).
 */
import { spawnSync } from "node:child_process";
import { createWriteStream, mkdirSync, existsSync } from "node:fs";
import { mkdir, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const ROOT = join(import.meta.dir, "..");
const ICONS = join(ROOT, "public", "icons");
const TMP = join(ROOT, "node_modules", ".cache", "vendor-icons");
const REACT95_VERSION = "2.4.0";
const REACT95_TGZ = `https://registry.npmjs.org/@react95/icons/-/icons-${REACT95_VERSION}.tgz`;
const MAC9_BASE =
  "https://raw.githubusercontent.com/bearz314/MacOS9-icons/master/png%2064px";
const MAC9_MAX_INDEX = 92;

const skipExisting = process.argv.includes("--skip-existing");

async function download(url: string, dest: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  const body = res.body;
  if (!body) throw new Error(`No body: ${url}`);
  await mkdir(join(dest, ".."), { recursive: true });
  await pipeline(
    Readable.fromWeb(body as import("node:stream/web").ReadableStream),
    createWriteStream(dest)
  );
}

function runFfmpeg(inPath: string, outPath: string, size: number) {
  const r = spawnSync(
    "ffmpeg",
    ["-y", "-i", inPath, "-vf", `scale=${size}:${size}`, outPath],
    { encoding: "utf-8" }
  );
  if (r.status !== 0) {
    throw new Error(r.stderr || "ffmpeg failed");
  }
}

async function ensureReact95PngDir(): Promise<string> {
  const pngDir = join(TMP, "package", "png");
  if (existsSync(pngDir)) return pngDir;

  mkdirSync(TMP, { recursive: true });
  const tgzPath = join(TMP, `react95-icons-${REACT95_VERSION}.tgz`);
  if (!existsSync(tgzPath)) {
    console.log(`[vendor-icons] Downloading ${REACT95_TGZ}`);
    await download(REACT95_TGZ, tgzPath);
  }
  const tar = spawnSync("tar", ["-xzf", tgzPath, "-C", TMP], {
    stdio: "inherit",
  });
  if (tar.status !== 0) throw new Error("tar extract failed");
  if (!existsSync(pngDir)) throw new Error(`Expected ${pngDir} after extract`);
  return pngDir;
}

async function collectPngFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...(await collectPngFiles(full)));
    } else if (e.name.toLowerCase().endsWith(".png")) {
      out.push(full);
    }
  }
  return out;
}

function writeVendorPng(
  src: string,
  relativeUnderDefault: string,
  size: number
) {
  const outPath = join(ICONS, "default", relativeUnderDefault);
  if (skipExisting && existsSync(outPath)) {
    return;
  }
  mkdirSync(join(outPath, ".."), { recursive: true });
  runFfmpeg(src, outPath, size);
}

async function applyAllReact95() {
  const pngDir = await ensureReact95PngDir();
  const files = (await collectPngFiles(pngDir)).sort();
  console.log(`[vendor-icons] React95: ${files.length} PNGs -> default/vendor/react95/`);
  let written = 0;
  for (const abs of files) {
    const relFromPng = relative(pngDir, abs).split("\\").join("/");
    const targetRel = join("vendor", "react95", relFromPng).split("\\").join("/");
    writeVendorPng(abs, targetRel, 32);
    written++;
    if (written % 200 === 0) {
      console.log(`[vendor-icons] React95 progress ${written}/${files.length}`);
    }
  }
}

async function applyAllMacOS9() {
  mkdirSync(join(TMP, "mac9"), { recursive: true });
  console.log(
    `[vendor-icons] MacOS9-icons: indices 1..${MAC9_MAX_INDEX} -> default/vendor/macos9/`
  );
  let ok = 0;
  let missing = 0;
  for (let idx = 1; idx <= MAC9_MAX_INDEX; idx++) {
    const url = `${MAC9_BASE}/${idx}.png`;
    const cached = join(TMP, "mac9", `${idx}.png`);
    const targetRel = join("vendor", "macos9", `${idx}.png`).split("\\").join("/");
    const outPath = join(ICONS, "default", targetRel);
    if (skipExisting && existsSync(outPath)) {
      ok++;
      continue;
    }
    try {
      if (!existsSync(cached)) {
        const res = await fetch(url);
        if (!res.ok) {
          missing++;
          continue;
        }
        const body = res.body;
        if (!body) {
          missing++;
          continue;
        }
        await mkdir(join(cached, ".."), { recursive: true });
        await pipeline(
          Readable.fromWeb(body as import("node:stream/web").ReadableStream),
          createWriteStream(cached)
        );
      }
      writeVendorPng(cached, targetRel, 32);
      ok++;
    } catch {
      missing++;
    }
  }
  console.log(
    `[vendor-icons] MacOS9-icons: wrote ${ok}, skipped/missing ${missing} (e.g. index 63)`
  );
}

async function main() {
  mkdirSync(TMP, { recursive: true });
  if (skipExisting) {
    console.log("[vendor-icons] --skip-existing: only filling gaps");
  }
  await applyAllReact95();
  await applyAllMacOS9();
  console.log("[vendor-icons] Done. Run: bun run generate:icons");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
