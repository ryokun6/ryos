import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), "utf-8");

describe("cloud backup dev reload guard wiring", () => {
  test("skips preload-error reloads in dev", () => {
    const source = readSource("src/main.tsx");

    expect(source.includes("if (import.meta.env.DEV) {")).toBe(true);
    expect(source.includes('[ryOS] Skipping preload-error reload in dev')).toBe(
      true
    );
  });

  test("cloud backup actions use non-submit buttons", () => {
    const source = readSource(
      "src/apps/control-panels/components/ControlPanelsAppComponent.tsx"
    );

    expect(
      source.includes("type=\"button\"\n                      onClick={handleCloudBackup}")
    ).toBe(true);
    expect(
      source.includes(
        "type=\"button\"\n                      onClick={() => setIsConfirmCloudRestoreOpen(true)}"
      )
    ).toBe(true);
  });
});
