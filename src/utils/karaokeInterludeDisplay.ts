import { LyricsAlignment, type LyricLine, type LyricWord } from "@/types/lyrics";

export interface InterludePlaceholderLine {
  startTimeMs: string;
  words: string;
  isInterludePlaceholder: true;
  anchorLineIndex: number;
  /** Absolute time when the 3-2-1 dot fill begins (same as synthetic line start). */
  countdownStartMs: number;
  /**
   * Alternating layout: render timed dots on the same line as the first/next lyric instead of
   * a separate row (intro) or below the ghost line (gap).
   */
  dotsInlineWithNext?: boolean;
}

export interface InterludeInlineLyricLine extends LyricLine {
  interludeInlineLead: InterludePlaceholderLine;
  sourceLineIndex: number;
}

export type VisibleLyricLine =
  | LyricLine
  | InterludePlaceholderLine
  | InterludeInlineLyricLine;

const MIN_LINE_HOLD_MS = 2500;
const LONG_INTERLUDE_THRESHOLD_MS = 8000;
const INTERLUDE_PLACEHOLDER_DELAY_MS = 2000;

/**
 * Duration of the 3-2-1 style dot fill, ending exactly when the next line starts.
 * Word timings only cover this tail of the interlude (not the full silent gap).
 */
export const INTERLUDE_COUNTDOWN_TOTAL_MS = 3000;

/**
 * Dots stay at this opacity until the fade-in window, then ramp to 1 at {@link InterludePlaceholderLine.countdownStartMs}.
 */
export const INTERLUDE_DOTS_REST_OPACITY = 0.4;

/**
 * Dots fade from {@link INTERLUDE_DOTS_REST_OPACITY} → 1 over this window ending at {@link InterludePlaceholderLine.countdownStartMs}.
 */
export const INTERLUDE_DOTS_FADE_IN_MS = 450;

export function getInterludeDotsFadeOpacity(
  currentTimeMs: number,
  countdownStartMs: number
): number {
  const startFade = countdownStartMs - INTERLUDE_DOTS_FADE_IN_MS;
  if (currentTimeMs < startFade) return INTERLUDE_DOTS_REST_OPACITY;
  if (currentTimeMs >= countdownStartMs) return 1;
  const t = (currentTimeMs - startFade) / INTERLUDE_DOTS_FADE_IN_MS;
  return INTERLUDE_DOTS_REST_OPACITY + t * (1 - INTERLUDE_DOTS_REST_OPACITY);
}

/** U+25CF BLACK CIRCLE — reads as a filled dot at lyric font sizes */
const INTERLUDE_DOT = "\u25CF";

/** U+2009 thin space — tighter gap between dots than U+0020 (CSS letter-spacing adds the rest). */
const INTERLUDE_DOT_GAP = "\u2009";

/** Last `INTERLUDE_COUNTDOWN_TOTAL_MS` (or full span if shorter) ending at `fullEndMs`. */
export function buildCountdownSegment(
  fullStartMs: number,
  fullEndMs: number
): { segmentStartMs: number; segmentEndMs: number } {
  const segmentEndMs = fullEndMs;
  const spanMs = Math.max(0, fullEndMs - fullStartMs);
  const countdownMs = Math.min(INTERLUDE_COUNTDOWN_TOTAL_MS, spanMs);
  const segmentStartMs = segmentEndMs - countdownMs;
  return { segmentStartMs, segmentEndMs };
}

function interludeWordsAndTimings(
  segmentStartMs: number,
  segmentEndMs: number
): { words: string; wordTimings: LyricWord[] } {
  const totalMs = Math.max(3, segmentEndMs - segmentStartMs);
  const d = totalMs / 3;
  const wordTimings: LyricWord[] = [
    { text: `${INTERLUDE_DOT}${INTERLUDE_DOT_GAP}`, startTimeMs: 0, durationMs: d },
    { text: `${INTERLUDE_DOT}${INTERLUDE_DOT_GAP}`, startTimeMs: d, durationMs: d },
    { text: INTERLUDE_DOT, startTimeMs: 2 * d, durationMs: d },
  ];
  return {
    words: `${INTERLUDE_DOT}${INTERLUDE_DOT_GAP}${INTERLUDE_DOT}${INTERLUDE_DOT_GAP}${INTERLUDE_DOT}`,
    wordTimings,
  };
}

function createInterludePlaceholder(
  id: string,
  anchorLineIndex: number,
  countdownStartMs: number,
  options?: { dotsInlineWithNext?: boolean }
): InterludePlaceholderLine {
  return {
    startTimeMs: `interlude-${id}`,
    words: `${INTERLUDE_DOT}${INTERLUDE_DOT_GAP}${INTERLUDE_DOT}${INTERLUDE_DOT_GAP}${INTERLUDE_DOT}`,
    isInterludePlaceholder: true,
    anchorLineIndex,
    countdownStartMs,
    dotsInlineWithNext: options?.dotsInlineWithNext,
  };
}

function getLineStartMs(line: LyricLine): number {
  return Number.parseInt(line.startTimeMs, 10);
}

function getLineEndMs(line: LyricLine): number {
  const lineStartMs = getLineStartMs(line);
  const timedDurationMs = line.wordTimings?.reduce((maxDuration, word) => {
    return Math.max(maxDuration, word.startTimeMs + word.durationMs);
  }, 0) ?? 0;

  return lineStartMs + Math.max(MIN_LINE_HOLD_MS, timedDurationMs);
}

function hasLongIntro(lines: LyricLine[], currentTimeMs: number): boolean {
  if (!lines.length) return false;

  const firstLineStartMs = getLineStartMs(lines[0]);
  return firstLineStartMs >= LONG_INTERLUDE_THRESHOLD_MS && currentTimeMs < firstLineStartMs;
}

function hasLongInterlude(
  currentLine: LyricLine,
  nextLine: LyricLine,
  currentTimeMs: number
): boolean {
  if (!hasLongInterludeGap(currentLine, nextLine)) {
    return false;
  }

  const currentLineEndMs = getLineEndMs(currentLine);
  const nextLineStartMs = getLineStartMs(nextLine);
  return (
    currentTimeMs >= currentLineEndMs + INTERLUDE_PLACEHOLDER_DELAY_MS &&
    currentTimeMs < nextLineStartMs
  );
}

function hasLongInterludeGap(currentLine: LyricLine, nextLine: LyricLine): boolean {
  const currentLineEndMs = getLineEndMs(currentLine);
  const nextLineStartMs = getLineStartMs(nextLine);
  const silentGapMs = nextLineStartMs - currentLineEndMs;

  return silentGapMs >= LONG_INTERLUDE_THRESHOLD_MS;
}

export function hasLongInterludeAtTime(
  allLines: LyricLine[],
  currentIndex: number,
  currentTimeMs: number
): boolean {
  if (currentIndex < 0) {
    return false;
  }

  const currentLine = allLines[currentIndex];
  const nextLine = allLines[currentIndex + 1];
  if (!currentLine || !nextLine) {
    return false;
  }

  return hasLongInterlude(currentLine, nextLine, currentTimeMs);
}

export function isInterludePlaceholderLine(
  line: VisibleLyricLine
): line is InterludePlaceholderLine {
  return "isInterludePlaceholder" in line && line.isInterludePlaceholder === true;
}

export function isInterludeInlineLyricLine(
  line: VisibleLyricLine
): line is InterludeInlineLyricLine {
  return "interludeInlineLead" in line;
}

function decorateLyricLineWithInterludeLead(
  line: LyricLine,
  sourceLineIndex: number,
  interludeInlineLead: InterludePlaceholderLine
): InterludeInlineLyricLine {
  return {
    ...line,
    interludeInlineLead,
    sourceLineIndex,
  };
}

/**
 * Build a real {@link LyricLine} with synthetic word timings so interlude dots use the same
 * karaoke mask/outline path as timed lyrics. The three beats fall in a short countdown window
 * ending at the next line (see INTERLUDE_COUNTDOWN_TOTAL_MS), not across the full break.
 */
export function buildInterludeLyricLineWithWordTimings(
  placeholder: InterludePlaceholderLine,
  allLines: LyricLine[],
  actualCurrentLine: number
): LyricLine {
  let segmentStartMs: number;
  let segmentEndMs: number;

  if (actualCurrentLine < 0) {
    const first = allLines[0];
    if (!first) {
      return {
        startTimeMs: "0",
        ...interludeWordsAndTimings(0, 1),
      };
    }
    const fullEndMs = getLineStartMs(first);
    ({ segmentStartMs, segmentEndMs } = buildCountdownSegment(0, fullEndMs));
  } else {
    const current = allLines[placeholder.anchorLineIndex];
    const next = allLines[placeholder.anchorLineIndex + 1];
    if (!current || !next) {
      return {
        startTimeMs: "0",
        ...interludeWordsAndTimings(0, 1),
      };
    }
    const fullStartMs = getLineEndMs(current) + INTERLUDE_PLACEHOLDER_DELAY_MS;
    const fullEndMs = getLineStartMs(next);
    ({ segmentStartMs, segmentEndMs } = buildCountdownSegment(fullStartMs, fullEndMs));
  }

  const { words, wordTimings } = interludeWordsAndTimings(segmentStartMs, segmentEndMs);

  return {
    startTimeMs: String(segmentStartMs),
    words,
    wordTimings,
  };
}

export function applyKaraokeInterludeEllipsis({
  visibleLines,
  allLines,
  alignment,
  currentIndex,
  currentTimeMs,
  enabled,
}: {
  visibleLines: LyricLine[];
  allLines: LyricLine[];
  alignment: LyricsAlignment;
  currentIndex: number;
  currentTimeMs?: number;
  enabled?: boolean;
}): VisibleLyricLine[] {
  if (!visibleLines.length || !enabled || currentTimeMs === undefined) {
    return visibleLines;
  }

  if (currentIndex < 0) {
    if (!hasLongIntro(allLines, currentTimeMs)) {
      return visibleLines;
    }

    // Single-line (center) mode: no lead-in intro dots before the first lyric
    if (alignment === LyricsAlignment.Center) {
      return visibleLines;
    }

    const first = allLines[0];
    if (!first) {
      return visibleLines;
    }
    const { segmentStartMs } = buildCountdownSegment(0, getLineStartMs(first));

    const firstLine = visibleLines[0] ?? allLines[0];

    // Alternating: dots render inline with the first lyric (see LyricsDisplay); no placeholder row,
    // but keep the same visible line count as normal alternating (e.g. first + next) so layout
    // does not collapse to one row or jump when the lead-in ends.
    if (alignment === LyricsAlignment.Alternating) {
      return visibleLines.length ? visibleLines : firstLine ? [firstLine] : visibleLines;
    }

    const placeholder = createInterludePlaceholder(
      `intro-${allLines[0]?.startTimeMs ?? "start"}`,
      0,
      segmentStartMs
    );

    return firstLine ? [placeholder, firstLine] : [placeholder];
  }

  const currentLine = allLines[currentIndex];
  const nextLine = allLines[currentIndex + 1];
  if (!currentLine || !nextLine || !hasLongInterlude(currentLine, nextLine, currentTimeMs)) {
    return visibleLines;
  }

  const fullStartMs = getLineEndMs(currentLine) + INTERLUDE_PLACEHOLDER_DELAY_MS;
  const fullEndMs = getLineStartMs(nextLine);
  const { segmentStartMs } = buildCountdownSegment(fullStartMs, fullEndMs);

  const placeholder = createInterludePlaceholder(
    `gap-${nextLine.startTimeMs}`,
    currentIndex,
    segmentStartMs,
    alignment === LyricsAlignment.Alternating ? { dotsInlineWithNext: true } : undefined
  );

  if (alignment === LyricsAlignment.Center) {
    return [placeholder];
  }

  if (alignment === LyricsAlignment.Alternating) {
    const decoratedNext = decorateLyricLineWithInterludeLead(
      nextLine,
      currentIndex + 1,
      placeholder
    );
    const followingLine = allLines[currentIndex + 2];

    return currentIndex % 2 === 0
      ? [followingLine, decoratedNext].filter(Boolean)
      : [decoratedNext, followingLine].filter(Boolean);
  }

  return visibleLines.map((line) => (line === currentLine ? placeholder : line));
}

/**
 * Long intro + alternating layout: timed dots are drawn inline with the first lyric; use this to
 * build synthetic timings and fade state (no placeholder row in `applyKaraokeInterludeEllipsis`).
 */
export function getIntroInterludeInlineLead(
  allLines: LyricLine[],
  currentTimeMs: number | undefined,
  enabled: boolean
): InterludePlaceholderLine | null {
  if (!enabled || currentTimeMs === undefined || !allLines.length) {
    return null;
  }
  if (!hasLongIntro(allLines, currentTimeMs)) {
    return null;
  }
  const first = allLines[0];
  if (!first) {
    return null;
  }
  const { segmentStartMs } = buildCountdownSegment(0, getLineStartMs(first));
  return createInterludePlaceholder(
    `intro-${first.startTimeMs ?? "start"}`,
    0,
    segmentStartMs,
    { dotsInlineWithNext: true }
  );
}
