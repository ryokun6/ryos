import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const workspaceRoot = join(import.meta.dir, "../../..");
const versionPath = join(workspaceRoot, "public/version.json");

describe("generate-build-version", () => {
  test("writes a fresh version.json with the current commit", () => {
    const startedAt = Date.now();
    const result = Bun.spawnSync(
      ["bun", "run", "scripts/generate-build-version.ts"],
      { cwd: workspaceRoot }
    );
    expect(result.exitCode).toBe(0);
    expect(existsSync(versionPath)).toBe(true);

    const data = JSON.parse(readFileSync(versionPath, "utf-8")) as {
      version?: string;
      buildNumber?: string;
      commitSha?: string;
      buildTime?: string;
      desktopVersion?: string;
    };

    expect(data.version).toMatch(/^\d+\.\d+$/);
    expect(data.desktopVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(data.commitSha).toMatch(/^[0-9a-f]{40}$/);
    expect(data.buildNumber).toBe(data.commitSha?.slice(0, 7));

    const buildTime = Date.parse(data.buildTime ?? "");
    expect(Number.isNaN(buildTime)).toBe(false);
    expect(buildTime).toBeGreaterThanOrEqual(startedAt - 2_000);
    expect(buildTime).toBeLessThanOrEqual(Date.now() + 2_000);
  });
});
