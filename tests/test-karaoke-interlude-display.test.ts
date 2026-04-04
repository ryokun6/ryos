import { describe, expect, test } from "bun:test";

import { LyricsAlignment, type LyricLine } from "../src/types/lyrics";
import {
  applyKaraokeInterludeEllipsis,
  buildInterludeLyricLineWithWordTimings,
  didAdvancePastLongInterlude,
  getIntroInterludeInlineLead,
  getInterludeDotsFadeOpacity,
  isInterludeInlineLyricLine,
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

  test("alternating gap advances to the next lyric pair and carries inline dots on the upcoming row", () => {
    const lines = [
      makeLine(0, "Verse line"),
      makeLine(15000, "Next line"),
      makeLine(22000, "Line after next"),
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
    expect(visible[0]).toBe(lines[2]);
    expect(isInterludeInlineLyricLine(visible[1]!)).toBe(true);
    if (!isInterludeInlineLyricLine(visible[1]!)) {
      throw new Error("expected upcoming lyric with inline interlude lead");
    }
    expect(visible[1].startTimeMs).toBe(lines[1]!.startTimeMs);
    expect(visible[1].words).toBe(lines[1]!.words);
    expect(visible[1].interludeInlineLead.dotsInlineWithNext).toBe(true);
  });

  test("buildInterludeLyricLineWithWordTimings splits the silent gap into three timed words", () => {
    const lines = [
      makeLine(0, "Verse line"),
      makeLine(15000, "Next line"),
      makeLine(22000, "Line after next"),
    ];
    const visible = applyKaraokeInterludeEllipsis({
      visibleLines: [lines[0], lines[1]],
      allLines: lines,
      alignment: LyricsAlignment.Alternating,
      currentIndex: 0,
      currentTimeMs: 5000,
      enabled: true,
    });
    const upcomingWithLead = visible[1];
    if (!isInterludeInlineLyricLine(upcomingWithLead!)) {
      throw new Error("expected upcoming lyric with inline interlude lead");
    }

    const timed = buildInterludeLyricLineWithWordTimings(
      upcomingWithLead.interludeInlineLead,
      lines,
      0
    );
    expect(timed.wordTimings).toHaveLength(3);
    // Countdown is last 3s before next line: next at 15000 → line starts at 12000, 3000ms total
    const total = timed.wordTimings!.reduce((s, w) => s + w.durationMs, 0);
    expect(total).toBe(3000);
    expect(timed.startTimeMs).toBe("12000");
  });

  test("alternating odd rows keep the upcoming lyric first and bring in the following lyric during gaps", () => {
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

    expect(visible).toHaveLength(2);
    expect(isInterludeInlineLyricLine(visible[0]!)).toBe(true);
    if (!isInterludeInlineLyricLine(visible[0]!)) {
      throw new Error("expected upcoming lyric with inline interlude lead");
    }
    expect(visible[0].startTimeMs).toBe(lines[2]!.startTimeMs);
    expect(visible[0].interludeInlineLead.countdownStartMs).toBe(17000);
    expect(visible[1]).toBe(lines[3]);
  });

  test("keeps the upcoming lyric visible while ellipsis leads into a long gap", () => {
    const lines = [
      makeLine(0, "Verse line"),
      makeLine(15000, "Next line"),
      makeLine(22000, "Line after next"),
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
    expect(visible[0]).toBe(lines[2]);
    expect(isInterludeInlineLyricLine(visible[1]!)).toBe(true);
    if (!isInterludeInlineLyricLine(visible[1]!)) {
      throw new Error("expected upcoming lyric with inline interlude lead");
    }
    expect(visible[1].startTimeMs).toBe(lines[1]!.startTimeMs);
  });

  test("getInterludeDotsFadeOpacity rests dim then ramps to full at countdownStartMs", () => {
    expect(getInterludeDotsFadeOpacity(11400, 12000)).toBe(0.4);
    expect(getInterludeDotsFadeOpacity(11775, 12000)).toBeCloseTo(0.7, 5);
    expect(getInterludeDotsFadeOpacity(12000, 12000)).toBe(1);
  });

  test("didAdvancePastLongInterlude only trips on adjacent line advances across a long gap", () => {
    const lines = [
      makeLine(0, "Verse line"),
      makeLine(15000, "Next line"),
      makeLine(22000, "Line after next"),
    ];

    expect(didAdvancePastLongInterlude(lines, 0, 1)).toBe(true);
    expect(didAdvancePastLongInterlude(lines, 1, 2)).toBe(false);
    expect(didAdvancePastLongInterlude(lines, 0, 2)).toBe(false);
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
