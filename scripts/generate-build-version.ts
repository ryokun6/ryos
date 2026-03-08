/**
 * Generates a version.json file with build information
 * Format: MAJOR.MINOR (e.g., 10.1) + commit SHA
 * 
 * Commit SHA from: VERCEL_GIT_COMMIT_SHA (Vercel), SOURCE_COMMIT (Coolify), GIT_COMMIT_SHA (generic CI), or git rev-parse; falls back to 'dev' if none available.
 * Run manually with `bun run version:bump` to increment MAJOR/MINOR.
 * Update DESKTOP_VERSION constant when releasing new desktop builds.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ============================================================================
// VERSION CONSTANTS - Manually increment these for releases
// ============================================================================
const MAJOR_VERSION = 10;
const MINOR_VERSION = 3;
const DESKTOP_VERSION = '1.0.1';
// ============================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));
const versionPath = join(__dirname, '../.version');
const publicVersionPath = join(__dirname, '../public/version.json');

// Check if this is a manual version bump (called directly via version:bump)
const isManualBump = process.argv.includes('--bump');

// Read current version or use defaults
let majorVersion = MAJOR_VERSION;
let minorVersion = MINOR_VERSION;

if (existsSync(versionPath)) {
  try {
    const versionData = JSON.parse(readFileSync(versionPath, 'utf-8'));
    majorVersion = versionData.major ?? MAJOR_VERSION;
    minorVersion = versionData.minor ?? MINOR_VERSION;
  } catch {
    // Use defaults
  }
}

// If manual bump, increment minor version (or handle major bump via editing constants)
if (isManualBump) {
  minorVersion++;
  writeFileSync(versionPath, JSON.stringify({ major: majorVersion, minor: minorVersion }, null, 2));
  console.log(`[Version] Bumped to ${majorVersion}.${minorVersion}`);
}

// Get commit SHA from environment or git
// VERCEL_GIT_COMMIT_SHA: Vercel | SOURCE_COMMIT: Coolify | GIT_COMMIT_SHA: generic CI
const commitSha =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.SOURCE_COMMIT ||
  process.env.GIT_COMMIT_SHA ||
  (() => {
    try {
      return execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
    } catch {
      return 'dev';
    }
  })();

const shortSha = commitSha === 'dev' ? 'dev' : commitSha.substring(0, 7);
const buildTime = new Date().toISOString();

// Version format: MAJOR.MINOR
const version = `${majorVersion}.${minorVersion}`;

// Desktop version from constant (update DESKTOP_VERSION when releasing new desktop builds)
const desktopVersion = DESKTOP_VERSION;

// Write version.json to public folder for runtime version fetching
const versionJson = {
  version,
  buildNumber: shortSha,
  commitSha,
  buildTime,
  majorVersion,
  minorVersion,
  desktopVersion,
};

writeFileSync(publicVersionPath, JSON.stringify(versionJson, null, 2));

console.log(`[Build] Generated version: ${version} (${shortSha}), desktop: ${desktopVersion} at ${buildTime}`);
