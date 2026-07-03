import { describe, expect, test } from "bun:test";
import {
  detectLanguageFromLocale,
  SUPPORTED_LANGUAGES,
} from "../src/lib/languageConfig";

describe("language configuration", () => {
  test("lists Traditional before Simplified Chinese", () => {
    expect(SUPPORTED_LANGUAGES).toContain("zh-CN");
    expect(SUPPORTED_LANGUAGES).toContain("zh-TW");
    expect(SUPPORTED_LANGUAGES.slice(1, 3)).toEqual(["zh-TW", "zh-CN"]);
    expect(SUPPORTED_LANGUAGES).toHaveLength(11);
  });

  test("maps Simplified Chinese browser locales to zh-CN", () => {
    for (const locale of ["zh", "zh-CN", "zh-Hans", "zh-Hans-CN", "zh-SG"]) {
      expect(detectLanguageFromLocale(locale)).toBe("zh-CN");
    }
  });

  test("maps Traditional Chinese browser locales to zh-TW", () => {
    for (const locale of [
      "zh-TW",
      "zh_TW",
      "zh-Hant",
      "zh-Hant-TW",
      "zh-HK",
      "zh-MO",
    ]) {
      expect(detectLanguageFromLocale(locale)).toBe("zh-TW");
    }
  });

  test("preserves fuzzy matching for non-Chinese locales", () => {
    expect(detectLanguageFromLocale("pt-BR")).toBe("pt");
    expect(detectLanguageFromLocale("ja-JP")).toBe("ja");
    expect(detectLanguageFromLocale("nl-NL")).toBeNull();
  });
});
