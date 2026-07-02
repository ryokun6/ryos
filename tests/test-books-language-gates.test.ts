import { describe, expect, test } from "bun:test";
import {
  isChineseBookLanguage,
  isCjkBookLanguage,
  resolveEffectiveChineseScript,
  resolveEffectiveTextLayout,
} from "../src/apps/books/utils/booksLanguage";
import { buildEpubTheme } from "../src/apps/books/utils/booksReader";
import { DEFAULT_BOOKS_SETTINGS } from "../src/stores/useBooksStore";

const palette = {
  background: "#fff",
  text: "#111",
  link: "#00f",
  isDark: false,
};

describe("Books language gates", () => {
  test("treats Chinese locales as Chinese and other/missing as not", () => {
    expect(isChineseBookLanguage("zh-CN")).toBe(true);
    expect(isChineseBookLanguage("zh-Hans")).toBe(true);
    expect(isChineseBookLanguage("zh-TW")).toBe(true);
    expect(isChineseBookLanguage("zh-Hant-HK")).toBe(true);
    expect(isChineseBookLanguage("ja")).toBe(false);
    expect(isChineseBookLanguage("ko")).toBe(false);
    expect(isChineseBookLanguage("en")).toBe(false);
    expect(isChineseBookLanguage(null)).toBe(false);
    expect(isChineseBookLanguage(undefined)).toBe(false);
  });

  test("treats CJK locales as CJK and other/missing as not", () => {
    expect(isCjkBookLanguage("zh")).toBe(true);
    expect(isCjkBookLanguage("ja-JP")).toBe(true);
    expect(isCjkBookLanguage("ko-KR")).toBe(true);
    expect(isCjkBookLanguage("en-US")).toBe(false);
    expect(isCjkBookLanguage("fr")).toBe(false);
    expect(isCjkBookLanguage(null)).toBe(false);
  });

  test("skips simplified/traditional conversion outside Chinese books", () => {
    expect(
      resolveEffectiveChineseScript("traditional", "zh-CN")
    ).toBe("traditional");
    expect(
      resolveEffectiveChineseScript("simplified", "zh-Hant")
    ).toBe("simplified");
    expect(resolveEffectiveChineseScript("traditional", "ja")).toBe(
      "original"
    );
    expect(resolveEffectiveChineseScript("simplified", "ko")).toBe(
      "original"
    );
    expect(resolveEffectiveChineseScript("traditional", "en")).toBe(
      "original"
    );
    expect(resolveEffectiveChineseScript("simplified", null)).toBe(
      "original"
    );
  });

  test("allows vertical layout only for CJK books", () => {
    expect(resolveEffectiveTextLayout("vertical", "ja")).toBe("vertical");
    expect(resolveEffectiveTextLayout("vertical", "zh-TW")).toBe("vertical");
    expect(resolveEffectiveTextLayout("vertical", "ko")).toBe("vertical");
    expect(resolveEffectiveTextLayout("vertical", "en")).toBe("book");
    expect(resolveEffectiveTextLayout("vertical", null)).toBe("book");
    expect(resolveEffectiveTextLayout("book", "ja")).toBe("book");
  });

  test("theme keeps horizontal styles when vertical is set on a Latin book", () => {
    const theme = buildEpubTheme(
      { ...DEFAULT_BOOKS_SETTINGS, textLayout: "vertical", lineHeight: 1.5 },
      palette,
      "en",
      "en"
    );

    expect(theme.body["text-align"]).toBe("left !important");
    expect(theme.body.hyphens).toBe("auto !important");
    // Latin/unknown books must not take the vertical line-height floor (1.8).
    expect(theme.body["line-height"]).toBe("1.5 !important");
  });
});
