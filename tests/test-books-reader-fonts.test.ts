import { describe, expect, test } from "bun:test";
import {
  BOOK_FONTS,
  buildEpubTheme,
  buildFontFaceCss,
  getBookFontCssStack,
  resolveBookCjkSerifStack,
} from "../src/apps/books/utils/booksReader";

const settings = {
  fontId: "serif",
  fontSizePct: 100,
  columnMode: "auto" as const,
  themeOverride: "light" as const,
  lineHeight: 1.5,
};

const palette = {
  background: "#fff",
  text: "#111",
  link: "#00f",
  isDark: false,
};

describe("Books reader font choices", () => {
  test("offers the bundled rounded face in the font menu", () => {
    expect(BOOK_FONTS.map((font) => font.id)).toContain("rounded");
    expect(getBookFontCssStack("rounded")).toStartWith('"VAGRounded"');
  });

  test("gives Geneva bundled CJK and emoji fallbacks", () => {
    const stack = getBookFontCssStack("geneva");

    expect(stack).toContain('"Geneva-12", Geneva, "ArkPixel"');
    expect(stack).toContain('"SerenityOS-Emoji"');
    expect(stack?.indexOf('"ArkPixel"')).toBeLessThan(
      stack?.indexOf('"SerenityOS-Emoji"') ?? -1
    );
  });

  test("loads rounded, CJK, and emoji faces inside isolated EPUB iframes", () => {
    const css = buildFontFaceCss("https://os.example");

    expect(css).toContain(
      'url("https://os.example/fonts/VAGRoundedStd-Bold.woff2")'
    );
    expect(css).toContain(
      'url("https://os.example/fonts/fusion-pixel-12px-proportional-ja.woff2")'
    );
    expect(css).toContain(
      'url("https://os.example/fonts/SerenityOS-Emoji.woff2")'
    );
  });
});

describe("Books reader CJK serif fonts", () => {
  test("prefers Simplified Chinese faces for zh-CN and Hans locales", () => {
    for (const language of ["zh", "zh-CN", "zh-Hans", "zh-Hans-CN", "zh-SG"]) {
      const stack = resolveBookCjkSerifStack(language);

      expect(stack).toContain('"Noto Serif SC"');
      expect(stack).toContain('"Source Han Serif SC"');
      expect(stack).toContain('"Noto Serif CJK SC"');
      expect(stack).toContain('"Songti SC"');
      expect(stack.indexOf('"Noto Serif SC"')).toBeLessThan(
        stack.indexOf('"Noto Serif JP"')
      );
    }
  });

  test("selects region-appropriate CJK faces for other locales", () => {
    const traditional = resolveBookCjkSerifStack("zh-Hant-TW");
    const japanese = resolveBookCjkSerifStack("ja-JP");
    const korean = resolveBookCjkSerifStack("ko-KR");

    expect(traditional.indexOf('"Noto Serif TC"')).toBeLessThan(
      traditional.indexOf('"Noto Serif JP"')
    );
    expect(japanese.indexOf('"Noto Serif JP"')).toBeLessThan(
      japanese.indexOf('"Noto Serif SC"')
    );
    expect(korean.indexOf('"Noto Serif KR"')).toBeLessThan(
      korean.indexOf('"Noto Serif JP"')
    );
  });

  test("adds locale-aware CJK fallbacks to both serif reading choices", () => {
    const serif = getBookFontCssStack("serif", "zh-CN");
    const garamond = getBookFontCssStack("eb-garamond", "ko");

    expect(serif).toStartWith('"Charter", "Noto Serif SC"');
    expect(serif).toContain('"Source Han Serif SC"');
    expect(garamond).toStartWith(
      '"EB Garamond", "Charter", "Noto Serif KR"'
    );
    expect(garamond).toContain('"Source Han Serif KR"');
  });

  test("applies the resolved stack throughout the epub.js serif theme", () => {
    const theme = buildEpubTheme(settings, palette, "zh-CN");

    expect(theme.body["font-family"]).toContain(
      '"Charter", "Noto Serif SC", "Source Han Serif SC"'
    );
    expect(theme.p["font-family"]).toBe(theme.body["font-family"]);
    expect(theme.h1["font-family"]).toBe(theme.body["font-family"]);

    const originalTheme = buildEpubTheme(
      { ...settings, fontId: "original" },
      palette,
      "zh-CN"
    );
    expect(originalTheme.body["font-family"]).toBeUndefined();
  });

  test("loads Noto CJK serif families inside isolated EPUB iframes", () => {
    const css = buildFontFaceCss("https://os.example");

    expect(css).toContain("family=Noto+Serif+SC:wght@400;700");
    expect(css).toContain("family=Noto+Serif+TC:wght@400;700");
    expect(css).toContain("family=Noto+Serif+JP:wght@400;700");
    expect(css).toContain("family=Noto+Serif+KR:wght@400;700");
    expect(css.indexOf("@import")).toBeLessThan(css.indexOf("@font-face"));
    expect(css).toContain(
      'url("https://os.example/fonts/EBGaramond-Latin.woff2")'
    );
  });
});
