import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const indexCss = readFileSync(join(import.meta.dir, "../src/index.css"), "utf8");
const contentPaneSource = readFileSync(
  join(
    import.meta.dir,
    "../src/apps/internet-explorer/components/internet-explorer-app/InternetExplorerContentPane.tsx"
  ),
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

describe("internet explorer loading bar dark mode", () => {
  test("loading bar track has a dark-mode surface instead of a fixed white bar", () => {
    expect(contentPaneSource).toContain("bg-white/75 dark:bg-neutral-900/75");
  });

  test("loading status bar gets a dark surface and divider", () => {
    expect(contentPaneSource).toContain("bg-neutral-100 dark:bg-neutral-900");
    expect(contentPaneSource).toContain(
      "border-t border-neutral-300 dark:border-white/10"
    );
  });

  test("dark progress sweep lifts the blue band for the dark track", () => {
    const block = extractRuleBlock(
      indexCss,
      ".dark .animate-progress-indeterminate,"
    );
    expect(block.length).toBeGreaterThan(0);
    expect(block).toContain("#60a5fa");
  });

  test("dark progress sweep tunes the green (content fetch) band", () => {
    const block = extractRuleBlock(
      indexCss,
      ".dark .animate-progress-indeterminate-green,"
    );
    expect(block.length).toBeGreaterThan(0);
    expect(block).toContain("#4ade80");
  });

  test("dark progress sweep tunes the orange (AI) band", () => {
    const block = extractRuleBlock(
      indexCss,
      ".dark .animate-progress-indeterminate-orange,"
    );
    expect(block.length).toBeGreaterThan(0);
    expect(block).toContain("#fb923c");
  });
});
