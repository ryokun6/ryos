import { describe, expect, test } from "bun:test";
import { generateBuildVersion } from "../scripts/build-version";

describe("build-version", () => {
  test("generateBuildVersion returns required prefetch fields", () => {
    const version = generateBuildVersion();

    expect(typeof version.version).toBe("string");
    expect(version.version.length).toBeGreaterThan(0);
    expect(typeof version.buildNumber).toBe("string");
    expect(version.buildNumber.length).toBeGreaterThan(0);
    expect(typeof version.desktopVersion).toBe("string");
    expect(typeof version.buildTime).toBe("string");
  });
});
