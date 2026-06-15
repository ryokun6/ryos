/**
 * Generates a version.json file with build information
 * Format: MAJOR.MINOR (e.g., 10.1) + commit SHA
 * 
 * Commit SHA from: VERCEL_GIT_COMMIT_SHA (Vercel), SOURCE_COMMIT (Coolify), GIT_COMMIT_SHA (generic CI), or git rev-parse; falls back to 'dev' if none available.
 * Run manually with `bun run version:bump` to increment MAJOR/MINOR.
 * Desktop app version is read from package.json so generated download links
 * match electron-builder artifact names.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ============================================================================
// WEB VERSION CONSTANTS - Manually increment these for web releases
// ============================================================================
const MAJOR_VERSION = 10;
const MINOR_VERSION = 3;
// ============================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));
const versionPath = join(__dirname, '../.version');
const publicVersionPath = join(__dirname, '../public/version.json');
const packageJsonPath = join(__dirname, '../package.json');

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

function readDesktopVersion(): string {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as {
    version?: unknown;
  };

  if (typeof packageJson.version !== 'string' || !packageJson.version.trim()) {
    throw new Error('package.json must contain a version for desktop releases');
  }

  return packageJson.version.trim();
}

// Desktop version follows package.json, which electron-builder also uses.
const desktopVersion = readDesktopVersion();

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
