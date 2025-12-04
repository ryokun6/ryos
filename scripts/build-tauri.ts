#!/usr/bin/env bun
/**
 * Cross-platform build script for Tauri
 * Sets TAURI_ENV before running the build to disable PWA/Vercel plugins
 */

import { execSync } from "child_process";

// Set environment variable for Tauri build
process.env.TAURI_ENV = "1";

// Run TypeScript compilation and Vite build (skip Vercel-specific copy commands)
execSync("bun run tsc -b && vite build", {
  stdio: "inherit",
  env: { ...process.env, TAURI_ENV: "1" },
});
