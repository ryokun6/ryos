import { useLayoutEffect, useRef, useState } from "react";

import { LyricsAlignment, type LyricLine } from "@/types/lyrics";
import { didAdvancePastLongInterlude } from "@/utils/karaokeInterludeDisplay";

export function computeAlternatingVisibleLines(
  allLines: LyricLine[],
  currentLineIndex: number
): LyricLine[] {
  if (!allLines.length) return [];

  if (currentLineIndex < 0) {
    return allLines.slice(0, 2).filter(Boolean);
  }

  const clampedIndex = Math.min(currentLineIndex, allLines.length - 1);
  const nextLine = allLines[clampedIndex + 1];

  return clampedIndex % 2 === 0
    ? [allLines[clampedIndex], nextLine].filter(Boolean)
    : [nextLine, allLines[clampedIndex]].filter(Boolean);
}

function getAlternatingLineTransitionDelayMs(
  allLines: LyricLine[],
  currentLineIndex: number
): number {
  const clampedIndex = Math.min(Math.max(0, currentLineIndex), allLines.length - 1);
  const currentStart =
    clampedIndex >= 0 && allLines[clampedIndex]
      ? parseInt(allLines[clampedIndex].startTimeMs, 10)
      : null;
  const nextStart =
    clampedIndex + 1 < allLines.length && allLines[clampedIndex + 1]
      ? parseInt(allLines[clampedIndex + 1].startTimeMs, 10)
      : null;

  const rawDuration = currentStart !== null && nextStart !== null ? nextStart - currentStart : 0;

  // Use 20% of the line duration; clamp to 20-400ms range to avoid extremes
  // (prevents 6+ second delays on long instrumental breaks)
  return Math.min(400, Math.max(20, Math.floor(rawDuration * 0.2)));
}

export function useAlternatingVisibleLines({
  allLines,
  alignment,
  actualCurrentLine,
}: {
  allLines: LyricLine[];
  alignment: LyricsAlignment;
  actualCurrentLine: number;
}): LyricLine[] {
  const [visibleLines, setVisibleLines] = useState<LyricLine[]>(() =>
    computeAlternatingVisibleLines(allLines, actualCurrentLine)
  );
  const previousLinesRef = useRef(allLines);
  const previousCurrentLineRef = useRef(actualCurrentLine);
  const previousAlignmentRef = useRef(alignment);

  useLayoutEffect(() => {
    const alignmentChanged = previousAlignmentRef.current !== alignment;
    previousAlignmentRef.current = alignment;

    if (alignment !== LyricsAlignment.Alternating) {
      previousLinesRef.current = allLines;
      previousCurrentLineRef.current = actualCurrentLine;
      return;
    }

    const linesChanged = previousLinesRef.current !== allLines;
    const previousCurrentLineIndex = previousCurrentLineRef.current;
    previousLinesRef.current = allLines;
    previousCurrentLineRef.current = actualCurrentLine;

    const nextVisibleLines = computeAlternatingVisibleLines(allLines, actualCurrentLine);
    const exitedLongInterlude =
      !linesChanged &&
      didAdvancePastLongInterlude(allLines, previousCurrentLineIndex, actualCurrentLine);

    if (alignmentChanged || linesChanged || actualCurrentLine < 0 || exitedLongInterlude) {
      setVisibleLines(nextVisibleLines);
      return;
    }

    const timer = setTimeout(() => {
      setVisibleLines(nextVisibleLines);
    }, getAlternatingLineTransitionDelayMs(allLines, actualCurrentLine));

    return () => clearTimeout(timer);
  }, [alignment, allLines, actualCurrentLine]);

  return visibleLines;
}
