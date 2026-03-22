import { describe, expect, test } from "bun:test";
import {
  lineNeedsFuriganaGeneration,
  parseRubyMarkup,
  normalizeFuriganaSegments,
  FURIGANA_STREAM_SYSTEM_PROMPT,
} from "../api/songs/_furigana.ts";

describe("lineNeedsFuriganaGeneration", () => {
  test("false for kana-only lines", () => {
    expect(lineNeedsFuriganaGeneration("あいうえお")).toBe(false);
    expect(lineNeedsFuriganaGeneration("アイウエオ")).toBe(false);
    expect(lineNeedsFuriganaGeneration("  ひらがな、カタカナ。 ")).toBe(false);
  });

  test("false for whitespace-only", () => {
    expect(lineNeedsFuriganaGeneration("   ")).toBe(false);
    expect(lineNeedsFuriganaGeneration("")).toBe(false);
  });

  test("true when kanji present", () => {
    expect(lineNeedsFuriganaGeneration("夜空")).toBe(true);
  });

  test("true when Latin present", () => {
    expect(lineNeedsFuriganaGeneration("Hello")).toBe(true);
    expect(lineNeedsFuriganaGeneration("I love you")).toBe(true);
  });

  test("true for mixed kana and Latin", () => {
    expect(lineNeedsFuriganaGeneration("Hello 世界")).toBe(true);
  });

  test("true for Hangul", () => {
    expect(lineNeedsFuriganaGeneration("안녕")).toBe(true);
  });
});

describe("parseRubyMarkup", () => {
  test("parses mixed Latin and kanji style output", () => {
    const segs = parseRubyMarkup("<Hello:ハロー> <世界:せかい>");
    expect(segs).toEqual([
      { text: "Hello", reading: "ハロー" },
      { text: " ", reading: undefined },
      { text: "世界", reading: "せかい" },
    ]);
  });

  test("splits spaced annotated phrases into per-word furigana segments", () => {
    const segs = parseRubyMarkup("<안녕 하세요:annyeong haseyo>");
    expect(segs).toEqual([
      { text: "안녕", reading: "annyeong" },
      { text: " " },
      { text: "하세요", reading: "haseyo" },
    ]);
  });

  test("keeps no-space annotated Japanese as one segment", () => {
    const segs = parseRubyMarkup("<走る:はしる>");
    expect(segs).toEqual([{ text: "走る", reading: "はしる" }]);
  });
});

describe("normalizeFuriganaSegments", () => {
  test("normalizes cached multi-word furigana segments", () => {
    expect(
      normalizeFuriganaSegments([{ text: "I love you", reading: "アイ ラブ ユー" }])
    ).toEqual([
      { text: "I", reading: "アイ" },
      { text: " " },
      { text: "love", reading: "ラブ" },
      { text: " " },
      { text: "you", reading: "ユー" },
    ]);
  });
});

describe("FURIGANA_STREAM_SYSTEM_PROMPT", () => {
  test("documents katakana for non-Japanese", () => {
    expect(FURIGANA_STREAM_SYSTEM_PROMPT).toContain("katakana");
    expect(FURIGANA_STREAM_SYSTEM_PROMPT).toContain("Latin");
    expect(FURIGANA_STREAM_SYSTEM_PROMPT).toContain("wrap each word separately when the source has spaces");
  });
});
