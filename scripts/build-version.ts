import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ============================================================================
// WEB VERSION CONSTANTS - Manually increment these for web releases
// ============================================================================
export const MAJOR_VERSION = 10;
export const MINOR_VERSION = 3;
// ============================================================================

export interface BuildVersionJson {
  version: string;
  buildNumber: string;
  commitSha: string;
  buildTime: string;
  majorVersion: number;
  minorVersion: number;
  desktopVersion: string;
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const versionPath = join(repoRoot, ".version");
const publicVersionPath = join(repoRoot, "public/version.json");
const packageJsonPath = join(repoRoot, "package.json");

function readStoredVersion(): { major: number; minor: number } {
  let majorVersion = MAJOR_VERSION;
  let minorVersion = MINOR_VERSION;

  if (existsSync(versionPath)) {
    try {
      const versionData = JSON.parse(readFileSync(versionPath, "utf-8")) as {
        major?: number;
        minor?: number;
      };
      majorVersion = versionData.major ?? MAJOR_VERSION;
      minorVersion = versionData.minor ?? MINOR_VERSION;
    } catch {
      // Use defaults
    }
  }

  return { major: majorVersion, minor: minorVersion };
}

function resolveCommitSha(): string {
  return (
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.SOURCE_COMMIT ||
    process.env.GIT_COMMIT_SHA ||
    (() => {
      try {
        return execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
      } catch {
        return "dev";
      }
    })()
  );
}

function readDesktopVersion(): string {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
    version?: unknown;
  };

  if (typeof packageJson.version !== "string" || !packageJson.version.trim()) {
    throw new Error("package.json must contain a version for desktop releases");
  }

  return packageJson.version.trim();
}

export function generateBuildVersion(options?: {
  bumpMinor?: boolean;
}): BuildVersionJson {
  let { major: majorVersion, minor: minorVersion } = readStoredVersion();

  if (options?.bumpMinor) {
    minorVersion += 1;
    writeFileSync(
      versionPath,
      JSON.stringify({ major: majorVersion, minor: minorVersion }, null, 2)
    );
  }

  const commitSha = resolveCommitSha();
  const shortSha = commitSha === "dev" ? "dev" : commitSha.substring(0, 7);
  const buildTime = new Date().toISOString();

  return {
    version: `${majorVersion}.${minorVersion}`,
    buildNumber: shortSha,
    commitSha,
    buildTime,
    majorVersion,
    minorVersion,
    desktopVersion: readDesktopVersion(),
  };
}

export function getPublicVersionPath(): string {
  return publicVersionPath;
}

export function writeBuildVersionFile(
  versionJson: BuildVersionJson = generateBuildVersion()
): BuildVersionJson {
  writeFileSync(publicVersionPath, JSON.stringify(versionJson, null, 2));
  return versionJson;
}
