import { readFileSync } from "node:fs";
import { join } from "node:path";

const STYLES_DIR = join(import.meta.dir, "../../src/styles");

/** Split theme sheets referenced by `themes.css` @imports. */
export const aquaThemeCss = readFileSync(
  join(STYLES_DIR, "themes/aqua.css"),
  "utf8"
);

export const darkAquaThemeCss = readFileSync(
  join(STYLES_DIR, "themes/dark-aqua.css"),
  "utf8"
);
