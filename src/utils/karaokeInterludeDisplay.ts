import { LyricsAlignment, type LyricLine } from "@/types/lyrics";

export interface InterludePlaceholderLine {
  startTimeMs: string;
  words: string;
  isInterludePlaceholder: true;
  anchorLineIndex: number;
}

export type VisibleLyricLine = LyricLine | InterludePlaceholderLine;

const INTERLUDE_ELLIPSIS = "\u2022\u2022\u2022";
const MIN_LINE_HOLD_MS = 2500;
const LONG_INTERLUDE_THRESHOLD_MS = 8000;
const INTERLUDE_PLACEHOLDER_DELAY_MS = 2000;

function createInterludePlaceholder(
  id: string,
  anchorLineIndex: number
): InterludePlaceholderLine {
  return {
    startTimeMs: `interlude-${id}`,
    words: INTERLUDE_ELLIPSIS,
    isInterludePlaceholder: true,
    anchorLineIndex,
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
  const currentLineEndMs = getLineEndMs(currentLine);
  const nextLineStartMs = getLineStartMs(nextLine);
  const silentGapMs = nextLineStartMs - currentLineEndMs;

  if (silentGapMs < LONG_INTERLUDE_THRESHOLD_MS) {
    return false;
  }

  return (
    currentTimeMs >= currentLineEndMs + INTERLUDE_PLACEHOLDER_DELAY_MS &&
    currentTimeMs < nextLineStartMs
  );
}

export function isInterludePlaceholderLine(
  line: VisibleLyricLine
): line is InterludePlaceholderLine {
  return "isInterludePlaceholder" in line && line.isInterludePlaceholder === true;
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

    const placeholder = createInterludePlaceholder(
      `intro-${allLines[0]?.startTimeMs ?? "start"}`,
      0
    );

    if (alignment === LyricsAlignment.Center) {
      return [placeholder];
    }

    const firstLine = visibleLines[0] ?? allLines[0];
    return firstLine ? [placeholder, firstLine] : [placeholder];
  }

  const currentLine = allLines[currentIndex];
  const nextLine = allLines[currentIndex + 1];
  if (!currentLine || !nextLine || !hasLongInterlude(currentLine, nextLine, currentTimeMs)) {
    return visibleLines;
  }

  const placeholder = createInterludePlaceholder(
    `gap-${nextLine.startTimeMs}`,
    currentIndex
  );

  if (alignment === LyricsAlignment.Center) {
    return [placeholder];
  }

  return visibleLines.map((line) => (line === currentLine ? placeholder : line));
}
