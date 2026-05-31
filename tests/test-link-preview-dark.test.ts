import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const indexCss = readFileSync(join(import.meta.dir, "../src/index.css"), "utf8");
const loadingSource = readFileSync(
  join(import.meta.dir, "../src/components/shared/link-preview/components/LinkPreviewLoading.tsx"),
  "utf8"
);
const previewSource = readFileSync(
  join(import.meta.dir, "../src/components/shared/link-preview/LinkPreview.tsx"),
  "utf8"
);
const themesCss = readFileSync(
  join(import.meta.dir, "../src/styles/themes.css"),
  "utf8"
);

function extractRuleBlock(css: string, selector: string): string {
  const start = css.indexOf(selector);
  if (start === -1) return "";
  const braceStart = css.indexOf("{", start);
  if (braceStart === -1) return "";
  let depth = 0;
  for (let i = braceStart; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return css.slice(start, i + 1);
    }
  }
  return "";
}

describe("link preview dark mode styling", () => {
  test("loading component uses shared skeleton class and macOS bubble shell", () => {
    expect(loadingSource).toContain("link-preview-loading-skeleton");
    expect(loadingSource).toContain("macosx-link-preview");
    expect(loadingSource).toContain("rounded-[16px]");
    expect(loadingSource).toContain("useThemeFlags");
  });

  test("loaded macOS link preview uses 16px radius to match chat image previews", () => {
    expect(previewSource).toContain("rounded-[16px]");
  });

  test(".dark .link-preview-loading-skeleton avoids bright white sweep", () => {
    const block = extractRuleBlock(indexCss, ".dark .link-preview-loading-skeleton");
    expect(block.length).toBeGreaterThan(0);
    expect(block).not.toMatch(/#fff\b/i);
    expect(block).not.toMatch(/rgba\(\s*250\s*,\s*250\s*,\s*250/i);
    expect(block).toContain("rgba(82, 82, 91");
  });

  test("light skeleton keeps a brighter highlight for light themes", () => {
    const block = extractRuleBlock(indexCss, ".link-preview-loading-skeleton {");
    expect(block).toContain("rgba(250, 250, 250");
  });

  test("loaded card shell has dark surface tokens", () => {
    expect(previewSource).toContain("dark:bg-neutral-950");
    expect(previewSource).toContain("dark:border-neutral-700");
    expect(previewSource).toContain("dark:bg-neutral-800/90");
  });

  test("macOS dark tones down link preview loading bubble gloss", () => {
    expect(themesCss).toContain(".link-preview-loading.macosx-link-preview.chat-bubble:before");
    expect(themesCss).toContain("rgba(255, 255, 255, 0.1)");
  });

  test("macOS themes enforce 16px radius on link preview cards and loading shells", () => {
    expect(themesCss).toContain(
      ".macosx-link-preview.chat-bubble.link-preview-container"
    );
    expect(themesCss).toContain(
      ".macosx-link-preview.chat-bubble.link-preview-loading"
    );
    expect(themesCss).toContain("border-radius: 16px !important");
  });
});
