import { describe, expect, test } from "bun:test";

import { LyricsAlignment, type LyricLine } from "../../../src/types/lyrics";
import {
  applyKaraokeInterludeEllipsis,
  buildInterludeLyricLineWithWordTimings,
  didAdvancePastLongInterlude,
  getGapInterludeInlineLead,
  getIntroInterludeInlineLead,
  getInterludeDotsFadeOpacity,
  isInterludePlaceholderLine,
  isKaraokeGapInterludeActive,
} from "../../../src/utils/karaokeInterludeDisplay";

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

  test("alternating long gap: drops the completed line and keeps next in the same slot", () => {
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

    // Pre-gap even row was [current, next]; upcoming stays bottom, top becomes next+1.
    expect(visible).toEqual([lines[2], lines[1]]);
    expect(visible.some((line) => line === lines[0])).toBe(false);
    const lead = getGapInterludeInlineLead(lines, 0, 5000, true);
    expect(lead).not.toBeNull();
    expect(lead!.dotsInlineWithNext).toBe(true);
  });

  test("alternating long gap on an odd current row keeps next on top", () => {
    const lines = [
      makeLine(0, "Line one"),
      makeLine(4000, "Line two"),
      makeLine(20000, "Line three"),
      makeLine(28000, "Line four"),
    ];

    const visible = applyKaraokeInterludeEllipsis({
      visibleLines: [lines[2], lines[1]],
      allLines: lines,
      alignment: LyricsAlignment.Alternating,
      currentIndex: 1,
      currentTimeMs: 9000,
      enabled: true,
    });

    expect(visible).toEqual([lines[2], lines[3]]);
    expect(visible.some((line) => line === lines[1])).toBe(false);
  });

  test("alternating long gap with only two lines: shows the upcoming line only", () => {
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

  test("center (single) long gap: dots then the upcoming line, not the completed lyric", () => {
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
    expect(visible.some((line) => !isInterludePlaceholderLine(line) && line === lines[0])).toBe(
      false
    );
  });

  test("focus-three (triple) long gap: advances off the completed line to dots + next + next+1", () => {
    const lines = [
      makeLine(0, "Line one"),
      makeLine(4000, "Line two"),
      makeLine(20000, "Line three"),
      makeLine(28000, "Line four"),
    ];

    const visible = applyKaraokeInterludeEllipsis({
      visibleLines: [lines[0], lines[1], lines[2]],
      allLines: lines,
      alignment: LyricsAlignment.FocusThree,
      currentIndex: 1,
      currentTimeMs: 9000,
      enabled: true,
    });

    expect(visible).toHaveLength(3);
    expect(isInterludePlaceholderLine(visible[0]!)).toBe(true);
    expect(visible[1]).toBe(lines[2]);
    expect(visible[2]).toBe(lines[3]);
    expect(visible.some((line) => line === lines[0] || line === lines[1])).toBe(false);
  });

  test("last line of a song never invents delay dots or a next lyric", () => {
    const lines = [
      makeLine(0, "Verse line"),
      makeLine(4000, "Final line"),
    ];

    for (const alignment of [
      LyricsAlignment.Center,
      LyricsAlignment.Alternating,
      LyricsAlignment.FocusThree,
    ]) {
      const visible = applyKaraokeInterludeEllipsis({
        visibleLines: alignment === LyricsAlignment.Center ? [lines[1]] : [lines[0], lines[1]],
        allLines: lines,
        alignment,
        currentIndex: 1,
        currentTimeMs: 12000,
        enabled: true,
      });

      expect(visible.some(isInterludePlaceholderLine)).toBe(false);
      expect(getGapInterludeInlineLead(lines, 1, 12000, true)).toBeNull();
    }
  });

  test("didAdvancePastLongInterlude only on the step out of a long gap", () => {
    const lines = [
      makeLine(0, "Finished"),
      makeLine(15000, "After dots"),
      makeLine(19000, "Following"),
    ];

    expect(didAdvancePastLongInterlude(lines, 0, 1)).toBe(true);
    expect(didAdvancePastLongInterlude(lines, 1, 2)).toBe(false);
    expect(didAdvancePastLongInterlude(lines, 0, 2)).toBe(false);
    expect(didAdvancePastLongInterlude(lines, -1, 0)).toBe(false);
  });

  test("isKaraokeGapInterludeActive waits for the hold delay and ignores short gaps", () => {
    const longGap = [makeLine(0, "A"), makeLine(15000, "B")];
    expect(isKaraokeGapInterludeActive(longGap, 0, 4000, true)).toBe(false);
    expect(isKaraokeGapInterludeActive(longGap, 0, 5000, true)).toBe(true);
    expect(isKaraokeGapInterludeActive(longGap, 0, 5000, false)).toBe(false);

    const shortGap = [makeLine(0, "A"), makeLine(7000, "B")];
    expect(isKaraokeGapInterludeActive(shortGap, 0, 5000, true)).toBe(false);
  });

  test("getInterludeDotsFadeOpacity rests dim then ramps to full at countdownStartMs", () => {
    expect(getInterludeDotsFadeOpacity(11400, 12000)).toBe(0.4);
    expect(getInterludeDotsFadeOpacity(11775, 12000)).toBeCloseTo(0.7, 5);
    expect(getInterludeDotsFadeOpacity(12000, 12000)).toBe(1);
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
