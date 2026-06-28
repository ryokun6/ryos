import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const CHANGELOG_MD = "docs/9-changelog.md";
const CHANGELOG_HTML = "public/docs/changelog.html";

/** Curated major entries that must appear in both markdown source and static HTML. */
const ANCHOR_PHRASES = [
  "Aqua Glass theme",
  "Cloud Sync v2",
  "Sync v1 retirement",
  "Virtual PC (v86)",
  "Listen Together",
];

describe("changelog docs sync", () => {
  test("static HTML reflects curated markdown major entries", async () => {
    const [markdown, html] = await Promise.all([
      readFile(CHANGELOG_MD, "utf-8"),
      readFile(CHANGELOG_HTML, "utf-8"),
    ]);

    for (const phrase of ANCHOR_PHRASES) {
      expect(markdown).toContain(phrase);
      expect(html).toContain(phrase);
    }

    // Guard against AI/git fallback regressions (raw commit subjects in HTML).
    expect(html).not.toContain("Add Calculator speech for accessible spoken feedback");
    expect(html).not.toContain("Add customizable Telegram heartbeat instructions");
  });
});
