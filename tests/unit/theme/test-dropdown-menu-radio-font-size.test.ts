import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const dropdownMenuSource = readFileSync(
  join(import.meta.dir, "../../../src/components/ui/dropdown-menu.tsx"),
  "utf8"
);
const lyricsControlsSource = readFileSync(
  join(
    import.meta.dir,
    "../../../src/components/shared/fullscreen-player-controls/LyricsControlsIsland.tsx"
  ),
  "utf8"
);

function extractComponentBlock(source: string, constName: string): string {
  const start = source.indexOf(`const ${constName} = (`);
  if (start === -1) return "";
  const displayNameMarker = `${constName}.displayName`;
  const end = source.indexOf(displayNameMarker, start);
  if (end === -1) return source.slice(start);
  return source.slice(start, end);
}

describe("dropdown menu radio font size", () => {
  test("DropdownMenuRadioItem matches CheckboxItem macOS menu font-size wiring", () => {
    const radio = extractComponentBlock(dropdownMenuSource, "DropdownMenuRadioItem");
    const checkbox = extractComponentBlock(
      dropdownMenuSource,
      "DropdownMenuCheckboxItem"
    );

    expect(radio.length).toBeGreaterThan(0);
    expect(checkbox.length).toBeGreaterThan(0);

    // Both must re-assert --os-menu-item-font-size with !important on macOS so
    // `.karaoke-force-font * { font-size: unset !important }` cannot inflate
    // radio rows (Auto / 繁體 / 簡體) relative to checkbox rows.
    for (const block of [radio, checkbox]) {
      expect(block).toContain("isWindowsTheme || isMacOSTheme");
      expect(block).toContain('"var(--os-menu-item-font-size) !important"');
      expect(block).toContain('"var(--os-menu-item-font-size)"');
      expect(block).toContain("isAquaMenuChrome");
      expect(block).toContain('padding: "6px 20px 6px 32px"');
    }
  });

  test("fullscreen lyrics menus use the shared text-md h-6 item classes", () => {
    expect(lyricsControlsSource).toContain("DropdownMenuRadioItem");
    expect(lyricsControlsSource).toContain("DropdownMenuCheckboxItem");

    const radioItemClasses = [
      ...lyricsControlsSource.matchAll(
        /<DropdownMenuRadioItem[\s\S]*?className="([^"]+)"/g
      ),
    ].map((match) => match[1]);
    const checkboxItemClasses = [
      ...lyricsControlsSource.matchAll(
        /<DropdownMenuCheckboxItem[\s\S]*?className="([^"]+)"/g
      ),
    ].map((match) => match[1]);

    expect(radioItemClasses.length).toBeGreaterThan(0);
    expect(checkboxItemClasses.length).toBeGreaterThan(0);

    for (const className of [...radioItemClasses, ...checkboxItemClasses]) {
      expect(className).toContain("text-md");
      expect(className).toContain("h-6");
    }
  });
});
