/**
 * Generates a build version file with commit SHA
 * Format: MAJOR.MINOR (e.g., 10.1) + commit SHA
 * 
 * Uses VERCEL_GIT_COMMIT_SHA in production builds, falls back to 'dev' locally.
 * Run manually with `bun run version:bump` to increment MAJOR/MINOR.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ============================================================================
// VERSION CONSTANTS - Manually increment these for releases
// ============================================================================
const MAJOR_VERSION = 10;
const MINOR_VERSION = 1;
// ============================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));
const versionPath = join(__dirname, '../.version');
const outputPath = join(__dirname, '../src/config/buildVersion.ts');

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
let commitSha = process.env.VERCEL_GIT_COMMIT_SHA || '';

if (!commitSha) {
  // Try to get from git locally
  try {
    commitSha = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    commitSha = 'dev';
  }
}

const shortSha = commitSha === 'dev' ? 'dev' : commitSha.substring(0, 7);
const buildTime = new Date().toISOString();

// Version format: MAJOR.MINOR
const version = `${majorVersion}.${minorVersion}`;

const content = `// Auto-generated build version - do not edit manually
export const BUILD_VERSION = '${version}';
export const BUILD_TIME = '${buildTime}';
export const MAJOR_VERSION = ${majorVersion};
export const MINOR_VERSION = ${minorVersion};
export const COMMIT_SHA = '${commitSha}';
export const COMMIT_SHA_SHORT = '${shortSha}';
`;

writeFileSync(outputPath, content);

console.log(`[Build] Generated version: ${version} (${shortSha}) at ${buildTime}`);
