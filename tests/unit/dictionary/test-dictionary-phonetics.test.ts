#!/usr/bin/env bun
import { describe, expect, test } from "bun:test";
import {
  hanziToZhuyin,
  hanziToZhuyinReadings,
  normalizePinyinSearchKey,
  numberedPinyinSyllableToZhuyin,
  numberedPinyinToToneMarks,
  numberedPinyinToZhuyin,
  textContainsZhuyin,
} from "../../../src/utils/zhuyin";
import { alignFuriganaReading, parseInlineFurigana } from "../../../src/utils/furigana";
import {
  chineseCharacterReadings,
  chineseTextToPinyin,
  displayChineseHeadword,
  alternateChineseHeadword,
  formatChineseReading,
  japaneseRomaji,
  koreanRomanization,
} from "../../../src/apps/dictionary/utils/phonetics";

describe("numbered pinyin (CC-CEDICT) conversion", () => {
  test("converts to tone marks, including ü written as u:", () => {
    expect(numberedPinyinToToneMarks("xue2 xi2")).toBe("xué xí");
    expect(numberedPinyinToToneMarks("lu:4 se4")).toBe("lǜ sè");
    expect(numberedPinyinToToneMarks("ma5")).toBe("ma");
  });

  test("converts to zhuyin with tone marks and neutral-tone dot", () => {
    expect(numberedPinyinToZhuyin("xue2 xi2")).toBe("ㄒㄩㄝˊ ㄒㄧˊ");
    expect(numberedPinyinToZhuyin("ni3 hao3")).toBe("ㄋㄧˇ ㄏㄠˇ");
    expect(numberedPinyinToZhuyin("ma5")).toBe("˙ㄇㄚ");
  });

  test("handles syllables with special zhuyin spellings", () => {
    expect(numberedPinyinSyllableToZhuyin("zhi1")).toBe("ㄓ");
    expect(numberedPinyinSyllableToZhuyin("er2")).toBe("ㄦˊ");
    expect(numberedPinyinSyllableToZhuyin("yu2")).toBe("ㄩˊ");
  });

  test("search keys ignore tones, spacing, case, and ü spelling", () => {
    expect(normalizePinyinSearchKey("xue2 xi2")).toBe("xuexi");
    expect(normalizePinyinSearchKey("xué xí")).toBe("xuexi");
    expect(normalizePinyinSearchKey("Zhong1 guo2")).toBe("zhongguo");
    expect(normalizePinyinSearchKey("lu:4")).toBe(normalizePinyinSearchKey("lǜ"));
  });
});

describe("hanzi to zhuyin", () => {
  test("returns one reading per character", () => {
    expect(hanziToZhuyinReadings("中文")).toEqual(["ㄓㄨㄥ", "ㄨㄣˊ"]);
    expect(hanziToZhuyin("你好")).toBe("ㄋㄧˇㄏㄠˇ");
  });

  test("detects zhuyin text", () => {
    expect(textContainsZhuyin("ㄋㄧˇ")).toBe(true);
    expect(textContainsZhuyin("ni3")).toBe(false);
  });
});

describe("chineseCharacterReadings", () => {
  test("prefers dictionary readings when they align with the characters", () => {
    // pinyin-pro alone would read 行 as xíng.
    expect(chineseCharacterReadings("银行", "yin2 hang2", "pinyin")).toEqual(["yín", "háng"]);
    expect(chineseCharacterReadings("银行", "yin2 hang2", "zhuyin")).toEqual(["ㄧㄣˊ", "ㄏㄤˊ"]);
  });

  test("falls back to pinyin-pro when the reading does not line up", () => {
    expect(chineseCharacterReadings("你好吗", undefined, "pinyin")).toEqual(["nǐ", "hǎo", "ma"]);
    expect(chineseCharacterReadings("你好吗", "ni3 hao3", "pinyin")).toEqual(["nǐ", "hǎo", "ma"]);
  });

  test("formats whole readings and sentences", () => {
    expect(formatChineseReading("yin2 hang2", "zhuyin")).toBe("ㄧㄣˊ ㄏㄤˊ");
    expect(formatChineseReading("yin2 hang2", "pinyin")).toBe("yín háng");
    expect(chineseTextToPinyin("我爱你")).toBe("wǒ ài nǐ");
  });

  test("picks the headword for the preferred script", () => {
    const entry = { headword: "学习", simplified: "学习", traditional: "學習" };
    expect(displayChineseHeadword(entry, "traditional")).toBe("學習");
    expect(displayChineseHeadword(entry, "simplified")).toBe("学习");
    expect(alternateChineseHeadword(entry, "simplified")).toBe("學習");
    expect(
      alternateChineseHeadword({ headword: "你好", simplified: "你好", traditional: "你好" }, "simplified")
    ).toBeNull();
  });
});

describe("furigana alignment", () => {
  test("splits okurigana from kanji readings", () => {
    expect(alignFuriganaReading("食べ物", "たべもの")).toEqual([
      { text: "食", reading: "た" },
      { text: "べ" },
      { text: "物", reading: "もの" },
    ]);
    expect(alignFuriganaReading("お茶", "おちゃ")).toEqual([
      { text: "お" },
      { text: "茶", reading: "ちゃ" },
    ]);
  });

  test("keeps all-kanji words as one ruby segment", () => {
    expect(alignFuriganaReading("勉強", "べんきょう")).toEqual([
      { text: "勉強", reading: "べんきょう" },
    ]);
  });

  test("treats katakana words (including ー) as already readable", () => {
    expect(alignFuriganaReading("コーヒー", "こーひー")).toEqual([{ text: "コーヒー" }]);
  });

  test("falls back to a single segment when kana cannot be matched", () => {
    expect(alignFuriganaReading("食べる", "ぜんぜん")).toEqual([
      { text: "食べる", reading: "ぜんぜん" },
    ]);
  });

  test("parses inline readings from Wiktionary examples", () => {
    const parsed = parseInlineFurigana("学校(がっこう)で英語（えいご）を勉強する");
    expect(parsed.text).toBe("学校で英語を勉強する");
    expect(parsed.segments).toEqual([
      { text: "学校", reading: "がっこう" },
      { text: "で" },
      { text: "英語", reading: "えいご" },
      { text: "を勉強する" },
    ]);
  });
});

describe("romaji and Korean romanization", () => {
  test("converts kana to romaji", () => {
    expect(japaneseRomaji("べんきょう")).toBe("benkyou");
  });

  test("romanizes Hangul", () => {
    expect(koreanRomanization("사랑")).toBe("sarang");
    expect(koreanRomanization("한국어")).toBe("hangukeo");
  });
});
