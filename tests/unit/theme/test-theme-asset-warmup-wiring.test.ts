import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..", "..", "..");

describe("theme asset warmup wiring", () => {
  test("warms assets after theme changes and reconnects", () => {
    const source = readFileSync(
      path.join(ROOT, "src/utils/prefetch.ts"),
      "utf8"
    );

    expect(source).toContain("useThemeStore.subscribe");
    expect(source).toContain("state.current !== previousState.current");
    expect(source).toContain('window.addEventListener("online", handleOnline)');
    expect(source).toContain("warmActiveThemeShellAssets(theme)");
    expect(source).toContain("startThemeAssetWarmup();");
  });

  test("invalidates the in-memory icon manifest with runtime caches", () => {
    const source = readFileSync(
      path.join(ROOT, "src/utils/prefetch.ts"),
      "utf8"
    );
    const cacheClear = source.slice(
      source.indexOf("async function clearRuntimeCaches"),
      source.indexOf("function createToastContent")
    );

    expect(cacheClear).toContain("invalidateIconCache();");
    expect(cacheClear).toContain("caches.delete");
  });
});
