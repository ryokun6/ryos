import { describe, expect, test } from "bun:test";
import {
  normalizeSearchText,
  isLooseSubsequence,
  computeMatchScore,
  deriveScoreThreshold,
} from "../../../src/apps/chats/utils/fuzzySearch";

/**
 * Locks the behavior of the shared fuzzy-search helpers extracted from
 * useAiChat.ts and de-duplicated from the media tool handler.
 */

describe("chats fuzzySearch helpers", () => {
  test("normalizeSearchText lowercases and strips diacritics", () => {
    expect(normalizeSearchText("Café")).toBe("cafe");
    expect(normalizeSearchText("RÉSUMÉ")).toBe("resume");
    expect(normalizeSearchText("hello")).toBe("hello");
  });

  test("isLooseSubsequence matches in-order character subsequences", () => {
    expect(isLooseSubsequence("readme", "rme")).toBe(true);
    expect(isLooseSubsequence("readme", "rm")).toBe(true);
    expect(isLooseSubsequence("readme", "")).toBe(true);
    expect(isLooseSubsequence("readme", "xyz")).toBe(false);
    expect(isLooseSubsequence("readme", "emr")).toBe(false); // wrong order
  });

  test("computeMatchScore ranks exact/substring matches highest", () => {
    const exact = computeMatchScore("readme", "readme", ["readme"]);
    const substring = computeMatchScore("readme.md", "readme", ["readme"]);
    const unrelated = computeMatchScore("notes", "readme", ["readme"]);

    expect(exact).toBeGreaterThan(0.9);
    expect(substring).toBeGreaterThan(0.7);
    expect(exact).toBeGreaterThanOrEqual(substring);
    expect(unrelated).toBeLessThan(substring);
    // Empty query always matches.
    expect(computeMatchScore("anything", "", [])).toBe(1);
  });

  test("deriveScoreThreshold loosens as the query grows", () => {
    expect(deriveScoreThreshold(1)).toBe(0.65);
    expect(deriveScoreThreshold(4)).toBe(0.55);
    expect(deriveScoreThreshold(6)).toBe(0.5);
    expect(deriveScoreThreshold(8)).toBe(0.45);
    expect(deriveScoreThreshold(20)).toBe(0.4);
  });
});
