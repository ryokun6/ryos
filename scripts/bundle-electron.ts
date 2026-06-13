#!/usr/bin/env bun
/**
 * Bundle Electron main/preload to dist-electron/*.cjs
 * With --dev, launches the Electron shell after bundling.
 */

import { execSync } from "node:child_process";
import { buildSync } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const distElectron = path.join(root, "dist-electron");
const buildDir = path.join(root, "build");
const isDev = process.argv.includes("--dev");

function ensureBuildIcons(): void {
  fs.mkdirSync(buildDir, { recursive: true });
  for (const file of ["icon.icns", "icon.ico", "icon.png"] as const) {
    const iconPath = path.join(buildDir, file);
    if (!fs.existsSync(iconPath)) {
      throw new Error(
        `Missing build/${file}. Add desktop icons under build/ before bundling Electron.`
      );
    }
  }
}

function bundleElectron(): void {
  ensureBuildIcons();
  fs.mkdirSync(distElectron, { recursive: true });

  buildSync({
    entryPoints: {
      main: path.join(root, "electron/main.ts"),
      preload: path.join(root, "electron/preload.ts"),
    },
    outdir: distElectron,
    outExtension: { ".js": ".cjs" },
    platform: "node",
    target: "node20",
    format: "cjs",
    bundle: true,
    external: ["electron"],
    sourcemap: true,
    logLevel: "info",
  });
}

bundleElectron();

if (isDev) {
  const defaultUrl = process.env.RYOS_ELECTRON_URL || "http://localhost:5173";
  execSync("electron .", {
    stdio: "inherit",
    cwd: root,
    env: {
      ...process.env,
      RYOS_ELECTRON_URL: defaultUrl,
    },
  });
}
