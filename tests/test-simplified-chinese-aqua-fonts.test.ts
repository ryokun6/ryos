import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const tokensCss = readFileSync(
  join(import.meta.dir, "../src/styles/themes/tokens.css"),
  "utf8"
);
const aquaCss = readFileSync(
  join(import.meta.dir, "../src/styles/themes/aqua.css"),
  "utf8"
);
const indexHtml = readFileSync(
  join(import.meta.dir, "../index.html"),
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

describe("Simplified Chinese Aqua fonts", () => {
  test("uses a Simplified-friendly UI stack only for macOS zh-CN", () => {
    const simplifiedBlock = extractRuleBlock(
      tokensCss,
      ':root[data-os-theme="macosx"]:lang(zh-CN)'
    );

    expect(simplifiedBlock).toContain('"PingFang SC"');
    expect(simplifiedBlock).toContain('"Microsoft YaHei"');
    expect(simplifiedBlock.indexOf('"Hiragino Sans GB"')).toBeLessThan(
      simplifiedBlock.indexOf('"PingFang SC"')
    );
    expect(tokensCss).not.toContain(
      ':root[data-os-theme="system7"]:lang(zh-CN)'
    );
    expect(tokensCss).not.toContain(
      ':root[data-os-theme="win98"]:lang(zh-CN)'
    );
    expect(tokensCss).not.toContain(':root[data-os-theme="xp"]:lang(zh-CN)');
  });

  test("uses Simplified Source Han and Songti fallbacks for Aqua lyrics", () => {
    expect(aquaCss).toContain(
      ':root[data-os-theme="macosx"]:lang(zh-CN)'
    );
    expect(aquaCss).toContain('"Source Han Serif SC"');
    expect(aquaCss).toContain('"Noto Serif CJK SC"');
    expect(aquaCss).toContain('"Songti SC"');
    expect(aquaCss).toContain(
      'font-family: "Yuanti SC", "PingFang SC", "VAGRounded"'
    );
    expect(aquaCss).toContain(
      'font-family: "Hiragino Sans GB", "PingFang SC"'
    );
    expect(indexHtml).toContain("family=Noto+Serif+SC:wght@700");
    expect(aquaCss).toContain(
      ':is(.font-lyrics-rounded, .font-lyrics-gold-glow)'
    );
    expect(aquaCss).toContain(
      ':is(.font-lyrics-sans, .font-lyrics-gradient)'
    );
  });

  test("routes Aqua UI overrides through the locale-aware font token", () => {
    const synthBlock = extractRuleBlock(
      aquaCss,
      ':root[data-os-theme="macosx"] .synth-force-font'
    );
    const videosBlock = extractRuleBlock(
      aquaCss,
      ':root[data-os-theme="macosx"] .videos-player-controls button.font-geneva-12'
    );

    expect(synthBlock).toContain("font-family: var(--os-font-ui)");
    expect(videosBlock).toContain("font-family: var(--os-font-ui)");
  });
});
