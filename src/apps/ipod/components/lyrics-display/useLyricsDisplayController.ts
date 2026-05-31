import { useCallback } from "react";
import type { ReactNode } from "react";
import type { LyricsAlignment, RomanizationSettings } from "@/types/lyrics";
import type { LyricLine } from "@/types/lyrics";
import type {
  InterludePlaceholderLine,
  VisibleLyricLine,
} from "@/utils/karaokeInterludeDisplay";
import type { FuriganaSegment } from "@/utils/romanization";
import {
  EMPTY_FURIGANA_MAP,
  EMPTY_SORAMIMI_MAP,
} from "./constants";
import type { LyricsDisplayProps } from "./types";
import { useLyricsDisplaySettings } from "./useLyricsDisplaySettings";
import { useLyricsDisplayLineData } from "./useLyricsDisplayLineData";
import { useRenderWithFurigana } from "./useRenderWithFurigana";
import { useLyricsDisplayKaraokeStyle } from "./useLyricsDisplayKaraokeStyle";
import { useLyricsVisibleLines } from "./useLyricsVisibleLines";
import { useLyricsDisplayGestures } from "./useLyricsDisplayGestures";

export type LyricsDisplayViewModel = {
  alignment: LyricsAlignment;
  fontClassName: string;
  romanization: RomanizationSettings;
  showKoreanRomanization: boolean;
  hasTranslation: boolean;
  displayOriginalLines: LyricLine[];
  actualCurrentLine: number;
  translationMap: Map<string, string>;
  translationByIndex: string[];
  visibleLines: VisibleLyricLine[];
  introInterludeLead: InterludePlaceholderLine | null;
  currentAnchorIdx: number;
  currentTimeMs: number | undefined;
  isOldSchoolKaraoke: boolean;
  isColoredGlow: boolean;
  isGradientStyle: boolean;
  highlightColor: string;
  baseColorResolved: string | undefined;
  glowFilterStr: string;
  glowShadowHighlight: string;
  furiganaMap: Map<string, FuriganaSegment[]>;
  soramimiMap: Map<string, FuriganaSegment[]>;
  renderWithFurigana: (line: LyricLine, processedText: string) => ReactNode;
  processText: (text: string) => string;
  textSizeClass: string;
  lineHeightClass: string;
  interactive: boolean;
  onSeekToTime?: (timeMs: number) => void;
  gapClass: string;
  bottomPaddingClass: string;
  containerStyle: LyricsDisplayProps["containerStyle"];
  handleWheel: (e: React.WheelEvent<HTMLDivElement>) => void;
  handleTouchStart: (e: React.TouchEvent<HTMLDivElement>) => void;
  handleTouchMove: (e: React.TouchEvent<HTMLDivElement>) => void;
  handleTouchEnd: (e: React.TouchEvent<HTMLDivElement>) => void;
  handleTouchCancel: () => void;
};

export function useLyricsDisplayController(
  props: LyricsDisplayProps
): LyricsDisplayViewModel {
  const {
    lines,
    originalLines,
    currentLine,
    visible = true,
    videoVisible = true,
    alignment: alignmentOverride,
    koreanDisplay: koreanDisplayOverride,
    japaneseFurigana: japaneseFuriganaOverride,
    onAdjustOffset,
    onSwipeUp,
    onSwipeDown,
    textSizeClass = "text-[12px]",
    lineHeightClass = "leading-[1.1]",
    interactive = true,
    bottomPaddingClass = "pb-5",
    gapClass = "gap-2",
    fontClassName: fontClassNameFromProp,
    containerStyle,
    furiganaMap = EMPTY_FURIGANA_MAP as Map<string, FuriganaSegment[]>,
    soramimiMap = EMPTY_SORAMIMI_MAP as Map<string, FuriganaSegment[]>,
    currentTimeMs,
    onSeekToTime,
    coverUrl,
    showInterludeEllipsis = false,
  } = props;

  const { alignment, fontClassName, romanization, showKoreanRomanization } =
    useLyricsDisplaySettings({
      alignment: alignmentOverride,
      koreanDisplay: koreanDisplayOverride,
      japaneseFurigana: japaneseFuriganaOverride,
      fontClassName: fontClassNameFromProp,
    });

  const {
    hasTranslation,
    displayOriginalLines,
    actualCurrentLine,
    translationMap,
    translationByIndex,
  } = useLyricsDisplayLineData({
    lines,
    originalLines,
    currentLine,
    currentTimeMs,
  });

  const renderWithFurigana = useRenderWithFurigana(
    romanization,
    furiganaMap,
    soramimiMap
  );

  const processText = useCallback((text: string) => text, []);

  const karaokeStyle = useLyricsDisplayKaraokeStyle(fontClassName, coverUrl);

  const { visibleLines, introInterludeLead, currentAnchorIdx } =
    useLyricsVisibleLines({
      alignment,
      displayOriginalLines,
      actualCurrentLine,
      visible,
      currentTimeMs,
      showInterludeEllipsis,
    });

  const gestures = useLyricsDisplayGestures({
    interactive,
    videoVisible,
    onAdjustOffset,
    onSwipeUp,
    onSwipeDown,
  });

  return {
    alignment,
    fontClassName,
    romanization,
    showKoreanRomanization,
    hasTranslation,
    displayOriginalLines,
    actualCurrentLine,
    translationMap,
    translationByIndex,
    visibleLines,
    introInterludeLead,
    currentAnchorIdx,
    currentTimeMs,
    furiganaMap,
    soramimiMap,
    renderWithFurigana,
    processText,
    textSizeClass,
    lineHeightClass,
    interactive,
    onSeekToTime,
    gapClass,
    bottomPaddingClass,
    containerStyle,
    ...karaokeStyle,
    ...gestures,
  };
}
