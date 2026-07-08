import { describe, expect, test } from "bun:test";
import { access, readFile } from "node:fs/promises";
import sharp from "sharp";

const CHANGELOG_MD = "docs/9-changelog.md";
const CHANGELOG_HTML = "public/docs/changelog.html";
/** Curated major entries that must appear in both markdown source and static HTML. */
const ANCHOR_PHRASES = [
  "Weather and location tools",
  "Save anywhere",
  "Desktop Assistant",
  "Aqua Glass",
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

  test("renders one to five 1280x720 screenshots for every month", async () => {
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

      expect(screenshots.length).toBeGreaterThanOrEqual(1);
      expect(screenshots.length).toBeLessThanOrEqual(5);
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

  test("deduplicates the June and July featured changes", async () => {
    const markdown = await readFile(CHANGELOG_MD, "utf-8");
    const july =
      markdown.split("## July 2026")[1]?.split("## June 2026")[0] ?? "";
    const june =
      markdown.split("## June 2026")[1]?.split("## May 2026")[0] ?? "";
    const julyFeatured = july.split("<details>")[0] ?? "";
    const juneFeatured = june.split("<details>")[0] ?? "";
    const screenshotPattern =
      /src="(\/docs-assets\/changelog\/[^"]+\.webp)"/g;

    expect(
      [...julyFeatured.matchAll(screenshotPattern)].map((match) => match[1]),
    ).toEqual([
      "/docs-assets/changelog/2026-07-07-weather-location-16x9.webp",
      "/docs-assets/changelog/2026-07-07-save-anywhere-16x9.webp",
      "/docs-assets/changelog/2026-07-06-desktop-assistant-16x9.webp",
      "/docs-assets/changelog/2026-07-01-books-library-16x9.webp",
    ]);
    expect(julyFeatured).toContain("<h3>Weather &amp; location tools</h3>");
    expect(julyFeatured).toContain("<h3>Save anywhere</h3>");
    expect(julyFeatured).toContain("<h3>Desktop Assistant</h3>");
    expect(julyFeatured).toContain("<h3>Books library</h3>");
    expect(juneFeatured).not.toContain("<h3>Books</h3>");
    expect(
      [...juneFeatured.matchAll(screenshotPattern)].map((match) => match[1]),
    ).toEqual([
      "/docs-assets/changelog/2026-07-05-aqua-appearance-16x9.webp",
      "/docs-assets/changelog/2026-07-02-cloud-sync-16x9.webp",
      "/docs-assets/changelog/2026-07-04-preview-16x9.webp",
      "/docs-assets/changelog/2026-07-03-international-16x9.webp",
    ]);
  });

  test("renders full-width screenshots with their original aspect ratios", async () => {
    const html = await readFile(CHANGELOG_HTML, "utf-8");

    expect(html).toContain(
      ".changelog-feature-grid { display: flex; flex-direction: column;",
    );
    expect(html).not.toContain(".changelog-feature-grid { display: grid;");
    expect(html).toContain(
      ".changelog-feature img { display: block; width: 100%; height: auto;",
    );
    expect(html).not.toContain(
      ".changelog-feature img { display: block; width: 100%; aspect-ratio:",
    );
  });
});
