import { readFileSync } from "node:fs";
import { join } from "node:path";

const STYLES_DIR = join(import.meta.dir, "../../src/styles");
const SRC_DIR = join(import.meta.dir, "../../src");

/** Split theme sheets referenced by `themes.css` @imports. */
export const aquaThemeCss = readFileSync(
  join(STYLES_DIR, "themes/aqua.css"),
  "utf8"
);

export const darkAquaThemeCss = readFileSync(
  join(STYLES_DIR, "themes/dark-aqua.css"),
  "utf8"
);

/** Shared `src/index.css` for theme/CSS regression suites. */
export const indexCss = readFileSync(join(SRC_DIR, "index.css"), "utf8");

/**
 * Extract a CSS rule block starting at `selector`.
 * Callers may pass either `.foo` or `.foo {` (matching prior suite helpers).
 */
export function extractRuleBlock(css: string, selector: string): string {
  const start = css.indexOf(selector);
  if (start < 0) {
    return "";
  }

  const openBrace = css.indexOf("{", start);
  if (openBrace < 0) {
    return "";
  }

  let depth = 0;
  for (let i = openBrace; i < css.length; i += 1) {
    const char = css[i];
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return css.slice(start, i + 1);
      }
    }
  }

  return "";
}
