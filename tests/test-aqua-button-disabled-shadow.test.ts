import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const aquaCss = readFileSync(
  join(import.meta.dir, "../src/styles/themes/aqua.css"),
  "utf8"
);
const darkAquaCss = readFileSync(
  join(import.meta.dir, "../src/styles/themes/dark-aqua.css"),
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

describe("aqua disabled button shadow", () => {
  test("disabled aqua buttons keep opacity fully on so box-shadow stays visible", () => {
    const block = extractRuleBlock(aquaCss, ".aqua-button:disabled");
    expect(block.length).toBeGreaterThan(0);
    expect(block).toContain("opacity: 1 !important");
    expect(block).toContain("filter: none");
    expect(block).not.toMatch(/opacity:\s*0\.[0-9]/);
    expect(block).not.toContain("grayscale");
  });

  test("disabled aqua buttons dim face layers instead of the whole control", () => {
    expect(aquaCss).toContain(".aqua-button:disabled::before");
    expect(aquaCss).toContain(".aqua-button:disabled::after");
    expect(aquaCss).toContain(".aqua-button:disabled > svg");
    expect(aquaCss).toContain(".aqua-button.primary:disabled");
    expect(aquaCss).toContain(".aqua-button.secondary:disabled");
    expect(aquaCss).toContain(".aqua-button.orange:disabled");
    expect(aquaCss).toContain(".aqua-button.destructive:disabled");
    expect(aquaCss).not.toContain(".aqua-button:disabled > *");
  });

  test("dark mode disabled labels stay dim without muffling shadows", () => {
    expect(darkAquaCss).toContain(".aqua-button.primary:disabled");
    expect(darkAquaCss).toContain(".aqua-button.secondary:disabled");
    expect(darkAquaCss).toContain("color: rgba(255, 255, 255, 0.45) !important");
  });
});
