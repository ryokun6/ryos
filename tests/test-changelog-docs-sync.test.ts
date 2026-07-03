import { describe, expect, test } from "bun:test";
import { access, readFile } from "node:fs/promises";
import sharp from "sharp";

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

  test("limits each month to five featured changes", async () => {
    const markdown = await readFile(CHANGELOG_MD, "utf-8");
    const months = markdown.split(/^## /m).slice(1);

    expect(months.length).toBeGreaterThan(0);
    for (const month of months) {
      const featured = month.split("<details>")[0] ?? "";
      const bulletCount = featured.match(/^- /gm)?.length ?? 0;
      const cardCount =
        featured.match(/<article class="changelog-feature">/g)?.length ?? 0;

      expect(bulletCount + cardCount).toBeLessThanOrEqual(5);
    }
  });

  test("renders five 1280x720 screenshots for every month", async () => {
    const [markdown, html] = await Promise.all([
      readFile(CHANGELOG_MD, "utf-8"),
      readFile(CHANGELOG_HTML, "utf-8"),
    ]);
    const months = markdown.split(/^## /m).slice(1);

    expect(months).toHaveLength(19);
    for (const month of months) {
      const featured = month.split("<details>")[0] ?? "";
      const screenshots = [
        ...featured.matchAll(
          /src="(\/docs-assets\/changelog\/[^"]+\.webp)"/g,
        ),
      ].map((match) => match[1]);

      expect(screenshots).toHaveLength(5);
      await Promise.all(
        screenshots.map(async (publicPath) => {
          expect(html).toContain(publicPath);
          const diskPath = `public${publicPath}`;
          await access(diskPath);
          const metadata = await sharp(diskPath).metadata();
          expect(metadata.width).toBe(1280);
          expect(metadata.height).toBe(720);
        }),
      );
    }
  });
});
