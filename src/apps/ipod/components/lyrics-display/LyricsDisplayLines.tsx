import type { CSSProperties, ReactNode } from "react";
import { motion, AnimatePresence } from "motion/react";
import { LyricsAlignment } from "@/types/lyrics";
import type { LyricLine } from "@/types/lyrics";
import {
  buildInterludeLyricLineWithWordTimings,
  isInterludePlaceholderLine,
  type InterludePlaceholderLine,
} from "@/utils/karaokeInterludeDisplay";
import { isIosWebKit } from "@/utils/device";
import {
  getSafeAnimatePresenceMode,
  getSafeLayoutProp,
  sanitizeMotionVariantMap,
  sanitizeMotionVisuals,
  shouldUseStaticLyricsRenderer,
} from "@/utils/motionSafe";
import { ANIMATION_CONFIG } from "./constants";
import { getVariants } from "./animationVariants";
import { getLyricsTextAlign } from "./lyricsAlignmentUtils";
import { LyricsLineRowContent } from "./LyricsLineRowContent";
import type { LyricsDisplayViewModel } from "./useLyricsDisplayController";

type LyricsDisplayLinesProps = {
  vm: LyricsDisplayViewModel;
};

const LINE_CLASS =
  "px-2 md:px-4 whitespace-pre-wrap break-words max-w-full text-white";

function lineWrapperStyle(
  lineTextAlign: string,
  interactive: boolean,
  hasAlternatingLeftInset: boolean,
  hasAlternatingRightInset: boolean,
): CSSProperties {
  return {
    textAlign: lineTextAlign as CanvasTextAlign,
    width: "100%",
    pointerEvents: interactive ? "auto" : "none",
    paddingLeft: hasAlternatingLeftInset ? "5%" : undefined,
    paddingRight: hasAlternatingRightInset ? "5%" : undefined,
    backfaceVisibility: "hidden",
    transform: "translateZ(0)",
  };
}

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

  // Karaoke (and the desktop lyrics wallpaper) mount this immediately.
  // Motion 13 WAAPI can still throw on iOS WebKit after sanitizing visuals, so
  // iPhone/iPad (including CriOS) render static lyric rows with no Motion.
  const isIosWebKitDevice = isIosWebKit();
  const useStaticLyrics = shouldUseStaticLyricsRenderer(isIosWebKitDevice);
  const presenceMode = getSafeAnimatePresenceMode(
    "popLayout",
    isIosWebKitDevice,
  );
  const layoutProp = getSafeLayoutProp("position", isIosWebKitDevice);

  const rows = visibleLines.map((line, index) => {
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

    const hasAlternatingLeftInset =
      alignment === LyricsAlignment.Alternating &&
      index === 0 &&
      visibleLines.length > 1;
    const hasAlternatingRightInset =
      alignment === LyricsAlignment.Alternating &&
      index === 1 &&
      visibleLines.length > 1;

    const content: ReactNode = (
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
    );

    return {
      key: line.startTimeMs,
      position,
      isCurrent,
      hasWordTimings,
      lineTextAlign,
      hasAlternatingLeftInset,
      hasAlternatingRightInset,
      content,
    };
  });

  if (useStaticLyrics) {
    return (
      <>
        {rows.map((row) => (
          <div
            key={row.key}
            className={LINE_CLASS}
            style={lineWrapperStyle(
              row.lineTextAlign,
              interactive,
              row.hasAlternatingLeftInset,
              row.hasAlternatingRightInset,
            )}
          >
            {row.content}
          </div>
        ))}
      </>
    );
  }

  return (
    <AnimatePresence mode={presenceMode}>
      {rows.map((row) => {
        const variants = sanitizeMotionVariantMap(
          getVariants(
            row.position,
            alignment === LyricsAlignment.Alternating,
            row.isCurrent,
            row.hasWordTimings,
            isOldSchoolKaraoke
          ),
          isIosWebKitDevice
        );
        const dynamicTransition = sanitizeMotionVisuals(
          {
            ...ANIMATION_CONFIG.spring,
            opacity: row.hasWordTimings
              ? { duration: 0.15 }
              : ANIMATION_CONFIG.fade,
            textShadow: row.hasWordTimings
              ? { duration: 0.15 }
              : ANIMATION_CONFIG.fade,
            filter: ANIMATION_CONFIG.fade,
            duration: 0.15,
          },
          isIosWebKitDevice
        );

        return (
          <motion.div
            key={row.key}
            layout={layoutProp}
            initial="initial"
            animate="animate"
            exit="exit"
            variants={variants}
            transition={dynamicTransition}
            className={LINE_CLASS}
            style={lineWrapperStyle(
              row.lineTextAlign,
              interactive,
              row.hasAlternatingLeftInset,
              row.hasAlternatingRightInset,
            )}
          >
            {row.content}
          </motion.div>
        );
      })}
    </AnimatePresence>
  );
}
