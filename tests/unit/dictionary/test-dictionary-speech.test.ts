import { describe, expect, test } from "bun:test";
import {
  dictionarySpeechTags,
  headwordSpeechText,
  normalizeVoiceLanguage,
  pickDictionaryVoice,
} from "../../../src/apps/dictionary/utils/speech";

function voice(name: string, lang: string, extra: { default?: boolean } = {}) {
  return { name, lang, voiceURI: `uri:${name}`, default: extra.default ?? false };
}

const MAC_VOICES = [
  voice("Samantha", "en-US", { default: true }),
  voice("Daniel", "en-GB"),
  voice("Zarvox", "en-US"),
  voice("Tingting", "zh-CN"),
  voice("Meijia", "zh-TW"),
  voice("Sinji", "zh-HK"),
  voice("Kyoko", "ja-JP"),
  voice("Yuna", "ko-KR"),
  voice("Thomas", "fr-FR"),
];

describe("normalizeVoiceLanguage", () => {
  test("canonicalizes separators, scripts, and Cantonese", () => {
    expect(normalizeVoiceLanguage("zh_TW")).toBe("zh-tw");
    expect(normalizeVoiceLanguage("cmn-Hant-TW")).toBe("zh-tw");
    expect(normalizeVoiceLanguage("cmn-Hans-CN")).toBe("zh-cn");
    expect(normalizeVoiceLanguage("zh-HK")).toBe("yue");
    expect(normalizeVoiceLanguage("yue-Hant-HK")).toBe("yue");
    expect(normalizeVoiceLanguage("zh")).toBe("zh");
    expect(normalizeVoiceLanguage("ja_JP")).toBe("ja-jp");
  });
});

describe("dictionarySpeechTags", () => {
  test("orders Chinese regions by the selected script", () => {
    expect(dictionarySpeechTags("zh", "simplified")[0]).toBe("zh-cn");
    expect(dictionarySpeechTags("zh", "traditional")[0]).toBe("zh-tw");
    expect(dictionarySpeechTags("en", "simplified")[0]).toBe("en-us");
  });
});

describe("pickDictionaryVoice", () => {
  test("matches the entry language and region", () => {
    expect(pickDictionaryVoice(MAC_VOICES, "en", "simplified")?.name).toBe("Samantha");
    expect(pickDictionaryVoice(MAC_VOICES, "ja", "simplified")?.name).toBe("Kyoko");
    expect(pickDictionaryVoice(MAC_VOICES, "ko", "simplified")?.name).toBe("Yuna");
    expect(pickDictionaryVoice(MAC_VOICES, "zh", "simplified")?.name).toBe("Tingting");
    expect(pickDictionaryVoice(MAC_VOICES, "zh", "traditional")?.name).toBe("Meijia");
  });

  test("falls back to the other Mandarin region", () => {
    const voices = [voice("Tingting", "zh-CN"), voice("Samantha", "en-US")];
    expect(pickDictionaryVoice(voices, "zh", "traditional")?.name).toBe("Tingting");
    expect(pickDictionaryVoice([voice("Google 國語（臺灣）", "zh_TW")], "zh", "simplified")?.name).toBe(
      "Google 國語（臺灣）"
    );
  });

  test("never reads Mandarin entries with a Cantonese-only voice", () => {
    const voices = [voice("Sinji", "zh-HK"), voice("Samantha", "en-US")];
    expect(pickDictionaryVoice(voices, "zh", "traditional")).toBeNull();
  });

  test("falls back to another English region", () => {
    const voices = [voice("Karen", "en-AU"), voice("Kyoko", "ja-JP")];
    expect(pickDictionaryVoice(voices, "en", "simplified")?.name).toBe("Karen");
  });

  test("prefers quality voices over novelty voices in the same region", () => {
    const voices = [voice("Zarvox", "en-US"), voice("Microsoft Zira - English (United States)", "en-US")];
    expect(pickDictionaryVoice(voices, "en", "simplified")?.name).toContain("Zira");
  });

  test("honors the user's voice only when it speaks the entry language", () => {
    expect(pickDictionaryVoice(MAC_VOICES, "en", "simplified", "uri:Daniel")?.name).toBe("Daniel");
    expect(pickDictionaryVoice(MAC_VOICES, "ja", "simplified", "uri:Daniel")?.name).toBe("Kyoko");
    expect(pickDictionaryVoice(MAC_VOICES, "zh", "simplified", "uri:Sinji")?.name).toBe("Tingting");
  });

  test("returns null when no voice speaks the language", () => {
    expect(pickDictionaryVoice([], "en", "simplified")).toBeNull();
    expect(pickDictionaryVoice([voice("Thomas", "fr-FR")], "ko", "simplified")).toBeNull();
  });
});

describe("headwordSpeechText", () => {
  const base = { id: "x", senses: [], source: "cedict" as const };
  test("reads Japanese kana and Chinese in the selected script", () => {
    expect(headwordSpeechText({ ...base, lang: "ja", headword: "今日", reading: "きょう" }, "simplified")).toBe("きょう");
    expect(headwordSpeechText({ ...base, lang: "ja", headword: "これ" }, "simplified")).toBe("これ");
    expect(
      headwordSpeechText({ ...base, lang: "zh", headword: "学习", traditional: "學習" }, "traditional")
    ).toBe("學習");
    expect(headwordSpeechText({ ...base, lang: "en", headword: "happy" }, "simplified")).toBe("happy");
  });
});
