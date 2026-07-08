import { describe, expect, test } from "bun:test";
import { getFuriganaSegmentsPronunciationOnly } from "../../../src/utils/romanization";
import type { FuriganaSegment } from "../../../src/utils/romanization";
import {
  getTrailingWhitespace,
  mapWordTimingsToFurigana,
} from "../../../src/apps/ipod/components/lyrics-display/furiganaWordMapping";
import type { LyricWord } from "../../../src/types/lyrics";

// Build LyricWord timings from plain strings; timing values are irrelevant to
// the text-combining behavior under test.
function mkWords(texts: string[]): LyricWord[] {
  return texts.map((text, i) => ({
    text,
    startTimeMs: i * 100,
    durationMs: 100,
  }));
}

function seg(text: string, reading?: string): FuriganaSegment {
  return reading ? { text, reading } : { text };
}

// These tests drive the real production combiner (mapWordTimingsToFurigana)
// instead of re-implementing its logic, so they fail if the source changes.
describe("furigana timed-word combine (mapWordTimingsToFurigana)", () => {
  test("combines consecutive no-space Japanese words sharing a reading", () => {
    const { renderItems, skipIndices } = mapWordTimingsToFurigana(
      mkWords(["走", "る"]),
      [seg("走る", "はしる")]
    );
    expect(renderItems).toHaveLength(1);
    expect(renderItems[0].text).toBe("走る");
    expect(renderItems[0].reading).toBe("はしる");
    expect(renderItems[0].combinedWordIndices).toEqual([0, 1]);
    expect([...skipIndices]).toEqual([1]);
  });

  test("strips trailing whitespace from a combined unit", () => {
    const { renderItems } = mapWordTimingsToFurigana(
      mkWords(["走", "る "]),
      [seg("走る", "はしる")]
    );
    expect(renderItems).toHaveLength(1);
    expect(renderItems[0].text).toBe("走る");
  });

  test("combines a mixed Latin+kanji no-space segment", () => {
    const { renderItems } = mapWordTimingsToFurigana(
      mkWords(["Hello", "世界"]),
      [seg("Hello世界", "ハローせかい")]
    );
    expect(renderItems).toHaveLength(1);
    expect(renderItems[0].text).toBe("Hello世界");
  });

  test("does NOT combine grouped English phrases when the segment has spaces", () => {
    const { renderItems, skipIndices } = mapWordTimingsToFurigana(
      mkWords(["to ", "the"]),
      [seg("to the", "トゥザ")]
    );
    expect(renderItems).toHaveLength(2);
    expect(renderItems.map((r) => r.text)).toEqual(["to", "the"]);
    expect(skipIndices.size).toBe(0);
  });

  test("does NOT combine grouped Korean phrases when the segment has spaces", () => {
    const { renderItems, skipIndices } = mapWordTimingsToFurigana(
      mkWords(["아주 ", "길게"]),
      [seg("아주 길게", "ajoo gilge")]
    );
    expect(renderItems).toHaveLength(2);
    expect(skipIndices.size).toBe(0);
  });

  test("exposes authored trailing whitespace per word for spaced rendering", () => {
    expect(getTrailingWhitespace("no ")).toBe(" ");
    expect(getTrailingWhitespace("you")).toBe("");
    expect(getTrailingWhitespace("안녕 ")).toBe(" ");
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
