import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { LyricsAlignment } from "@/types/lyrics";
import type { LyricLine } from "@/types/lyrics";
import {
  applyKaraokeInterludeEllipsis,
  didAdvancePastLongInterlude,
  getGapInterludeInlineLead,
  getIntroInterludeInlineLead,
} from "@/utils/karaokeInterludeDisplay";
import {
  computeAlternatingVisibleLines,
} from "./lyricsAlignmentUtils";

function sameLineIds(left: LyricLine[], right: LyricLine[]): boolean {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i++) {
    if (left[i]?.startTimeMs !== right[i]?.startTimeMs) return false;
  }
  return true;
}

export function useLyricsVisibleLines({
  alignment,
  displayOriginalLines,
  actualCurrentLine,
  visible,
  currentTimeMs,
  showInterludeEllipsis,
}: {
  alignment: LyricsAlignment;
  displayOriginalLines: LyricLine[];
  actualCurrentLine: number;
  visible: boolean;
  currentTimeMs: number | undefined;
  showInterludeEllipsis: boolean;
}) {
  const [altLines, setAltLines] = useState<LyricLine[]>(() =>
    computeAlternatingVisibleLines(displayOriginalLines, actualCurrentLine)
  );

  const prevLinesRef = useRef<LyricLine[]>(displayOriginalLines);
  const prevCurrentLineRef = useRef(actualCurrentLine);

  // Swap alternating rows during render when playback steps out of a long gap.
  // A layout effect runs too late if this render also restarts for the presence
  // remount: that commit would paint the pre-gap pair, then AnimatePresence
  // would keep the finished lyric mounted for its exit.
  if (
    alignment === LyricsAlignment.Alternating &&
    didAdvancePastLongInterlude(
      displayOriginalLines,
      prevCurrentLineRef.current,
      actualCurrentLine
    )
  ) {
    const nextAltLines = computeAlternatingVisibleLines(
      displayOriginalLines,
      actualCurrentLine
    );
    if (!sameLineIds(nextAltLines, altLines)) {
      setAltLines(nextAltLines);
    }
  }

  // Layout effect so the row swap lands before paint. A passive effect would
  // paint one frame of the pre-gap pair (finished lyric back in the second slot)
  // after delay dots end.
  useLayoutEffect(() => {
    const previousIndex = prevCurrentLineRef.current;
    prevCurrentLineRef.current = actualCurrentLine;

    if (alignment !== LyricsAlignment.Alternating) return;

    const linesChanged = prevLinesRef.current !== displayOriginalLines;
    prevLinesRef.current = displayOriginalLines;

    const exitedLongInterlude =
      !linesChanged &&
      didAdvancePastLongInterlude(
        displayOriginalLines,
        previousIndex,
        actualCurrentLine
      );

    if (linesChanged || actualCurrentLine < 0 || !visible || exitedLongInterlude) {
      setAltLines(
        computeAlternatingVisibleLines(displayOriginalLines, actualCurrentLine)
      );
      return;
    }

    const clampedIdx = Math.min(
      Math.max(0, actualCurrentLine),
      displayOriginalLines.length - 1
    );
    const currentStart =
      clampedIdx >= 0 && displayOriginalLines[clampedIdx]
        ? parseInt(displayOriginalLines[clampedIdx].startTimeMs)
        : null;
    const nextStart =
      clampedIdx + 1 < displayOriginalLines.length &&
      displayOriginalLines[clampedIdx + 1]
        ? parseInt(displayOriginalLines[clampedIdx + 1].startTimeMs)
        : null;

    const rawDuration =
      currentStart !== null && nextStart !== null
        ? nextStart - currentStart
        : 0;

    const delayMs = Math.min(400, Math.max(20, Math.floor(rawDuration * 0.2)));

    const timer = setTimeout(() => {
      setAltLines(
        computeAlternatingVisibleLines(displayOriginalLines, actualCurrentLine)
      );
    }, delayMs);

    return () => clearTimeout(timer);
  }, [alignment, displayOriginalLines, actualCurrentLine, visible]);

  const nonAltVisibleLines = useMemo(() => {
    if (!displayOriginalLines.length) return [] as LyricLine[];

    if (actualCurrentLine < 0) {
      return displayOriginalLines.slice(0, 1).filter(Boolean) as LyricLine[];
    }

    if (alignment === LyricsAlignment.Center) {
      const clampedCurrentLine = Math.min(
        Math.max(0, actualCurrentLine),
        displayOriginalLines.length - 1
      );
      const currentActualLine = displayOriginalLines[clampedCurrentLine];
      return currentActualLine ? [currentActualLine] : [];
    }

    // Focus three normally keeps the finished line in the previous slot. After a
    // long gap that line was already dropped for the delay dots; putting it back
    // the moment the next line starts flashes it under the new lyric.
    const omitCompletedLine =
      alignment === LyricsAlignment.FocusThree &&
      showInterludeEllipsis &&
      didAdvancePastLongInterlude(
        displayOriginalLines,
        actualCurrentLine - 1,
        actualCurrentLine
      );
    const start = omitCompletedLine
      ? actualCurrentLine
      : Math.max(0, actualCurrentLine - 1);
    const end = omitCompletedLine ? actualCurrentLine + 3 : actualCurrentLine + 2;
    return displayOriginalLines.slice(start, end);
  }, [displayOriginalLines, actualCurrentLine, alignment, showInterludeEllipsis]);

  const visibleLines = useMemo(
    () =>
      applyKaraokeInterludeEllipsis({
        visibleLines:
          alignment === LyricsAlignment.Alternating
            ? altLines
            : nonAltVisibleLines,
        allLines: displayOriginalLines,
        alignment,
        currentIndex: actualCurrentLine,
        currentTimeMs,
        enabled: showInterludeEllipsis,
      }),
    [
      alignment,
      altLines,
      nonAltVisibleLines,
      displayOriginalLines,
      actualCurrentLine,
      currentTimeMs,
      showInterludeEllipsis,
    ]
  );

  const introInterludeLead = useMemo(
    () =>
      alignment === LyricsAlignment.Alternating &&
      showInterludeEllipsis &&
      actualCurrentLine < 0
        ? getIntroInterludeInlineLead(
            displayOriginalLines,
            currentTimeMs,
            showInterludeEllipsis
          )
        : null,
    [
      alignment,
      showInterludeEllipsis,
      actualCurrentLine,
      displayOriginalLines,
      currentTimeMs,
    ]
  );

  const gapInterludeLead = useMemo(
    () =>
      alignment === LyricsAlignment.Alternating &&
      showInterludeEllipsis &&
      actualCurrentLine >= 0
        ? getGapInterludeInlineLead(
            displayOriginalLines,
            actualCurrentLine,
            currentTimeMs,
            showInterludeEllipsis
          )
        : null,
    [
      alignment,
      showInterludeEllipsis,
      actualCurrentLine,
      displayOriginalLines,
      currentTimeMs,
    ]
  );

  const currentAnchorIdx =
    actualCurrentLine >= 0 && actualCurrentLine < displayOriginalLines.length
      ? actualCurrentLine
      : -1;

  return {
    visibleLines,
    introInterludeLead,
    gapInterludeLead,
    currentAnchorIdx,
  };
}
