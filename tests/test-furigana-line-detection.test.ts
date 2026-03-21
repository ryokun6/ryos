import { describe, expect, test } from "bun:test";
import {
  lineNeedsFuriganaGeneration,
  parseRubyMarkup,
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
});

describe("FURIGANA_STREAM_SYSTEM_PROMPT", () => {
  test("documents katakana for non-Japanese", () => {
    expect(FURIGANA_STREAM_SYSTEM_PROMPT).toContain("katakana");
    expect(FURIGANA_STREAM_SYSTEM_PROMPT).toContain("Latin");
  });
});
