import { describe, expect, test } from "bun:test";

import {
  calculateSimilarity,
  normalizeForComparison,
  scoreSongMatch,
  stripParentheses,
} from "../api/songs/_utils";

describe("normalizeForComparison", () => {
  test("preserves CJK letters (not stripped like ASCII-only \\w)", () => {
    expect(normalizeForComparison("七里香")).toBe("七里香");
    expect(normalizeForComparison("  周杰倫  ")).toBe("周杰倫");
  });

  test("preserves Hangul", () => {
    expect(normalizeForComparison("사랑")).toBe("사랑");
  });

  test("normalizes Latin and strips punctuation", () => {
    expect(normalizeForComparison("Hello, World!")).toBe("hello world");
  });
});

describe("stripParentheses", () => {
  test("removes ASCII and fullwidth parentheses and CJK brackets", () => {
    expect(stripParentheses("七里香（Album Ver）")).toBe("七里香");
    expect(stripParentheses("Title【MV】")).toBe("Title");
    expect(stripParentheses("A「B」C")).toBe("A C");
  });
});

describe("calculateSimilarity", () => {
  test("exact and substring matches for Latin", () => {
    expect(calculateSimilarity("hello", "hello")).toBe(1);
    expect(calculateSimilarity("hello", "hello world")).toBeGreaterThanOrEqual(0.85);
  });

  test("Traditional vs Simplified Chinese align after harmonize path in scoreSongMatch", () => {
    // Direct calculateSimilarity does not run OpenCC; script harmonization is in scoreSongMatch.
    // Same Han form should still compare.
    expect(calculateSimilarity("周杰伦", "周杰伦")).toBe(1);
  });

  test("CJK substring overlap scores above zero", () => {
    const s = calculateSimilarity("七里香", "七里香 完整版");
    expect(s).toBeGreaterThan(0);
  });
});

describe("scoreSongMatch", () => {
  test("Traditional Chinese metadata matches KuGou-style Simplified strings", () => {
    const good = scoreSongMatch(
      { songname: "七里香", singername: "周杰伦" },
      "七里香",
      "周杰倫"
    );
    const bad = scoreSongMatch(
      { songname: "完全不同", singername: "其他人" },
      "七里香",
      "周杰倫"
    );
    expect(good).toBeGreaterThan(bad);
    expect(good).toBeGreaterThan(0.85);
  });

  test("Japanese with Kana does not use Chinese-only harmonization destructively", () => {
    const j = scoreSongMatch(
      { songname: "ライラック", singername: "米津玄師" },
      "ライラック",
      "米津玄師"
    );
    expect(j).toBeGreaterThan(0.9);
  });

  test("Latin title and artist score highly when aligned", () => {
    const s = scoreSongMatch(
      { songname: "Never Gonna Give You Up", singername: "Rick Astley" },
      "Never Gonna Give You Up",
      "Rick Astley"
    );
    expect(s).toBeGreaterThan(0.95);
  });
});
