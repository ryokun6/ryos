import { describe, expect, test } from "bun:test";

import { LyricsAlignment, type LyricLine } from "../src/types/lyrics";
import {
  applyKaraokeInterludeEllipsis,
  isInterludePlaceholderLine,
} from "../src/utils/karaokeInterludeDisplay";

function makeLine(startTimeMs: number, words: string): LyricLine {
  return {
    startTimeMs: String(startTimeMs),
    words,
  };
}

describe("karaoke interlude ellipsis", () => {
  test("shows lead-in ellipsis during a long intro in center mode", () => {
    const lines = [makeLine(12000, "First line")];

    const visible = applyKaraokeInterludeEllipsis({
      visibleLines: [lines[0]],
      allLines: lines,
      alignment: LyricsAlignment.Center,
      currentIndex: -1,
      currentTimeMs: 4000,
      enabled: true,
    });

    expect(visible).toHaveLength(1);
    expect(isInterludePlaceholderLine(visible[0]!)).toBe(true);
    expect(visible[0]?.words).toBe("\u2022\u2022\u2022");
  });

  test("replaces the held current line with ellipsis during a long mid-song interlude", () => {
    const lines = [
      makeLine(0, "Verse line"),
      makeLine(15000, "Next line"),
    ];

    const visible = applyKaraokeInterludeEllipsis({
      visibleLines: [lines[0], lines[1]],
      allLines: lines,
      alignment: LyricsAlignment.Alternating,
      currentIndex: 0,
      currentTimeMs: 5000,
      enabled: true,
    });

    expect(visible).toHaveLength(2);
    expect(isInterludePlaceholderLine(visible[0]!)).toBe(true);
    expect(visible[1]).toBe(lines[1]);
  });

  test("keeps the upcoming lyric visible while ellipsis leads into a long gap", () => {
    const lines = [
      makeLine(0, "Verse line"),
      makeLine(15000, "Next line"),
    ];

    const visible = applyKaraokeInterludeEllipsis({
      visibleLines: [lines[0], lines[1]],
      allLines: lines,
      alignment: LyricsAlignment.Alternating,
      currentIndex: 0,
      currentTimeMs: 14850,
      enabled: true,
    });

    expect(visible).toHaveLength(2);
    expect(isInterludePlaceholderLine(visible[0]!)).toBe(true);
    expect(visible[1]).toBe(lines[1]);
  });

  test("does not show ellipsis for ordinary short gaps", () => {
    const lines = [
      makeLine(0, "Line one"),
      makeLine(7000, "Line two"),
    ];

    const visible = applyKaraokeInterludeEllipsis({
      visibleLines: [lines[0], lines[1]],
      allLines: lines,
      alignment: LyricsAlignment.FocusThree,
      currentIndex: 0,
      currentTimeMs: 5000,
      enabled: true,
    });

    expect(visible).toEqual([lines[0], lines[1]]);
  });
});
