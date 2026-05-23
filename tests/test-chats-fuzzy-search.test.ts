import { describe, expect, test } from "bun:test";
import {
  normalizeSearchText,
  computeMatchScore,
  deriveScoreThreshold,
} from "../src/apps/chats/utils/fuzzySearch";

describe("normalizeSearchText", () => {
  test("lowercases", () => {
    expect(normalizeSearchText("Hello World")).toBe("hello world");
  });

  test("strips diacritics", () => {
    expect(normalizeSearchText("Crème brûlée")).toBe("creme brulee");
    expect(normalizeSearchText("São Paulo")).toBe("sao paulo");
  });

  test("leaves CJK / non-Latin scripts untouched", () => {
    expect(normalizeSearchText("カラオケ")).toBe("カラオケ");
    expect(normalizeSearchText("北京")).toBe("北京");
  });

  test("handles empty input", () => {
    expect(normalizeSearchText("")).toBe("");
  });
});

describe("computeMatchScore", () => {
  test("returns 1 when query is empty (treat as match-all)", () => {
    expect(computeMatchScore("anything", "", [])).toBe(1);
  });

  test("returns 0 for empty text", () => {
    expect(computeMatchScore("", "foo", ["foo"])).toBe(0);
  });

  test("scores exact substring near-1 with a strong prefix bonus", () => {
    const score = computeMatchScore("hello world", "hello", ["hello"]);
    expect(score).toBeGreaterThan(0.85);
    expect(score).toBeLessThanOrEqual(1);
  });

  test("partial-substring matches score lower than full matches", () => {
    const full = computeMatchScore("karaoke", "karaoke", ["karaoke"]);
    const partial = computeMatchScore("karaoke party", "party", ["party"]);
    const missing = computeMatchScore("karaoke", "zzz", ["zzz"]);
    expect(full).toBeGreaterThanOrEqual(partial);
    expect(partial).toBeGreaterThan(missing);
  });

  test("subsequence-only matches still score above the typical threshold", () => {
    const score = computeMatchScore("abcdefghij", "aej", ["aej"]);
    expect(score).toBeGreaterThanOrEqual(0.5);
  });

  test("typo within edit distance still produces a usable score", () => {
    const exact = computeMatchScore("karaoke", "karaoke", ["karaoke"]);
    const typo = computeMatchScore("karaoke", "karoke", ["karoke"]);
    expect(typo).toBeGreaterThan(0.6);
    expect(typo).toBeLessThanOrEqual(exact);
  });

  test("token bonus boosts multi-word queries even when not contiguous", () => {
    const score = computeMatchScore(
      "rolling stones — paint it black",
      "stones black",
      ["stones", "black"]
    );
    expect(score).toBeGreaterThan(0.5);
  });

  test("clamps result to [0, 1]", () => {
    const score = computeMatchScore("abcdef", "abc", ["abc"]);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

describe("deriveScoreThreshold", () => {
  test("is a non-increasing function of query length", () => {
    for (let n = 1; n < 20; n++) {
      expect(deriveScoreThreshold(n)).toBeGreaterThanOrEqual(
        deriveScoreThreshold(n + 1)
      );
    }
  });

  test("returns documented bands", () => {
    expect(deriveScoreThreshold(2)).toBe(0.65);
    expect(deriveScoreThreshold(4)).toBe(0.55);
    expect(deriveScoreThreshold(6)).toBe(0.5);
    expect(deriveScoreThreshold(8)).toBe(0.45);
    expect(deriveScoreThreshold(50)).toBe(0.4);
  });
});
