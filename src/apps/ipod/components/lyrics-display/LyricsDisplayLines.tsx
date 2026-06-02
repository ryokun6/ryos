import { motion, AnimatePresence } from "framer-motion";
import { LyricsAlignment } from "@/types/lyrics";
import type { LyricLine } from "@/types/lyrics";
import {
  buildInterludeLyricLineWithWordTimings,
  isInterludePlaceholderLine,
  type InterludePlaceholderLine,
} from "@/utils/karaokeInterludeDisplay";
import { ANIMATION_CONFIG } from "./constants";
import { getVariants } from "./animationVariants";
import { getLyricsTextAlign } from "./lyricsAlignmentUtils";
import { LyricsLineRowContent } from "./LyricsLineRowContent";
import type { LyricsDisplayViewModel } from "./useLyricsDisplayController";

type LyricsDisplayLinesProps = {
  vm: LyricsDisplayViewModel;
};

export function LyricsDisplayLines({ vm }: LyricsDisplayLinesProps) {
  const {
    visibleLines,
    alignment,
    displayOriginalLines,
    actualCurrentLine,
    currentAnchorIdx,
    hasTranslation,
    translationMap,
    translationByIndex,
    introInterludeLead,
    currentTimeMs,
    isOldSchoolKaraoke,
    isGradientStyle,
    textSizeClass,
    lineHeightClass,
    fontClassName,
    interactive,
    onSeekToTime,
    romanization,
    furiganaMap,
    soramimiMap,
    renderWithFurigana,
    processText,
    showKoreanRomanization,
    isColoredGlow,
    highlightColor,
    baseColorResolved,
    glowFilterStr,
    glowShadowHighlight,
  } = vm;

  return (
    <AnimatePresence mode="popLayout">
      {visibleLines.map((line, index) => {
        const isInterludePlaceholder = isInterludePlaceholderLine(line);
        const lineForContent: LyricLine = isInterludePlaceholder
          ? buildInterludeLyricLineWithWordTimings(
              line,
              displayOriginalLines,
              actualCurrentLine
            )
          : line;
        const lineActualIdx = isInterludePlaceholder
          ? line.anchorLineIndex
          : displayOriginalLines.indexOf(line);
        const isCurrent = isInterludePlaceholder
          ? actualCurrentLine < 0
            ? true
            : line.anchorLineIndex === actualCurrentLine
          : line === displayOriginalLines[actualCurrentLine];
        let position = 0;
        if (alignment === LyricsAlignment.Alternating) {
          position = isCurrent ? 0 : 1;
        } else {
          position =
            currentAnchorIdx >= 0 ? lineActualIdx - currentAnchorIdx : 0;
        }
        const hasWordTimings = !!(
          lineForContent.wordTimings && lineForContent.wordTimings.length > 0
        );
        const lineTextAlign = getLyricsTextAlign(
          alignment,
          index,
          visibleLines.length
        );
        const translatedText =
          !isInterludePlaceholder && hasTranslation
            ? translationMap.get(line.startTimeMs) ||
              translationByIndex[lineActualIdx] ||
              null
            : null;
        const timeMsForRow =
          isCurrent &&
          currentTimeMs !== undefined &&
          (hasWordTimings || (isGradientStyle && !hasWordTimings))
            ? currentTimeMs
            : undefined;

        const prevVisible = index > 0 ? visibleLines[index - 1] : undefined;
        const nextVisible =
          index < visibleLines.length - 1 ? visibleLines[index + 1] : undefined;
        const interludeLeadForRow: InterludePlaceholderLine | undefined =
          introInterludeLead &&
          !isInterludePlaceholder &&
          line.startTimeMs === displayOriginalLines[0]?.startTimeMs &&
          actualCurrentLine < 0
            ? introInterludeLead
            : prevVisible &&
                isInterludePlaceholderLine(prevVisible) &&
                prevVisible.dotsInlineWithNext
              ? prevVisible
              : nextVisible &&
                  isInterludePlaceholderLine(nextVisible) &&
                  nextVisible.dotsInlineWithNext
                ? nextVisible
                : undefined;

        const interludeInlineDotsLine =
          interludeLeadForRow && currentTimeMs !== undefined
            ? buildInterludeLyricLineWithWordTimings(
                interludeLeadForRow,
                displayOriginalLines,
                actualCurrentLine
              )
            : undefined;

        const interludePlaceholderDotsInlineOnlyGhost =
          isInterludePlaceholder &&
          isInterludePlaceholderLine(line) &&
          line.dotsInlineWithNext;

        const timeMsForInterludeDots =
          interludeInlineDotsLine !== undefined && currentTimeMs !== undefined
            ? currentTimeMs
            : undefined;

        const variants = getVariants(
          position,
          alignment === LyricsAlignment.Alternating,
          isCurrent,
          hasWordTimings,
          isOldSchoolKaraoke
        );
        const dynamicTransition = {
          ...ANIMATION_CONFIG.spring,
          opacity: hasWordTimings
            ? { duration: 0.15 }
            : ANIMATION_CONFIG.fade,
          textShadow: hasWordTimings
            ? { duration: 0.15 }
            : ANIMATION_CONFIG.fade,
          filter: ANIMATION_CONFIG.fade,
          duration: 0.15,
        };
        const hasAlternatingLeftInset =
          alignment === LyricsAlignment.Alternating &&
          index === 0 &&
          visibleLines.length > 1;
        const hasAlternatingRightInset =
          alignment === LyricsAlignment.Alternating &&
          index === 1 &&
          visibleLines.length > 1;

        return (
          <motion.div
            key={line.startTimeMs}
            layout="position"
            initial="initial"
            animate="animate"
            exit="exit"
            variants={variants}
            transition={dynamicTransition}
            className={`px-2 md:px-4 whitespace-pre-wrap break-words max-w-full text-white`}
            style={{
              textAlign: lineTextAlign as CanvasTextAlign,
              width: "100%",
              pointerEvents: interactive ? "auto" : "none",
              paddingLeft: hasAlternatingLeftInset ? "5%" : undefined,
              paddingRight: hasAlternatingRightInset ? "5%" : undefined,
              backfaceVisibility: "hidden",
              transform: "translateZ(0)",
            }}
          >
            <LyricsLineRowContent
              line={lineForContent}
              isCurrent={isCurrent}
              isInterludePlaceholder={isInterludePlaceholder}
              hasWordTimings={hasWordTimings}
              timeMsForRow={timeMsForRow}
              translatedText={translatedText}
              textSizeClass={textSizeClass}
              lineHeightClass={lineHeightClass}
              fontClassName={fontClassName}
              interactive={interactive}
              onSeekToTime={onSeekToTime}
              romanization={romanization}
              furiganaMap={furiganaMap}
              soramimiMap={soramimiMap}
              renderWithFurigana={renderWithFurigana}
              processText={processText}
              showKoreanRomanization={showKoreanRomanization}
              isOldSchoolKaraoke={isOldSchoolKaraoke}
              isGradientStyle={isGradientStyle}
              isColoredGlow={isColoredGlow}
              highlightColor={highlightColor}
              baseColor={baseColorResolved}
              glowFilter={glowFilterStr}
              glowShadowHighlight={glowShadowHighlight}
              interludeMeta={
                isInterludePlaceholder && isInterludePlaceholderLine(line)
                  ? {
                      countdownStartMs: line.countdownStartMs,
                      anchorLine:
                        actualCurrentLine < 0
                          ? null
                          : displayOriginalLines[line.anchorLineIndex] ?? null,
                    }
                  : undefined
              }
              interludePlaceholderDotsInlineOnlyGhost={
                interludePlaceholderDotsInlineOnlyGhost
              }
              interludeInlineDotsLine={interludeInlineDotsLine}
              timeMsForInterludeDots={timeMsForInterludeDots}
              interludeInlineCountdownStartMs={
                interludeLeadForRow?.countdownStartMs
              }
              lineTextAlign={lineTextAlign}
            />
          </motion.div>
        );
      })}
    </AnimatePresence>
  );
}
