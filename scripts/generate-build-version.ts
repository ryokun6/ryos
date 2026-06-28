/**
 * Generates a version.json file with build information
 * Format: MAJOR.MINOR (e.g., 10.1) + commit SHA
 *
 * Commit SHA from: VERCEL_GIT_COMMIT_SHA (Vercel), SOURCE_COMMIT (Coolify), GIT_COMMIT_SHA (generic CI), or git rev-parse; falls back to 'dev' if none available.
 * Run manually with `bun run version:bump` to increment MAJOR/MINOR.
 * Desktop app version is read from package.json so generated download links
 * match electron-builder artifact names.
 */

import {
  generateBuildVersion,
  writeBuildVersionFile,
} from "./build-version";

const isManualBump = process.argv.includes("--bump");
const versionJson = writeBuildVersionFile(
  generateBuildVersion({ bumpMinor: isManualBump })
);

if (isManualBump) {
  console.log(`[Version] Bumped to ${versionJson.version}`);
}

console.log(
  `[Build] Generated version: ${versionJson.version} (${versionJson.buildNumber}), desktop: ${versionJson.desktopVersion} at ${versionJson.buildTime}`
);
