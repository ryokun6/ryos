import { describe, expect, test } from "bun:test";
import { getFuriganaSegmentsPronunciationOnly } from "../src/utils/romanization";

function stripTrailingWhitespace(text: string): string {
  return text.replace(/\s+$/u, "");
}

/** Mirror of LyricsDisplay.tsx timed-word combine logic for regression testing */
function combineTimedWordParts(parts: string[]): string {
  return stripTrailingWhitespace(parts.join(""));
}

function shouldCombineAcrossWordTimings(segmentText: string): boolean {
  return !/\s/u.test(segmentText);
}

describe("furigana timed-word spacing", () => {
  test("preserves authored English spaces", () => {
    expect(combineTimedWordParts(["Oh ", "no ", "loving ", "you"])).toBe("Oh no loving you");
  });

  test("preserves authored Korean spaces", () => {
    expect(combineTimedWordParts(["안녕 ", "하세요"])).toBe("안녕 하세요");
  });

  test("keeps Japanese chunks concatenated when source has no spaces", () => {
    expect(combineTimedWordParts(["走", "る"])).toBe("走る");
  });

  test("keeps mixed Latin and kanji boundary unchanged when source has no spaces", () => {
    expect(combineTimedWordParts(["Hello", "世界"])).toBe("Hello世界");
  });

  test("does not combine grouped English furigana phrases across multiple timings", () => {
    expect(shouldCombineAcrossWordTimings("to the")).toBe(false);
  });

  test("does not combine grouped Korean furigana phrases across multiple timings", () => {
    expect(shouldCombineAcrossWordTimings("아주 길게")).toBe(false);
  });

  test("still combines Japanese no-space furigana across multiple timings", () => {
    expect(shouldCombineAcrossWordTimings("走る")).toBe(true);
  });
});

describe("furigana pronunciation-only spacing", () => {
  test("preserves explicit spaces between annotated English words", () => {
    expect(
      getFuriganaSegmentsPronunciationOnly([
        { text: "I", reading: "アイ" },
        { text: " " },
        { text: "love", reading: "ラブ" },
        { text: " " },
        { text: "you", reading: "ユー" },
      ])
    ).toBe("アイ ラブ ユー");
  });

  test("preserves explicit spaces around Korean text", () => {
    expect(
      getFuriganaSegmentsPronunciationOnly(
        [
          { text: "안녕" },
          { text: " " },
          { text: "하세요" },
        ],
        { koreanRomanization: true }
      )
    ).toBe("annyeong haseyo");
  });

  test("keeps Japanese pronunciation concatenated without source spaces", () => {
    expect(
      getFuriganaSegmentsPronunciationOnly(
        [
          { text: "走", reading: "はし" },
          { text: "る" },
        ],
        { japaneseRomaji: true }
      )
    ).toBe("hashiru");
  });

  test("drops redundant katakana readings in pronunciation-only mode", () => {
    expect(
      getFuriganaSegmentsPronunciationOnly([
        { text: "メロディー", reading: "メロディー" },
        { text: " " },
        { text: "世界", reading: "せかい" },
      ])
    ).toBe("メロディー せかい");
  });
});
