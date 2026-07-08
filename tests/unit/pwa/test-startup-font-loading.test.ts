import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..", "..", "..");

describe("startup font loading", () => {
  test("starts content CJK stylesheets independently of UI locale", () => {
    const html = readFileSync(path.join(ROOT, "index.html"), "utf8");
    expect(html).toContain(
      'fonts.googleapis.com/css2?family=Noto+Serif+SC'
    );
    expect(html).toContain("chiron-go-round-tc-webfont");
    expect(html.match(/media="print" onload="this\.media='all'"/g)).toHaveLength(
      2
    );

    const i18n = readFileSync(path.join(ROOT, "src/lib/i18n.ts"), "utf8");
    expect(i18n).not.toContain("ensureCjkFontsForLanguage");
  });

  test("does not force exceptional-screen fonts through React resources", () => {
    const resources = readFileSync(
      path.join(ROOT, "src/lib/reactResources.ts"),
      "utf8"
    );
    expect(resources).not.toContain("fusion-pixel");
    expect(resources).not.toContain("Mondwest");
  });

  test("preloads only fonts for the boot-selected theme", () => {
    const html = readFileSync(path.join(ROOT, "index.html"), "utf8");
    expect(html).toContain("fontsByTheme");
    expect(html).toContain("/fonts/AquaKana.woff2");
    expect(html).toContain(
      "/fonts/fusion-pixel-12px-proportional-ja.woff2"
    );
    expect(html).not.toMatch(
      /<link rel="preload" href="\/fonts\/[^"]+\.woff2"/
    );
  });
});
