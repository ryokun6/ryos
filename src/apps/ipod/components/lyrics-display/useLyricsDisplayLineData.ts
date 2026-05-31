import { useMemo } from "react";
import { parseLyricTimestamps, findCurrentLineIndex } from "@/utils/lyricsSearch";
import type { LyricsDisplayProps } from "./types";

export function useLyricsDisplayLineData({
  lines,
  originalLines,
  currentLine,
  currentTimeMs,
}: Pick<
  LyricsDisplayProps,
  "lines" | "originalLines" | "currentLine" | "currentTimeMs"
>) {
  const hasTranslation = originalLines && lines !== originalLines;
  const displayOriginalLines = originalLines || lines;

  const parsedTimestamps = useMemo(
    () => parseLyricTimestamps(displayOriginalLines),
    [displayOriginalLines]
  );

  const actualCurrentLine = useMemo(() => {
    if (currentTimeMs === undefined || !displayOriginalLines.length)
      return currentLine;
    return findCurrentLineIndex(parsedTimestamps, currentTimeMs);
  }, [
    currentTimeMs,
    parsedTimestamps,
    displayOriginalLines.length,
    currentLine,
  ]);

  const { translationMap, translationByIndex } = useMemo(() => {
    if (!hasTranslation) {
      return {
        translationMap: new Map<string, string>(),
        translationByIndex: [] as string[],
      };
    }
    const map = new Map<string, string>();
    const byIndex: string[] = [];
    lines.forEach((line) => {
      map.set(line.startTimeMs, line.words);
      byIndex.push(line.words);
    });
    return { translationMap: map, translationByIndex: byIndex };
  }, [hasTranslation, lines]);

  return {
    hasTranslation: !!hasTranslation,
    displayOriginalLines,
    actualCurrentLine,
    translationMap,
    translationByIndex,
  };
}
