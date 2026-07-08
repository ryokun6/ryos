import { describe, expect, test } from "bun:test";

import {
  buildLatestChangelogCard,
  resolveInlineCodePath,
} from "../../../scripts/generate-docs";

describe("generate-docs inline code path links", () => {
  test("keeps repo-root test files out of src links", () => {
    expect(
      resolveInlineCodePath("tests/unit/i18n/test-help-i18n-alignment.test.ts"),
    ).toEqual({
      fullPath: "tests/unit/i18n/test-help-i18n-alignment.test.ts",
      matchedText: "tests/unit/i18n/test-help-i18n-alignment.test.ts",
    });
  });

  test("keeps known repo-root folders unchanged", () => {
    expect(resolveInlineCodePath("scripts/generate-docs.ts")).toEqual({
      fullPath: "scripts/generate-docs.ts",
      matchedText: "scripts/generate-docs.ts",
    });
    expect(resolveInlineCodePath("docs/7.2-i18n.md")).toEqual({
      fullPath: "docs/7.2-i18n.md",
      matchedText: "docs/7.2-i18n.md",
    });
  });

  test("resolves app-relative component paths with app context", () => {
    expect(
      resolveInlineCodePath("components/TextEditAppComponent.tsx", "textedit"),
    ).toEqual({
      fullPath: "src/apps/textedit/components/TextEditAppComponent.tsx",
      matchedText: "components/TextEditAppComponent.tsx",
    });
  });

  test("resolves shared src-relative folders without app context", () => {
    expect(resolveInlineCodePath("stores/useLanguageStore.ts")).toEqual({
      fullPath: "src/stores/useLanguageStore.ts",
      matchedText: "stores/useLanguageStore.ts",
    });
  });
});

describe("generate-docs latest changelog card", () => {
  const changelogMd = `# Changelog

Intro copy.

---

## July 2026

<div class="changelog-feature-grid">
<article class="changelog-feature"><img src="/docs-assets/changelog/2026-07-01-books-library-16x9.webp" alt="Books library in the July 2026 ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Books library</h3><p>A wooden EPUB shelf keeps imports, reading progress, and Meditations together.</p></div></article>
</div>

## June 2026

<div class="changelog-feature-grid">
<article class="changelog-feature"><img src="/docs-assets/changelog/2026-07-05-aqua-appearance-16x9.webp" alt="Aqua Glass" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Aqua Glass</h3><p>Translucent chrome.</p></div></article>
<article class="changelog-feature"><img src="/docs-assets/changelog/2026-07-02-cloud-sync-16x9.webp" alt="Cloud Sync v2" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Cloud Sync v2</h3><p>Journal-based delta sync.</p></div></article>
</div>
`;

  test("builds cards from the two newest featured entries with month labels", () => {
    const card = buildLatestChangelogCard(changelogMd);
    expect(card).toContain('class="latest-changelog-grid"');
    expect(card.match(/href="\/docs\/changelog"/g)?.length).toBe(2);
    // Newest entry (July) with its month label
    expect(card).toContain("July 2026");
    expect(card).toContain(
      'src="/docs-assets/changelog/2026-07-01-books-library-16x9.webp"',
    );
    expect(card).toContain("<h3>Books library</h3>");
    // Second-newest entry crosses into the previous month (June)
    expect(card).toContain("June 2026");
    expect(card).toContain("<h3>Aqua Glass</h3>");
    // Must stop at two entries
    expect(card).not.toContain("Cloud Sync v2");
  });

  test("falls back gracefully when no featured entry exists", () => {
    const card = buildLatestChangelogCard("# Changelog\n\nNo entries yet.\n");
    expect(card).toContain('href="/docs/changelog"');
    expect(card).toContain("Latest changelog");
    expect(card).toContain("See what's new");
    expect(card).not.toContain("<img");
  });
});
