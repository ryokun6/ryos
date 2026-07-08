import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const indexCss = readFileSync(join(import.meta.dir, "../../../src/index.css"), "utf8");
const contentPaneSource = readFileSync(
  join(
    import.meta.dir,
    "../../../src/apps/internet-explorer/components/internet-explorer-app/InternetExplorerContentPane.tsx"
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
  test("loading bar track is transparent so it works in light and dark", () => {
    expect(contentPaneSource).toContain(
      "bg-transparent backdrop-blur-sm"
    );
    // No fixed white track that would look wrong in dark mode.
    expect(contentPaneSource).not.toContain("bg-white/75");
  });

  test("loading status bar gets a dark surface and divider", () => {
    expect(contentPaneSource).toContain("bg-neutral-100 dark:bg-neutral-900");
    expect(contentPaneSource).toContain(
      "border-t border-neutral-300 dark:border-white/10"
    );
  });

  test("indeterminate sweep keeps the background-size needed to animate", () => {
    // Regression guard: the sweep animates background-position over a
    // 200% 100% gradient; a `background:` shorthand override would reset
    // background-size and stop the animation.
    const block = extractRuleBlock(indexCss, ".animate-progress-indeterminate {");
    expect(block).toContain("background-size: 200% 100%");
    expect(block).toContain("progress-indeterminate 2.5s linear infinite");
  });
});
