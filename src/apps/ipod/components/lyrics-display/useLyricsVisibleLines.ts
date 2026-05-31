import { useEffect, useMemo, useRef, useState } from "react";
import { LyricsAlignment } from "@/types/lyrics";
import type { LyricLine } from "@/types/lyrics";
import {
  applyKaraokeInterludeEllipsis,
  getIntroInterludeInlineLead,
} from "@/utils/karaokeInterludeDisplay";
import {
  computeAlternatingVisibleLines,
} from "./lyricsAlignmentUtils";

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

  useEffect(() => {
    if (alignment !== LyricsAlignment.Alternating) return;

    const linesChanged = prevLinesRef.current !== displayOriginalLines;
    prevLinesRef.current = displayOriginalLines;

    if (linesChanged || actualCurrentLine < 0 || !visible) {
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

    return displayOriginalLines.slice(
      Math.max(0, actualCurrentLine - 1),
      actualCurrentLine + 2
    );
  }, [displayOriginalLines, actualCurrentLine, alignment]);

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

  const currentAnchorIdx =
    actualCurrentLine >= 0 && actualCurrentLine < displayOriginalLines.length
      ? actualCurrentLine
      : -1;

  return {
    visibleLines,
    introInterludeLead,
    currentAnchorIdx,
  };
}
