import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("sync API client wiring", () => {
  test("auto-sync preference helper uses src/api/sync wrappers", () => {
    const source = readFileSync("src/utils/autoSyncPreference.ts", "utf8");

    expect(source).toContain("@/api/sync");
    expect(source).toContain("getAutoSyncPreference");
    expect(source).toContain("saveAutoSyncPreference");
    expect(source).not.toContain("/api/sync/auto-sync-preference");
    expect(source).not.toContain("abortableFetch");
  });
});
