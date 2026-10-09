import { describe, expect, test } from "bun:test";
import {
  isTransientDynamicImportError,
  loadLazyModuleWithRetry,
} from "../../../src/config/lazyModuleRetry";

describe("loadLazyModuleWithRetry", () => {
  test("returns the module when the import succeeds", async () => {
    const module = { default: function Fitness() {} };
    const result = await loadLazyModuleWithRetry(async () => module, 0);
    expect(result).toBe(module);
  });

  test("retries a failed dynamic import once", async () => {
    const module = { default: function Fitness() {} };
    let calls = 0;
    const result = await loadLazyModuleWithRetry(async () => {
      calls += 1;
      if (calls === 1) {
        throw new TypeError(
          "Failed to fetch dynamically imported module: http://localhost:5173/src/apps/fitness/components/FitnessAppComponent.tsx"
        );
      }
      return module;
    }, 0);
    expect(calls).toBe(2);
    expect(result).toBe(module);
  });

  test("does not retry other import errors", async () => {
    let calls = 0;
    await expect(
      loadLazyModuleWithRetry(async () => {
        calls += 1;
        throw new Error("Cannot find module './missing'");
      }, 0)
    ).rejects.toThrow("Cannot find module");
    expect(calls).toBe(1);
  });

  test("recognizes Safari and Firefox dynamic import failures", () => {
    expect(isTransientDynamicImportError(new TypeError("Importing a module script failed."))).toBe(
      true
    );
    expect(
      isTransientDynamicImportError(new TypeError("error loading dynamically imported module"))
    ).toBe(true);
    expect(isTransientDynamicImportError(new Error("syntax error"))).toBe(false);
  });
});
