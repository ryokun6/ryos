import { describe, expect, test } from "bun:test";
import {
  LYRICS_PRONUNCIATION_LANGUAGE_OPTIONS,
  chinesePhoneticPatch,
  getChinesePhoneticSystem,
} from "../../../src/types/lyrics";
import {
  getChinesePronunciationOnly,
  getFuriganaSegmentsPronunciationOnly,
} from "../../../src/utils/romanization";
import { hanziToZhuyin, textContainsZhuyin } from "../../../src/utils/zhuyin";
import en from "../../../src/lib/locales/en/translation.json";

describe("Chinese Zhuyin lyrics phonetics", () => {
  test("lists Chinese (Zhuyin) immediately after Chinese (Pinyin)", () => {
    const ids = LYRICS_PRONUNCIATION_LANGUAGE_OPTIONS.map((option) => option.id);
    expect(ids.indexOf("chineseZhuyin")).toBe(ids.indexOf("chinesePinyin") + 1);
    expect(en.apps.ipod.menu.chinesePinyin).toBe("Chinese (Pinyin)");
    expect(en.apps.ipod.menu.chineseZhuyin).toBe("Chinese (Zhuyin)");
  });

  test("renders 注音 rather than Latin pinyin for a Chinese line", () => {
    const line = "你好世界";
    const zhuyin = getChinesePronunciationOnly(line, "zhuyin");
    const pinyinOnly = getChinesePronunciationOnly(line, "pinyin");

    expect(textContainsZhuyin(zhuyin)).toBe(true);
    expect(zhuyin).toContain("ㄋ");
    expect(zhuyin).toContain("ㄏ");
    expect(zhuyin).not.toMatch(/[a-z]/i);
    expect(pinyinOnly).toMatch(/[a-z]/i);
    expect(textContainsZhuyin(pinyinOnly)).toBe(false);
    expect(hanziToZhuyin(line)).toBe(zhuyin);
  });

  test("uses Traditional-friendly Zhuyin for zh-TW hanzi", () => {
    const zhuyin = hanziToZhuyin("中國");
    expect(zhuyin).toContain("ㄓ");
    expect(zhuyin).toContain("ㄍ");
    expect(zhuyin).not.toMatch(/[a-z]/i);
  });

  test("pronunciation-only furigana segments emit Zhuyin when selected", () => {
    const output = getFuriganaSegmentsPronunciationOnly(
      [{ text: "月亮" }],
      { chineseZhuyin: true }
    );
    expect(textContainsZhuyin(output)).toBe(true);
    expect(output).not.toMatch(/[a-z]/i);
  });

  test("selecting Zhuyin clears Pinyin and the reverse", () => {
    expect(chinesePhoneticPatch("zhuyin", true)).toEqual({
      chineseZhuyin: true,
      chinese: false,
    });
    expect(chinesePhoneticPatch("pinyin", true)).toEqual({
      chinese: true,
      chineseZhuyin: false,
    });
    expect(
      getChinesePhoneticSystem({ chinese: true, chineseZhuyin: false })
    ).toBe("pinyin");
    expect(
      getChinesePhoneticSystem({ chinese: false, chineseZhuyin: true })
    ).toBe("zhuyin");
  });
});
