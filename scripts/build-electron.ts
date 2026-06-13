#!/usr/bin/env bun
/**
 * Bundle Electron sources and run electron-builder.
 *
 * Loads Apple signing/notarization credentials from .env.local via
 * scripts/electron-apple-env.ts (mac builds).
 *
 * Usage:
 *   bun run scripts/build-electron.ts
 *   bun run scripts/build-electron.ts --mac
 *   bun run scripts/build-electron.ts --win
 */

import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildElectronAppleEnv } from "./electron-apple-env";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const args = process.argv.slice(2);

const builderArgs = ["--config", "electron-builder.yml"];

if (args.includes("--mac")) {
  builderArgs.push("--mac");
} else if (args.includes("--win")) {
  builderArgs.push("--win");
} else if (args.includes("--linux")) {
  builderArgs.push("--linux");
}

const shouldPublish = process.env.ELECTRON_PUBLISH === "always";
builderArgs.push("--publish", shouldPublish ? "always" : "never");

const buildEnv =
  args.includes("--mac") || args.includes("--linux")
    ? buildElectronAppleEnv(root)
    : { ...process.env };

execSync("bun run scripts/bundle-electron.ts", {
  stdio: "inherit",
  cwd: root,
  env: buildEnv,
});

execSync(`bunx electron-builder ${builderArgs.join(" ")}`, {
  stdio: "inherit",
  cwd: root,
  env: buildEnv,
});
