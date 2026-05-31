import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const indexCss = readFileSync(join(import.meta.dir, "../src/index.css"), "utf8");

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

describe("tool call loading shimmer (dark mode)", () => {
  test("light .shimmer keeps a bright highlight for light themes", () => {
    const block = extractRuleBlock(indexCss, ".shimmer {");
    expect(block).toContain("#fff");
    expect(block).not.toContain(".dark");
  });

  test(".dark .shimmer uses subdued grays without pure white", () => {
    const block = extractRuleBlock(indexCss, ".dark .shimmer");
    expect(block.length).toBeGreaterThan(0);
    expect(block).not.toMatch(/#fff\b/i);
    expect(block).not.toMatch(/rgb\(\s*255\s*,\s*255\s*,\s*255/i);
    expect(block).toContain("rgba(212, 212, 212");
  });

  test(".dark .shimmer-gray avoids black highlight peaks", () => {
    const block = extractRuleBlock(indexCss, ".dark .shimmer-gray");
    expect(block.length).toBeGreaterThan(0);
    expect(block).not.toMatch(/rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*1\s*\)/);
    expect(block).toContain("rgba(212, 212, 212");
  });
});
