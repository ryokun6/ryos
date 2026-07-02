import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");

describe("lazy app offline recovery wiring", () => {
  test("uses a retryable loader instead of a poisoned React.lazy promise", () => {
    const source = readFileSync(
      path.join(ROOT, "src/config/lazyAppComponent.tsx"),
      "utf8"
    );

    expect(source).not.toMatch(/\blazy\s*\(/);
    expect(source).toContain('status: "unavailable"');
    expect(source).toContain("isRecoverableChunkLoadError");
    expect(source).toContain("failedWhileOffline");
    expect(source).toContain("retry();");
  });

  test("shows the offline window and marks it visible", () => {
    const source = readFileSync(
      path.join(ROOT, "src/config/lazyAppComponent.tsx"),
      "utf8"
    );

    expect(source).toContain("<AppChunkUnavailableView");
    expect(source).toContain("<LazyLoadSignal instanceId={props.instanceId} />");
    expect(source).toContain("if (!getOfflineSnapshot())");
  });
});
