import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { aquaThemeCss } from "./theme-css-fixtures";

const favoritesBarSource = readFileSync(
  join(
    import.meta.dir,
    "../src/apps/internet-explorer/components/internet-explorer-app/InternetExplorerFavoritesBar.tsx"
  ),
  "utf8"
);

describe("Internet Explorer favorites bar (macosx theme)", () => {
  test("favorites bar buttons use stable hook class for macOS typography override", () => {
    expect(favoritesBarSource).toContain("ie-favorites-bar-button");
    expect(favoritesBarSource).toContain("text-[10px]");
  });

  test("aqua.css shrinks macosx bookmark bar text without matching url bar size", () => {
    expect(aquaThemeCss).toContain(
      ':root[data-os-theme="macosx"] button.ie-favorites-bar-button'
    );
    expect(aquaThemeCss).toMatch(
      /button\.ie-favorites-bar-button[\s\S]*?font-size:\s*11px\s*!important/
    );
    expect(aquaThemeCss).not.toContain("hover\\:bg-gray-200.font-geneva-12");
  });
});
