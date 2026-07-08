import { describe, expect, test } from "bun:test";
import {
  isChineseBookLanguage,
  isCjkBookLanguage,
  normalizeBookLanguage,
  resolveEffectiveChineseScript,
  resolveEffectiveTextLayout,
} from "../../../src/apps/books/utils/booksLanguage";
import { buildEpubTheme } from "../../../src/apps/books/utils/booksReader";
import { DEFAULT_BOOKS_SETTINGS } from "../../../src/stores/useBooksStore";

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

  test("normalizes legacy EPUB dc:language tags to BCP-47", () => {
    expect(normalizeBookLanguage("jpn")).toBe("ja");
    expect(normalizeBookLanguage("JPN")).toBe("ja");
    expect(normalizeBookLanguage("jp")).toBe("ja");
    expect(normalizeBookLanguage("jpn-JP")).toBe("ja-JP");
    expect(normalizeBookLanguage("kor")).toBe("ko");
    expect(normalizeBookLanguage("zho")).toBe("zh");
    expect(normalizeBookLanguage("chi")).toBe("zh");
    expect(normalizeBookLanguage("cmn")).toBe("zh");
    expect(normalizeBookLanguage("zho_TW")).toBe("zh-TW");
    // Valid tags pass through untouched (aside from trimming).
    expect(normalizeBookLanguage(" ja ")).toBe("ja");
    expect(normalizeBookLanguage("zh-Hant-HK")).toBe("zh-Hant-HK");
    expect(normalizeBookLanguage("en-US")).toBe("en-US");
    expect(normalizeBookLanguage("")).toBe(null);
    expect(normalizeBookLanguage("   ")).toBe(null);
    expect(normalizeBookLanguage(null)).toBe(null);
    expect(normalizeBookLanguage(undefined)).toBe(null);
  });

  test("recognizes Japanese books tagged with legacy language codes", () => {
    // Real-world Japanese EPUBs (Aozora Bunko conversions, older tooling)
    // often carry ISO 639-2 "jpn" or the bare country code "jp"; those books
    // must still get the vertical text option, matching Chinese books.
    expect(isCjkBookLanguage("jpn")).toBe(true);
    expect(isCjkBookLanguage("jp")).toBe(true);
    expect(isCjkBookLanguage("jpn-JP")).toBe(true);
    expect(isCjkBookLanguage("kor")).toBe(true);
    expect(isCjkBookLanguage("zho")).toBe(true);
    expect(isCjkBookLanguage("chi")).toBe(true);
    expect(isChineseBookLanguage("zho")).toBe(true);
    expect(isChineseBookLanguage("zho-TW")).toBe(true);
    expect(isChineseBookLanguage("jpn")).toBe(false);
    expect(resolveEffectiveTextLayout("vertical", "jpn")).toBe("vertical");
    expect(resolveEffectiveTextLayout("vertical", "jp")).toBe("vertical");
    expect(resolveEffectiveTextLayout("vertical", "kor")).toBe("vertical");
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
