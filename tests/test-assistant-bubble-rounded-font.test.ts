import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const aquaCss = readFileSync(
  join(import.meta.dir, "../src/styles/themes/aqua.css"),
  "utf8"
);
const indexCss = readFileSync(
  join(import.meta.dir, "../src/index.css"),
  "utf8"
);
const assistantOverlaySource = readFileSync(
  join(import.meta.dir, "../src/components/assistant/AssistantOverlay.tsx"),
  "utf8"
);

function extractRuleBlock(css: string, selector: string): string {
  const start = css.indexOf(selector);
  if (start === -1) return "";
  const braceStart = css.indexOf("{", start);
  if (braceStart === -1) return "";
  const braceEnd = css.indexOf("}", braceStart);
  return braceEnd === -1 ? "" : css.slice(start, braceEnd + 1);
}

describe("assistant bubble rounded font (macOS theme)", () => {
  test("overlay root exposes the data-assistant-overlay hook and geneva classes", () => {
    expect(assistantOverlaySource).toContain("data-assistant-overlay");
    expect(assistantOverlaySource).toContain("font-geneva-12");
  });

  test("aqua theme maps assistant bubble text + input to the rounded VAG stack", () => {
    const roundedBlock = extractRuleBlock(
      aquaCss,
      ':root[data-os-theme="macosx"] [data-assistant-overlay] .font-geneva-12'
    );

    expect(roundedBlock).toContain('"ryOS VAG Rounded"');
    expect(roundedBlock).toContain('"Chiron GoRound TC WS"');
    expect(roundedBlock).toContain("!important");
  });

  test("macOS Lucida override excludes the assistant overlay", () => {
    const lucidaRuleStart = aquaCss.indexOf(
      "Outside iPod, Karaoke, and Videos LCD"
    );
    const lucidaRule = aquaCss.slice(lucidaRuleStart, lucidaRuleStart + 800);

    expect(lucidaRule).toContain(
      ":not([data-assistant-overlay] .font-geneva-12)"
    );
  });

  test("system-font override keeps the assistant overlay excluded (all themes unaffected)", () => {
    const systemFontRuleStart = indexCss.indexOf(
      ":root[data-os-system-font] .font-geneva-12:not("
    );
    const systemFontRule = indexCss.slice(
      systemFontRuleStart,
      indexCss.indexOf("{", systemFontRuleStart)
    );

    expect(systemFontRule).toContain(
      ":not([data-assistant-overlay] .font-geneva-12)"
    );
  });
});
