import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const tokensCss = readFileSync(
  join(import.meta.dir, "../../../src/styles/themes/tokens.css"),
  "utf8"
);
const appCss = readFileSync(
  join(import.meta.dir, "../../../src/index.css"),
  "utf8"
);
const aquaCss = readFileSync(
  join(import.meta.dir, "../../../src/styles/themes/aqua.css"),
  "utf8"
);
const indexHtml = readFileSync(
  join(import.meta.dir, "../../../index.html"),
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
      'font-family: "ryOS VAG Rounded", "Chiron GoRound TC WS", "Yuanti SC"'
    );
    expect(aquaCss).toContain(
      'font-family: "LucidaGrande", "Lucida Grande", "Hiragino Sans GB"'
    );
    expect(aquaCss).toContain(
      'font-family: Charter, "Noto Serif SC", "Source Han Serif SC"'
    );
    expect(indexHtml).toContain("family=Noto+Serif+SC:wght@400;700");
    expect(aquaCss).toContain(
      ':is(.font-lyrics-rounded, .font-lyrics-gold-glow)'
    );
    expect(aquaCss).toContain(
      ':is(.font-lyrics-sans, .font-lyrics-gradient)'
    );
  });

  test("uses Chiron before the Simplified Chinese rounded fallbacks", () => {
    const simplifiedRoundedBlock = extractRuleBlock(
      aquaCss,
      ':root[data-os-theme="macosx"]:lang(zh-CN)'
    );

    expect(indexHtml).toContain(
      "chiron-go-round-tc-webfont@1.0.11/css/vf.css"
    );
    expect(appCss).toContain('"Chiron GoRound TC WS"');
    expect(aquaCss).toContain('"Chiron GoRound TC WS"');
    expect(indexHtml).not.toContain("Kosugi+Maru");
    expect(appCss).not.toContain('"Kosugi Maru"');
    expect(aquaCss).not.toContain('"Kosugi Maru"');
    expect(simplifiedRoundedBlock).toContain('"Chiron GoRound TC WS"');
    expect(simplifiedRoundedBlock).toContain('"Yuanti SC"');
    expect(simplifiedRoundedBlock.indexOf('"Chiron GoRound TC WS"')).toBeLessThan(
      simplifiedRoundedBlock.indexOf('"Yuanti SC"')
    );
  });

  test("uses weight 700 for rounded karaoke lyrics", () => {
    const baseRoundedBlock = extractRuleBlock(
      appCss,
      "\n  .font-lyrics-rounded {"
    );
    const baseGoldGlowBlock = extractRuleBlock(
      appCss,
      "\n  .font-lyrics-gold-glow {"
    );
    const aquaIpodRoundedBlock = extractRuleBlock(
      aquaCss,
      ':root[data-os-theme="macosx"] .ipod-force-font .font-lyrics-rounded'
    );
    const aquaKaraokeRoundedBlock = extractRuleBlock(
      aquaCss,
      ':root[data-os-theme="macosx"] .karaoke-force-font .font-lyrics-rounded'
    );
    const aquaGoldGlowBlock = extractRuleBlock(
      aquaCss,
      ':root[data-os-theme="macosx"] .ipod-force-font .font-lyrics-gold-glow'
    );

    expect(baseRoundedBlock).toContain("font-weight: 700;");
    expect(baseGoldGlowBlock).toContain("font-weight: 700;");
    expect(aquaIpodRoundedBlock).toContain("font-weight: 700 !important;");
    expect(aquaKaraokeRoundedBlock).toContain("font-weight: 700 !important;");
    expect(aquaGoldGlowBlock).toContain("font-weight: 700 !important;");
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

  test("uses a JP-first broad CJK serif stack for app headers by default", () => {
    const stackStart = appCss.indexOf("--font-cjk-serif-jp:");
    const stackEnd = appCss.indexOf(";", stackStart);
    const stack = appCss.slice(stackStart, stackEnd);

    expect(stack).toContain('"Noto Serif JP"');
    expect(stack).toContain('"Source Han Serif"');
    expect(stack).toContain('"Noto Serif SC"');
    expect(stack.indexOf('"Noto Serif JP"')).toBeLessThan(
      stack.indexOf('"Noto Serif SC"')
    );
    expect(appCss).toContain(
      '--font-apple-garamond: "AppleGaramond", var(--font-cjk-serif-jp)'
    );
    expect(aquaCss).toContain(
      "font-family: var(--font-apple-garamond) !important"
    );
  });
});
