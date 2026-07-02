import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getCjkStylesheetsForLanguage } from "../src/lib/cjkFonts";

const ROOT = path.resolve(import.meta.dir, "..");

describe("startup font loading", () => {
  test("loads third-party CJK stylesheets only for CJK locales", () => {
    expect(getCjkStylesheetsForLanguage("en")).toEqual([]);
    expect(getCjkStylesheetsForLanguage("fr")).toEqual([]);
    expect(getCjkStylesheetsForLanguage("ja")).toHaveLength(1);
    expect(getCjkStylesheetsForLanguage("ko")).toHaveLength(1);
    expect(getCjkStylesheetsForLanguage("zh-CN")).toHaveLength(1);
    expect(getCjkStylesheetsForLanguage("zh-TW")).toHaveLength(2);
  });

  test("does not force fallback or exceptional-screen fonts at boot", () => {
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
    expect(html).not.toMatch(
      /<link rel="preload" href="\/fonts\/[^"]+\.woff2"/
    );
    expect(html.match(/fonts\.googleapis\.com/g)).toHaveLength(1);
    expect(html.match(/cdn\.jsdelivr\.net\/npm\/chiron/g)).toHaveLength(1);
  });
});
