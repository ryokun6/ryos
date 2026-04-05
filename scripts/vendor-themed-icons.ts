#!/usr/bin/env bun
/**
 * Adds permissively-licensed retro OS icons as **new** assets only under
 * `public/icons/default/vendor/` (does not overwrite themed or default icons).
 *
 * Sources (cached under node_modules/.cache; not committed):
 * - @react95/icons (MIT) — https://github.com/React95/React95
 * - bearz314/MacOS9-icons (MIT) — https://github.com/bearz314/MacOS9-icons
 *
 * Run: bun run vendor:icons
 * Then: bun run generate:icons
 */
import { spawnSync } from "node:child_process";
import { createWriteStream, mkdirSync, existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const ROOT = join(import.meta.dir, "..");
const ICONS = join(ROOT, "public", "icons");
const DEFAULT_VENDOR = join(ICONS, "default", "vendor");
const TMP = join(ROOT, "node_modules", ".cache", "vendor-icons");
const REACT95_VERSION = "2.4.0";
const REACT95_TGZ = `https://registry.npmjs.org/@react95/icons/-/icons-${REACT95_VERSION}.tgz`;
const MAC9_BASE =
  "https://raw.githubusercontent.com/bearz314/MacOS9-icons/master/png%2064px";

/** Relative path under default/vendor/react95/ -> React95 package/png file */
const REACT95_VENDOR_MAP: Record<string, string> = {
  "folder-closed.png": "Folder_32x32_4.png",
  "folder-open.png": "FolderOpen_32x32_4.png",
  "folder-documents.png": "FolderFile_32x32_4.png",
  "folder-images.png": "Shell32137_32x32_4.png",
  "folder-sounds.png": "Shell32138_32x32_4.png",
  "folder-movies.png": "Shell32139_32x32_4.png",
  "html-document.png": "HtmlPage_16x16_8.png",
  "network-neighborhood.png": "Network3_32x32_4.png",
  "internet-explorer-document.png": "Mshtml32528_32x32_4.png",
  "internet-shortcut.png": "Shdocvw257_32x32_4.png",
  "joystick.png": "Joy102_32x32_4.png",
  "add-remove-programs.png": "Appwiz1502_32x32_4.png",
  "windows-explorer.png": "Explorer100_32x32_4.png",
  "my-computer-classic.png": "Computer3_32x32_4.png",
  "my-computer-modern.png": "Computer4_32x32_4.png",
  "hard-drive-explorer.png": "Explorer107_32x32_4.png",
  "desktop.png": "Desktop_32x32_4.png",
  "recycle-bin-empty.png": "RecycleEmpty_32x32_4.png",
  "recycle-bin-full.png": "RecycleFull_32x32_4.png",
  "volume-speaker.png": "Mmsys110_32x32_4.png",
  "notepad-document.png": "Notepad1_32x32_4.png",
  "notepad-generic.png": "Notepad_32x32_4.png",
  "image-document.png": "Shell32136_32x32_4.png",
  "paint.png": "Mspaint_32x32_4.png",
  "minesweeper.png": "Winmine1_32x32_4.png",
  "ms-dos.png": "MsDos_32x32_32.png",
  "notepad.png": "Notepad2_32x32_4.png",
  "media-player.png": "Mplayer111_32x32_4.png",
  "cd-player.png": "Cdplayer107_32x32_4.png",
  "media-audio.png": "MediaAudio_32x32_4.png",
  "warning.png": "Gcdef10006_32x32_4.png",
  "error.png": "Gcdef10008_32x32_4.png",
  "info.png": "Gcdef10009_32x32_4.png",
  "question.png": "Gcdef10010_32x32_4.png",
  "control-panel.png": "Controls3000_32x32_4.png",
};

/** MacOS9 64px index -> filename under default/vendor/macos9/ */
const MAC9_VENDOR_MAP: Record<string, string> = {
  "26": "folder-closed.png",
  "12": "folder-open.png",
  "20": "folder-documents.png",
  "11": "folder-downloads.png",
  "24": "folder-images.png",
  "87": "folder-sounds.png",
  "21": "folder-movies.png",
  "22": "folder-videos.png",
  "25": "folder-sites.png",
  "27": "network.png",
  "69": "document-html.png",
  "70": "document-html-alt.png",
  "32": "games.png",
  "59": "folder-applets.png",
  "60": "folder-applications.png",
  "41": "computer-happy-mac.png",
  "42": "apple-logo.png",
  "16": "hard-drive.png",
  "66": "floppy-pc.png",
  "10": "desktop.png",
  "8": "trash-empty.png",
  "7": "trash-full.png",
  "86": "sound-file.png",
  "68": "text-file.png",
  "88": "karaoke-file.png",
  "89": "image-file.png",
  "19": "generic-document.png",
  "15": "contacts.png",
  "44": "textedit.png",
  "35": "paint.png",
  "36": "minesweeper.png",
  "37": "minesweeper-alt.png",
  "38": "terminal.png",
  "40": "synth.png",
  "31": "cdrom.png",
  "13": "warn.png",
  "14": "error.png",
  "17": "info.png",
  "18": "question.png",
  "39": "control-panel.png",
};

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

function writeVendorPng(src: string, relativeUnderDefault: string, size: number) {
  const outPath = join(ICONS, "default", relativeUnderDefault);
  if (existsSync(outPath)) {
    console.log(`[vendor-icons] Skip existing ${relativeUnderDefault}`);
    return;
  }
  mkdirSync(join(outPath, ".."), { recursive: true });
  runFfmpeg(src, outPath, size);
}

async function applyReact95Vendor() {
  const pngDir = await ensureReact95PngDir();
  mkdirSync(join(DEFAULT_VENDOR, "react95"), { recursive: true });
  console.log("[vendor-icons] React95 -> default/vendor/react95/");
  for (const [name, file] of Object.entries(REACT95_VENDOR_MAP)) {
    const src = join(pngDir, file);
    if (!existsSync(src)) {
      console.warn(`[vendor-icons] Missing source ${file}, skip ${name}`);
      continue;
    }
    const rel = join("vendor", "react95", name).split("\\").join("/");
    writeVendorPng(src, rel, 32);
  }
}

async function applyMacOS9Vendor() {
  mkdirSync(join(TMP, "mac9"), { recursive: true });
  mkdirSync(join(DEFAULT_VENDOR, "macos9"), { recursive: true });
  console.log("[vendor-icons] MacOS9-icons -> default/vendor/macos9/");
  for (const [idx, name] of Object.entries(MAC9_VENDOR_MAP)) {
    const url = `${MAC9_BASE}/${idx}.png`;
    const cached = join(TMP, "mac9", `${idx}.png`);
    if (!existsSync(cached)) {
      await download(url, cached);
    }
    const rel = join("vendor", "macos9", name).split("\\").join("/");
    writeVendorPng(cached, rel, 32);
  }
}

async function main() {
  mkdirSync(TMP, { recursive: true });
  await applyReact95Vendor();
  await applyMacOS9Vendor();
  console.log("[vendor-icons] Done. Run: bun run generate:icons");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
