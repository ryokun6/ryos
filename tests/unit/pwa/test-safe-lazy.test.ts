import { describe, expect, test } from "bun:test";
import { resolveLazyModule } from "../../../src/utils/safeLazy";

function Fallback() {
  return null;
}

describe("safeLazy", () => {
  test("returns the loaded module on success", async () => {
    function Loaded() {
      return null;
    }
    const result = await resolveLazyModule(async () => ({ default: Loaded }), "Loaded");
    expect(result.default).toBe(Loaded);
  });

  test("swallows Safari module-script import failures", async () => {
    const result = await resolveLazyModule(async () => {
      throw new TypeError("Importing a module script failed.");
    }, "AssistantOverlay");
    expect(result.default).not.toBeUndefined();
    expect(result.default).not.toBe(Fallback);
    expect(result.default.name).toBe("EmptyLazyFallback");
  });
});
