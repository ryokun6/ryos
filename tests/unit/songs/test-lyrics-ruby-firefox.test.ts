import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const INDEX_CSS = readFileSync(join(import.meta.dir, "../../../src/index.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  ""
);

function geckoBlocks(): string[] {
  return [...INDEX_CSS.matchAll(/@supports \(-moz-appearance: none\) \{([\s\S]*?)\n\}/g)].map(
    (match) => match[1]
  );
}

describe("over-text lyrics ruby in Firefox", () => {
  test("drops the shared rt margin-top only inside a Gecko-only @supports block", () => {
    const block = geckoBlocks().find((body) => body.includes("rt.lyrics-furigana-rt"));
    expect(block).toBeDefined();
    expect(block).toContain(
      ":root ruby.lyrics-furigana > rt.lyrics-furigana-rt:not(.lyrics-zhuyin-rt) {"
    );
    expect(block).toMatch(/margin-top:\s*0;/);
  });

  test("keeps the shared rt margin that Chromium and WebKit lay out with", () => {
    const start = INDEX_CSS.indexOf(":root[data-os-theme=\"xp\"] rt.lyrics-furigana-rt {");
    expect(start).toBeGreaterThanOrEqual(0);
    const rule = INDEX_CSS.slice(start, INDEX_CSS.indexOf("}", start));
    expect(rule).toContain("margin-top: 1em;");
    expect(rule).toContain("transform: translateY(-0.1em);");
  });
});
