import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const themesCss = readFileSync(
  join(import.meta.dir, "../src/styles/themes.css"),
  "utf8"
);
const sonnerSource = readFileSync(
  join(import.meta.dir, "../src/components/ui/sonner.tsx"),
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

describe("toast action button theming", () => {
  test("macOS toast action buttons use shared accent button CSS variables", () => {
    const block = extractRuleBlock(
      themesCss,
      ':root[data-os-theme="macosx"] .toaster [data-button]'
    );
    expect(block.length).toBeGreaterThan(0);
    expect(block).toContain("--os-accent-button-bg");
    expect(block).toContain("--os-accent-button-edge");
    expect(block).toContain("--os-accent-button-inner");
    expect(block).toContain("--os-accent-tab-text-shadow");
    expect(block).toMatch(/background:\s*var\(/);
  });

  test("dark-mode toast action buttons flip label to white and dim accent gloss", () => {
    const block = extractRuleBlock(
      themesCss,
      ':root[data-os-theme="macosx"][data-os-color-scheme="dark"]\n  .toaster [data-button]'
    );
    expect(block.length).toBeGreaterThan(0);
    expect(block).toContain("--os-accent-button-bg");
    expect(block).toContain("color: #ffffff");
    expect(block).not.toContain("color: black");
  });

  test("Toaster follows ryOS dark mode instead of next-themes", () => {
    expect(sonnerSource).toContain("useThemeFlags");
    expect(sonnerSource).toContain('theme={isDarkMode ? "dark" : "light"}');
    expect(sonnerSource).not.toContain("next-themes");
  });
});
