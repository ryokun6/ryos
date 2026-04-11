import { describe, expect, test } from "bun:test";

import {
  SORAMIMI_JAPANESE_WITH_FURIGANA_PROMPT,
  SORAMIMI_SYSTEM_PROMPT,
  selectSoramimiLinesToProcess,
  isEnglishLyricLine,
  shouldProcessEnglishForSoramimi,
} from "../api/songs/_soramimi.ts";

describe("soramimi English line routing", () => {
  test("detects ASCII English lyric lines", () => {
    expect(isEnglishLyricLine("I love you")).toBe(true);
    expect(isEnglishLyricLine("Oh no!")).toBe(true);
    expect(isEnglishLyricLine("사랑해요")).toBe(false);
    expect(isEnglishLyricLine("こんにちは")).toBe(false);
  });

  test("processes English lines for Chinese soramimi", () => {
    expect(shouldProcessEnglishForSoramimi("zh-TW")).toBe(true);

    const lines = selectSoramimiLinesToProcess(
      [
        { words: "I love you", startTimeMs: "1000" },
        { words: "사랑해요", startTimeMs: "2000" },
      ],
      "zh-TW"
    );

    expect(lines.map((line) => line.line.words)).toEqual(["I love you", "사랑해요"]);
    expect(lines.map((line) => line.originalIndex)).toEqual([0, 1]);
  });

  test("keeps English passthrough for English soramimi", () => {
    expect(shouldProcessEnglishForSoramimi("en")).toBe(false);

    const lines = selectSoramimiLinesToProcess(
      [
        { words: "I love you", startTimeMs: "1000" },
        { words: "사랑해요", startTimeMs: "2000" },
      ],
      "en"
    );

    expect(lines.map((line) => line.line.words)).toEqual(["사랑해요"]);
    expect(lines.map((line) => line.originalIndex)).toEqual([1]);
  });
});

describe("Chinese soramimi prompts", () => {
  test("require English segments to be transformed", () => {
    expect(SORAMIMI_SYSTEM_PROMPT).toContain("including English");
    expect(SORAMIMI_SYSTEM_PROMPT).toContain("never leave them plain");
    expect(SORAMIMI_JAPANESE_WITH_FURIGANA_PROMPT).toContain("including English");
    expect(SORAMIMI_JAPANESE_WITH_FURIGANA_PROMPT).toContain("English segments also need Chinese-character readings");
  });
});
