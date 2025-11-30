/**
 * Generates a build version file with auto-incrementing build number
 * Format: MAJOR.MINOR.BUILD (e.g., 10.1.42)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ============================================================================
// VERSION CONSTANTS - Manually increment these for releases
// ============================================================================
const MAJOR_VERSION = 10;
const MINOR_VERSION = 1;
// ============================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));
const buildNumberPath = join(__dirname, '../.build-number');
const outputPath = join(__dirname, '../src/config/buildVersion.ts');

// Read current build number or start at 0
let buildNumber = 0;
if (existsSync(buildNumberPath)) {
  try {
    buildNumber = parseInt(readFileSync(buildNumberPath, 'utf-8').trim(), 10) || 0;
  } catch {
    buildNumber = 0;
  }
}

// Increment build number
buildNumber++;

// Save new build number
writeFileSync(buildNumberPath, buildNumber.toString());

// Generate version string
const version = `${MAJOR_VERSION}.${MINOR_VERSION}.${buildNumber}`;
const buildTime = new Date().toISOString();

const content = `// Auto-generated build version - do not edit manually
export const BUILD_VERSION = '${version}';
export const BUILD_TIME = '${buildTime}';
export const MAJOR_VERSION = ${MAJOR_VERSION};
export const MINOR_VERSION = ${MINOR_VERSION};
export const BUILD_NUMBER = ${buildNumber};
`;

writeFileSync(outputPath, content);

console.log(`[Build] Generated version: ${version} (${buildTime})`);
