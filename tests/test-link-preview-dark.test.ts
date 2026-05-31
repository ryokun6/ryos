import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const loadingSource = readFileSync(
  join(import.meta.dir, "../src/components/shared/link-preview/components/LinkPreviewLoading.tsx"),
  "utf8"
);
const previewSource = readFileSync(
  join(import.meta.dir, "../src/components/shared/link-preview/LinkPreview.tsx"),
  "utf8"
);

describe("link preview dark mode styling", () => {
  test("loading skeleton uses subdued dark gradient stops", () => {
    expect(loadingSource).toContain("dark:before:from-neutral-800");
    expect(loadingSource).toContain("dark:before:via-neutral-700");
    expect(loadingSource).toContain("dark:border-neutral-700");
    expect(loadingSource).toContain("dark:bg-neutral-900/80");
  });

  test("loaded card shell has dark surface tokens", () => {
    expect(previewSource).toContain("dark:bg-neutral-950");
    expect(previewSource).toContain("dark:border-neutral-700");
    expect(previewSource).toContain("dark:bg-neutral-800/90");
  });
});
