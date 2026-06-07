import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function readSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      return readSourceFiles(path);
    }
    return /\.(ts|tsx)$/.test(entry) ? [readFileSync(path, "utf8")] : [];
  });
}

describe("paint filter wiring", () => {
  test("paint filter types do not depend on the obsolete filters menu", () => {
    const sources = readSourceFiles("src/apps/paint");
    expect(sources.join("\n")).not.toContain("PaintFiltersMenu");
  });
});
