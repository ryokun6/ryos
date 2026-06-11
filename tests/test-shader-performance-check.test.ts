import { describe, expect, test } from "bun:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { checkShaderPerformance } from "../src/utils/performanceCheck";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const readSource = (path: string) =>
  readFileSync(resolve(repoRoot, path), "utf8");

describe("shader performance check loading", () => {
  test("keeps three out of the static performance-check import path", () => {
    const source = readSource("src/utils/performanceCheck.ts");

    expect(source).not.toMatch(/^import(?!\s+type).*from ["']three["'];?$/m);
    expect(source).toContain('await import("three")');
    expect(source.indexOf("navigator.hardwareConcurrency")).toBeLessThan(
      source.indexOf('await import("three")')
    );
  });

  test("does not run the shader check while the display store module initializes", () => {
    const source = readSource("src/stores/useDisplaySettingsStore.ts");

    expect(source).not.toMatch(
      /const\s+initialShaderState\s*=\s*checkShaderPerformance\s*\(/
    );
    expect(source).toContain("requestIdleCallback");
    expect(source).toContain(
      "shaderPerformanceCapable: state.shaderPerformanceCapable"
    );
  });

  test("returns false before importing three when CPU cores are below threshold", async () => {
    const originalNavigator = Object.getOwnPropertyDescriptor(
      globalThis,
      "navigator"
    );

    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { hardwareConcurrency: 2 },
    });

    try {
      await expect(checkShaderPerformance()).resolves.toBe(false);
    } finally {
      if (originalNavigator) {
        Object.defineProperty(globalThis, "navigator", originalNavigator);
      } else {
        delete (globalThis as { navigator?: Navigator }).navigator;
      }
    }
  });
});
