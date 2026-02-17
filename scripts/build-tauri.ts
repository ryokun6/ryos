#!/usr/bin/env bun
/**
 * Cross-platform build script for Tauri
 * Sets TAURI_ENV before running the build to disable PWA/Vercel plugins
 */

import { spawnSync } from "child_process";

// Set environment variable for Tauri build
process.env.TAURI_ENV = "1";

const env = { ...process.env, TAURI_ENV: "1" };

const runStep = (command: string, args: string[]) => {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with exit code ${result.status}`
    );
  }
};

// Run TypeScript compilation and Vite build (skip Vercel-specific copy commands)
runStep("bun", ["run", "tsc", "-b"]);
runStep("bun", ["run", "vite", "build"]);
