import { describe, expect, test } from "bun:test";
import {
  getTranslationBadge,
  TRANSLATION_LANGUAGES,
} from "../../../src/utils/lyricsTranslation";
import { resolveChineseLyricsLanguage } from "../../../src/shared/media/chineseLyrics";
import { areRomanizationSettingsEqual } from "../../../src/types/lyrics";

describe("Chinese lyrics controls", () => {
  test("lists Traditional and Simplified Chinese separately", () => {
    const chineseOptions = TRANSLATION_LANGUAGES.filter((language) =>
      ["zh-TW", "zh-CN"].includes(language.code ?? "")
    );

    expect(chineseOptions).toEqual([
      {
        labelKey: "settings.language.chineseTraditional",
        code: "zh-TW",
      },
      {
        labelKey: "settings.language.chineseSimplified",
        code: "zh-CN",
      },
    ]);
    expect(getTranslationBadge("zh-TW")).toBe("繁");
    expect(getTranslationBadge("zh-CN")).toBe("简");
  });

  test("defaults automatic conversion to the active Chinese locale", () => {
    expect(resolveChineseLyricsLanguage("auto", "zh-TW")).toBe("zh-TW");
    expect(resolveChineseLyricsLanguage("auto", "zh-Hant-HK")).toBe("zh-TW");
    expect(resolveChineseLyricsLanguage("auto", "zh-CN")).toBe("zh-CN");
    expect(resolveChineseLyricsLanguage("auto", "zh-Hans-SG")).toBe("zh-CN");
    expect(resolveChineseLyricsLanguage("auto", "en")).toBe("zh-TW");
  });

  test("keeps an explicit pronunciation-menu override", () => {
    expect(resolveChineseLyricsLanguage("zh-CN", "zh-TW")).toBe("zh-CN");
    expect(resolveChineseLyricsLanguage("zh-TW", "zh-CN")).toBe("zh-TW");
  });

  test("treats Chinese script preference changes as a settings change", () => {
    const base = {
      enabled: true,
      japaneseFurigana: true,
      japaneseRomaji: false,
      korean: true,
      chinese: false,
      chineseLyricsLanguage: "zh-TW" as const,
      soramimi: false,
      soramamiTargetLanguage: "zh-TW" as const,
      pronunciationOnly: false,
    };

    expect(
      areRomanizationSettingsEqual(base, {
        ...base,
        chineseLyricsLanguage: "zh-CN",
      })
    ).toBe(false);
  });
});
