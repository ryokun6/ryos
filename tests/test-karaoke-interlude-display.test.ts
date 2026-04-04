import { describe, expect, test } from "bun:test";

import { LyricsAlignment, type LyricLine } from "../src/types/lyrics";
import {
  applyKaraokeInterludeEllipsis,
  buildInterludeLyricLineWithWordTimings,
  getGapInterludeInlineLead,
  getIntroInterludeInlineLead,
  getInterludeDotsFadeOpacity,
  isAlternatingInterludeDotsActive,
  isInterludePlaceholderLine,
} from "../src/utils/karaokeInterludeDisplay";

function makeLine(startTimeMs: number, words: string): LyricLine {
  return {
    startTimeMs: String(startTimeMs),
    words,
  };
}

describe("karaoke interlude ellipsis", () => {
  test("does not show lead-in intro dots in single-line (center) mode", () => {
    const lines = [makeLine(12000, "First line")];

    const visible = applyKaraokeInterludeEllipsis({
      visibleLines: [lines[0]],
      allLines: lines,
      alignment: LyricsAlignment.Center,
      currentIndex: -1,
      currentTimeMs: 4000,
      enabled: true,
    });

    expect(visible).toEqual([lines[0]]);
    expect(isInterludePlaceholderLine(visible[0]!)).toBe(false);
  });

  test("shows intro placeholder with countdownStartMs during long intro (dots opacity in UI)", () => {
    const lines = [makeLine(12000, "First line")];

    const visible = applyKaraokeInterludeEllipsis({
      visibleLines: [lines[0]],
      allLines: lines,
      alignment: LyricsAlignment.FocusThree,
      currentIndex: -1,
      currentTimeMs: 4000,
      enabled: true,
    });

    expect(visible).toHaveLength(2);
    expect(isInterludePlaceholderLine(visible[0]!)).toBe(true);
    expect(visible[0]!.countdownStartMs).toBe(9000);
    expect(visible[1]).toBe(lines[0]);
  });

  test("shows lead-in intro dots during countdown of a long intro in focus-three mode", () => {
    const lines = [makeLine(12000, "First line")];

    const visible = applyKaraokeInterludeEllipsis({
      visibleLines: [lines[0]],
      allLines: lines,
      alignment: LyricsAlignment.FocusThree,
      currentIndex: -1,
      currentTimeMs: 9500,
      enabled: true,
    });

    expect(visible).toHaveLength(2);
    expect(isInterludePlaceholderLine(visible[0]!)).toBe(true);
    expect(visible[1]).toBe(lines[0]);
  });

  test("alternating long intro: preserves visible rows (inline dots via getIntroInterludeInlineLead)", () => {
    const oneLineSong = [makeLine(12000, "First line")];

    const visibleOne = applyKaraokeInterludeEllipsis({
      visibleLines: [oneLineSong[0]],
      allLines: oneLineSong,
      alignment: LyricsAlignment.Alternating,
      currentIndex: -1,
      currentTimeMs: 4000,
      enabled: true,
    });

    expect(visibleOne).toEqual([oneLineSong[0]]);
    expect(getIntroInterludeInlineLead(oneLineSong, 4000, true)).not.toBeNull();

    const twoLineSong = [
      makeLine(12000, "First line"),
      makeLine(25000, "Second line"),
    ];

    const visibleTwo = applyKaraokeInterludeEllipsis({
      visibleLines: [twoLineSong[0], twoLineSong[1]],
      allLines: twoLineSong,
      alignment: LyricsAlignment.Alternating,
      currentIndex: -1,
      currentTimeMs: 4000,
      enabled: true,
    });

    expect(visibleTwo).toEqual([twoLineSong[0], twoLineSong[1]]);
    expect(getIntroInterludeInlineLead(twoLineSong, 4000, true)).not.toBeNull();
  });

  test("alternating long gap: shows next two lyrics (drops previous line); inline lead via getGapInterludeInlineLead", () => {
    const lines = [
      makeLine(0, "Verse line"),
      makeLine(15000, "Next line"),
      makeLine(28000, "Third line"),
    ];

    const visible = applyKaraokeInterludeEllipsis({
      visibleLines: [lines[0], lines[1]],
      allLines: lines,
      alignment: LyricsAlignment.Alternating,
      currentIndex: 0,
      currentTimeMs: 5000,
      enabled: true,
    });

    // Top slot = line after next, bottom = upcoming (same vertical slot as pre-interlude [current, next])
    expect(visible).toEqual([lines[2], lines[1]]);
    expect(isInterludePlaceholderLine(visible[0]!)).toBe(false);
    const lead = getGapInterludeInlineLead(lines, 0, 5000, true);
    expect(lead).not.toBeNull();
    expect(lead!.dotsInlineWithNext).toBe(true);
  });

  test("alternating long gap with only two lines: shows upcoming line only", () => {
    const lines = [makeLine(0, "Verse line"), makeLine(15000, "Next line")];

    const visible = applyKaraokeInterludeEllipsis({
      visibleLines: [lines[0], lines[1]],
      allLines: lines,
      alignment: LyricsAlignment.Alternating,
      currentIndex: 0,
      currentTimeMs: 5000,
      enabled: true,
    });

    expect(visible).toEqual([lines[1]]);
  });

  test("buildInterludeLyricLineWithWordTimings splits the silent gap into three timed words", () => {
    const lines = [
      makeLine(0, "Verse line"),
      makeLine(15000, "Next line"),
    ];
    const placeholder = getGapInterludeInlineLead(lines, 0, 5000, true);
    if (!isInterludePlaceholderLine(placeholder!)) throw new Error("expected placeholder");

    const timed = buildInterludeLyricLineWithWordTimings(placeholder, lines, 0);
    expect(timed.wordTimings).toHaveLength(3);
    // Countdown is last 3s before next line: next at 15000 → line starts at 12000, 3000ms total
    const total = timed.wordTimings!.reduce((s, w) => s + w.durationMs, 0);
    expect(total).toBe(3000);
    expect(timed.startTimeMs).toBe("12000");
  });

  test("gap inline lead countdownStartMs matches dot fill segment start", () => {
    const lines = [
      makeLine(0, "Verse line"),
      makeLine(15000, "Next line"),
    ];

    const lead = getGapInterludeInlineLead(lines, 0, 5000, true);
    expect(lead).not.toBeNull();
    expect(lead!.countdownStartMs).toBe(12000);
  });

  test("alternating long gap near next line start: still shows next two lines when a third exists", () => {
    const lines = [
      makeLine(0, "Verse line"),
      makeLine(15000, "Next line"),
      makeLine(28000, "Third line"),
    ];

    const visible = applyKaraokeInterludeEllipsis({
      visibleLines: [lines[0], lines[1]],
      allLines: lines,
      alignment: LyricsAlignment.Alternating,
      currentIndex: 0,
      currentTimeMs: 14850,
      enabled: true,
    });

    expect(visible).toEqual([lines[2], lines[1]]);
  });

  test("getInterludeDotsFadeOpacity rests dim then ramps to full at countdownStartMs", () => {
    expect(getInterludeDotsFadeOpacity(11400, 12000)).toBe(0.4);
    expect(getInterludeDotsFadeOpacity(11775, 12000)).toBeCloseTo(0.7, 5);
    expect(getInterludeDotsFadeOpacity(12000, 12000)).toBe(1);
  });

  test("center mode long gap: shows placeholder and next line so upcoming lyric is visible with dots", () => {
    const lines = [
      makeLine(0, "Verse line"),
      makeLine(15000, "Next line"),
    ];

    const visible = applyKaraokeInterludeEllipsis({
      visibleLines: [lines[0]],
      allLines: lines,
      alignment: LyricsAlignment.Center,
      currentIndex: 0,
      currentTimeMs: 5000,
      enabled: true,
    });

    expect(visible).toHaveLength(2);
    expect(isInterludePlaceholderLine(visible[0]!)).toBe(true);
    expect(visible[1]).toBe(lines[1]);
  });

  test("isAlternatingInterludeDotsActive true only during long intro/gap when enabled", () => {
    const longGap = [
      makeLine(0, "A"),
      makeLine(15000, "B"),
    ];
    expect(
      isAlternatingInterludeDotsActive(
        longGap,
        LyricsAlignment.Alternating,
        0,
        5000,
        true
      )
    ).toBe(true);
    expect(
      isAlternatingInterludeDotsActive(
        longGap,
        LyricsAlignment.Alternating,
        0,
        5000,
        false
      )
    ).toBe(false);

    const shortGap = [makeLine(0, "A"), makeLine(7000, "B")];
    expect(
      isAlternatingInterludeDotsActive(
        shortGap,
        LyricsAlignment.Alternating,
        0,
        5000,
        true
      )
    ).toBe(false);
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
