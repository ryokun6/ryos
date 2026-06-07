import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("display settings IndexedDB wiring", () => {
  test("custom wallpapers use the shared IndexedDB operations boundary", () => {
    const source = readFileSync(
      "src/stores/useDisplaySettingsStore.ts",
      "utf8"
    );

    expect(source).toContain("@/utils/indexedDBOperations");
    expect(source).toContain("dbOperations.put");
    expect(source).toContain("dbOperations.get");
    expect(source).toContain("dbOperations.delete");
    expect(source).toContain("getIndexedDbStoreKeys");
    expect(source).not.toContain("ensureIndexedDBInitialized");
    expect(source).not.toContain(".transaction(");
  });
});
