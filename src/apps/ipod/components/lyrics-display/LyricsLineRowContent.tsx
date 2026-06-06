import { motion, AnimatePresence } from "motion/react";
import { useMemo, useReducer, useEffect } from "react";
import { getInterludeDotsFadeOpacity } from "@/utils/karaokeInterludeDisplay";
import type { LyricsLineRowContentProps } from "./types";
import {
  BASE_SHADOW,
  GRADIENT_GLOW_FILTER,
  OLD_SCHOOL_BASE_COLOR,
  OLD_SCHOOL_BASE_STROKE,
  OLD_SCHOOL_HIGHLIGHT_STROKE,
} from "./constants";
import { StaticWordRendering } from "./StaticWordRendering";
import { WordTimingHighlight } from "./WordTimingHighlight";

export function interludeStackItemsClass(textAlign: string): string {
  if (textAlign === "right" || textAlign === "end") return "items-end";
  if (textAlign === "center") return "items-center";
  return "items-start";
}

export function LyricsLineRowContent({
  line,
  isCurrent,
  isInterludePlaceholder = false,
  hasWordTimings,
  timeMsForRow,
  translatedText,
  textSizeClass,
  lineHeightClass,
  fontClassName,
  onSeekToTime,
  romanization,
  furiganaMap,
  soramimiMap,
  renderWithFurigana,
  processText,
  showKoreanRomanization,
  isOldSchoolKaraoke,
  isGradientStyle,
  isColoredGlow,
  highlightColor,
  baseColor,
  glowFilter,
  glowShadowHighlight,
  interludeMeta,
  interludePlaceholderDotsInlineOnlyGhost = false,
  interludeInlineDotsLine,
  timeMsForInterludeDots,
  interludeInlineCountdownStartMs,
  lineTextAlign = "center",
}: LyricsLineRowContentProps) {
  const processedOriginal = useMemo(
    () => processText(line.words),
    [line.words, processText]
  );
  const processedTranslation = useMemo(() => {
    if (!translatedText) return null;
    return processText(translatedText);
  }, [translatedText, processText]);

  const isFullscreenSize =
    textSizeClass.includes("vw") ||
    textSizeClass.includes("vh") ||
    textSizeClass.includes("fullscreen-lyrics-text");
  const isKaraokeSize = textSizeClass.includes("karaoke-lyrics-text");
  const translationSizeClass = isFullscreenSize
    ? "lyrics-translation-fullscreen"
    : isKaraokeSize
      ? "lyrics-translation-karaoke"
      : "lyrics-translation-ipod";

  const shouldUseAnimatedWordTiming =
    hasWordTimings && isCurrent && timeMsForRow !== undefined;

  const interludeDotsOpacity = useMemo(() => {
    if (!interludeMeta) return 1;
    const t = timeMsForRow ?? 0;
    return getInterludeDotsFadeOpacity(t, interludeMeta.countdownStartMs);
  }, [interludeMeta, timeMsForRow]);

  const interludeInlineDotsOpacity = useMemo(() => {
    if (interludeInlineCountdownStartMs === undefined || timeMsForInterludeDots === undefined) {
      return 1;
    }
    return getInterludeDotsFadeOpacity(timeMsForInterludeDots, interludeInlineCountdownStartMs);
  }, [interludeInlineCountdownStartMs, timeMsForInterludeDots]);

  const dotsActive = !!(
    interludeInlineDotsLine &&
    timeMsForInterludeDots !== undefined &&
    interludeInlineCountdownStartMs !== undefined
  );
  const [dotsState, dispatchDotsState] = useReducer(
    (state: { dotsExitDone: boolean }, action: { type: "setDotsExitDone"; value: boolean }) => {
      if (action.type === "setDotsExitDone") {
        return { dotsExitDone: action.value };
      }
      return state;
    },
    { dotsExitDone: true }
  );
  const dotsExitDone = dotsState.dotsExitDone;
  useEffect(() => {
    if (dotsActive && dotsExitDone) {
      dispatchDotsState({ type: "setDotsExitDone", value: false });
    }
  }, [dotsActive, dotsExitDone]);

  return (
    <>
      {(() => {
        const soramimiSegments =
          romanization.enabled && romanization.soramimi
            ? soramimiMap.get(line.startTimeMs)
            : undefined;
        const annotationSegments =
          soramimiSegments ??
          (romanization.enabled && romanization.japaneseFurigana
            ? furiganaMap.get(line.startTimeMs)
            : undefined);

        const inlineDotsSoramimi =
          interludeInlineDotsLine &&
          romanization.enabled &&
          romanization.soramimi
            ? soramimiMap.get(interludeInlineDotsLine.startTimeMs)
            : undefined;
        const inlineDotsAnnotations =
          inlineDotsSoramimi ??
          (interludeInlineDotsLine &&
          romanization.enabled &&
          romanization.japaneseFurigana
            ? furiganaMap.get(interludeInlineDotsLine.startTimeMs)
            : undefined);

        const lyricBody = (
          <div
            className={`${textSizeClass} ${fontClassName} ${lineHeightClass} ${
              onSeekToTime && !hasWordTimings && !isInterludePlaceholder
                ? "cursor-pointer lyrics-line-clickable"
                : ""
            }`}
            style={
              isOldSchoolKaraoke && !hasWordTimings
                ? ({
                    color: isCurrent ? highlightColor : OLD_SCHOOL_BASE_COLOR,
                    WebkitTextStroke: isCurrent
                      ? OLD_SCHOOL_HIGHLIGHT_STROKE
                      : OLD_SCHOOL_BASE_STROKE,
                    paintOrder: "stroke fill",
                  } as React.CSSProperties)
                : isGradientStyle && !hasWordTimings
                  ? ({
                      color: isCurrent ? highlightColor : baseColor ?? undefined,
                      textShadow: isCurrent ? glowShadowHighlight : BASE_SHADOW,
                      filter:
                        isCurrent && timeMsForRow !== undefined
                          ? `${GRADIENT_GLOW_FILTER} hue-rotate(${(timeMsForRow / 6000) * 360 % 360}deg)`
                          : undefined,
                    } as React.CSSProperties)
                  : isColoredGlow && !hasWordTimings
                    ? ({
                        color: isCurrent ? highlightColor : baseColor,
                        textShadow: isCurrent ? glowShadowHighlight : BASE_SHADOW,
                      } as React.CSSProperties)
                    : undefined
            }
            onClick={
              onSeekToTime && !hasWordTimings && !isInterludePlaceholder
                ? (e) => {
                    e.stopPropagation();
                    onSeekToTime(parseInt(line.startTimeMs, 10));
                  }
                : undefined
            }
          >
            {interludePlaceholderDotsInlineOnlyGhost && isInterludePlaceholder ? (
              <>
                {interludeMeta?.anchorLine &&
                  (() => {
                    const anchorLine = interludeMeta.anchorLine;
                    const anchorSoramimi =
                      romanization.enabled && romanization.soramimi
                        ? soramimiMap.get(anchorLine.startTimeMs)
                        : undefined;
                    const anchorAnnotations =
                      anchorSoramimi ??
                      (romanization.enabled && romanization.japaneseFurigana
                        ? furiganaMap.get(anchorLine.startTimeMs)
                        : undefined);
                    return (
                      <div className="karaoke-interlude-anchor-ghost mb-1 opacity-[0.5]">
                        {anchorLine.wordTimings?.length ? (
                          <StaticWordRendering
                            wordTimings={anchorLine.wordTimings}
                            processText={processText}
                            furiganaSegments={anchorAnnotations}
                            koreanRomanized={!anchorSoramimi && showKoreanRomanization}
                            japaneseRomaji={
                              !anchorSoramimi &&
                              romanization.enabled &&
                              romanization.japaneseRomaji
                            }
                            chinesePinyin={
                              !anchorSoramimi && romanization.enabled && romanization.chinese
                            }
                            pronunciationOnly={
                              romanization.enabled && romanization.pronunciationOnly
                            }
                            soramimiTargetLanguage={
                              anchorSoramimi ? romanization.soramamiTargetLanguage : undefined
                            }
                            lineStartTimeMs={parseInt(anchorLine.startTimeMs, 10)}
                            onSeekToTime={undefined}
                            isOldSchoolKaraoke={isOldSchoolKaraoke}
                            baseColor={baseColor}
                          />
                        ) : (
                          renderWithFurigana(anchorLine, processText(anchorLine.words))
                        )}
                      </div>
                    );
                  })()}
              </>
            ) : shouldUseAnimatedWordTiming ? (
              isInterludePlaceholder ? (
                <>
                  {interludeMeta?.anchorLine &&
                    (() => {
                      const anchorLine = interludeMeta.anchorLine;
                      const anchorSoramimi =
                        romanization.enabled && romanization.soramimi
                          ? soramimiMap.get(anchorLine.startTimeMs)
                          : undefined;
                      const anchorAnnotations =
                        anchorSoramimi ??
                        (romanization.enabled && romanization.japaneseFurigana
                          ? furiganaMap.get(anchorLine.startTimeMs)
                          : undefined);
                      return (
                        <div className="karaoke-interlude-anchor-ghost mb-1 opacity-[0.5]">
                          {anchorLine.wordTimings?.length ? (
                            <StaticWordRendering
                              wordTimings={anchorLine.wordTimings}
                              processText={processText}
                              furiganaSegments={anchorAnnotations}
                              koreanRomanized={!anchorSoramimi && showKoreanRomanization}
                              japaneseRomaji={
                                !anchorSoramimi &&
                                romanization.enabled &&
                                romanization.japaneseRomaji
                              }
                              chinesePinyin={
                                !anchorSoramimi && romanization.enabled && romanization.chinese
                              }
                              pronunciationOnly={
                                romanization.enabled && romanization.pronunciationOnly
                              }
                              soramimiTargetLanguage={
                                anchorSoramimi ? romanization.soramamiTargetLanguage : undefined
                              }
                              lineStartTimeMs={parseInt(anchorLine.startTimeMs, 10)}
                              onSeekToTime={undefined}
                              isOldSchoolKaraoke={isOldSchoolKaraoke}
                              baseColor={baseColor}
                            />
                          ) : (
                            renderWithFurigana(anchorLine, processText(anchorLine.words))
                          )}
                        </div>
                      );
                    })()}
                  <div
                    className="karaoke-interlude-circle-dots"
                    style={{
                      opacity: interludeDotsOpacity,
                      transition: "opacity 0.12s linear",
                    }}
                  >
                    <WordTimingHighlight
                      wordTimings={line.wordTimings!}
                      lineStartTimeMs={parseInt(line.startTimeMs, 10)}
                      currentTimeMs={timeMsForRow!}
                      processText={processText}
                      furiganaSegments={annotationSegments}
                      koreanRomanized={!soramimiSegments && showKoreanRomanization}
                      japaneseRomaji={
                        !soramimiSegments && romanization.enabled && romanization.japaneseRomaji
                      }
                      chinesePinyin={!soramimiSegments && romanization.enabled && romanization.chinese}
                      pronunciationOnly={romanization.enabled && romanization.pronunciationOnly}
                      soramimiTargetLanguage={
                        soramimiSegments ? romanization.soramamiTargetLanguage : undefined
                      }
                      onSeekToTime={undefined}
                      isOldSchoolKaraoke={isOldSchoolKaraoke}
                      highlightColor={highlightColor}
                      glowFilter={glowFilter}
                      baseColor={baseColor}
                      isGradient={isGradientStyle}
                      rainbowHue={
                        isGradientStyle && timeMsForRow !== undefined
                          ? ((timeMsForRow / 6000) * 360) % 360
                          : undefined
                      }
                    />
                  </div>
                </>
              ) : (
                <WordTimingHighlight
                  wordTimings={line.wordTimings!}
                  lineStartTimeMs={parseInt(line.startTimeMs, 10)}
                  currentTimeMs={timeMsForRow!}
                  processText={processText}
                  furiganaSegments={annotationSegments}
                  koreanRomanized={!soramimiSegments && showKoreanRomanization}
                  japaneseRomaji={
                    !soramimiSegments && romanization.enabled && romanization.japaneseRomaji
                  }
                  chinesePinyin={!soramimiSegments && romanization.enabled && romanization.chinese}
                  pronunciationOnly={romanization.enabled && romanization.pronunciationOnly}
                  soramimiTargetLanguage={
                    soramimiSegments ? romanization.soramamiTargetLanguage : undefined
                  }
                  onSeekToTime={onSeekToTime}
                  isOldSchoolKaraoke={isOldSchoolKaraoke}
                  highlightColor={highlightColor}
                  glowFilter={glowFilter}
                  baseColor={baseColor}
                  isGradient={isGradientStyle}
                  rainbowHue={
                    isGradientStyle && timeMsForRow !== undefined
                      ? ((timeMsForRow / 6000) * 360) % 360
                      : undefined
                  }
                />
              )
            ) : hasWordTimings ? (
              isInterludePlaceholder ? (
                <>
                  {interludeMeta?.anchorLine &&
                    (() => {
                      const anchorLine = interludeMeta.anchorLine;
                      const anchorSoramimi =
                        romanization.enabled && romanization.soramimi
                          ? soramimiMap.get(anchorLine.startTimeMs)
                          : undefined;
                      const anchorAnnotations =
                        anchorSoramimi ??
                        (romanization.enabled && romanization.japaneseFurigana
                          ? furiganaMap.get(anchorLine.startTimeMs)
                          : undefined);
                      return (
                        <div className="karaoke-interlude-anchor-ghost mb-1 opacity-[0.5]">
                          {anchorLine.wordTimings?.length ? (
                            <StaticWordRendering
                              wordTimings={anchorLine.wordTimings}
                              processText={processText}
                              furiganaSegments={anchorAnnotations}
                              koreanRomanized={!anchorSoramimi && showKoreanRomanization}
                              japaneseRomaji={
                                !anchorSoramimi &&
                                romanization.enabled &&
                                romanization.japaneseRomaji
                              }
                              chinesePinyin={
                                !anchorSoramimi && romanization.enabled && romanization.chinese
                              }
                              pronunciationOnly={
                                romanization.enabled && romanization.pronunciationOnly
                              }
                              soramimiTargetLanguage={
                                anchorSoramimi ? romanization.soramamiTargetLanguage : undefined
                              }
                              lineStartTimeMs={parseInt(anchorLine.startTimeMs, 10)}
                              onSeekToTime={undefined}
                              isOldSchoolKaraoke={isOldSchoolKaraoke}
                              baseColor={baseColor}
                            />
                          ) : (
                            renderWithFurigana(anchorLine, processText(anchorLine.words))
                          )}
                        </div>
                      );
                    })()}
                  <div
                    className="karaoke-interlude-circle-dots"
                    style={{
                      opacity: interludeDotsOpacity,
                      transition: "opacity 0.12s linear",
                    }}
                  >
                    <StaticWordRendering
                      wordTimings={line.wordTimings!}
                      processText={processText}
                      furiganaSegments={annotationSegments}
                      koreanRomanized={!soramimiSegments && showKoreanRomanization}
                      japaneseRomaji={
                        !soramimiSegments && romanization.enabled && romanization.japaneseRomaji
                      }
                      chinesePinyin={!soramimiSegments && romanization.enabled && romanization.chinese}
                      pronunciationOnly={romanization.enabled && romanization.pronunciationOnly}
                      soramimiTargetLanguage={
                        soramimiSegments ? romanization.soramamiTargetLanguage : undefined
                      }
                      lineStartTimeMs={parseInt(line.startTimeMs, 10)}
                      onSeekToTime={undefined}
                      isOldSchoolKaraoke={isOldSchoolKaraoke}
                      baseColor={baseColor}
                    />
                  </div>
                </>
              ) : (
                <StaticWordRendering
                  wordTimings={line.wordTimings!}
                  processText={processText}
                  furiganaSegments={annotationSegments}
                  koreanRomanized={!soramimiSegments && showKoreanRomanization}
                  japaneseRomaji={
                    !soramimiSegments && romanization.enabled && romanization.japaneseRomaji
                  }
                  chinesePinyin={!soramimiSegments && romanization.enabled && romanization.chinese}
                  pronunciationOnly={romanization.enabled && romanization.pronunciationOnly}
                  soramimiTargetLanguage={
                    soramimiSegments ? romanization.soramamiTargetLanguage : undefined
                  }
                  lineStartTimeMs={parseInt(line.startTimeMs, 10)}
                  onSeekToTime={onSeekToTime}
                  isOldSchoolKaraoke={isOldSchoolKaraoke}
                  baseColor={baseColor}
                />
              )
            ) : (
              renderWithFurigana(line, processedOriginal)
            )}
          </div>
        );

        if (dotsActive || !dotsExitDone) {
          const interludeStackKind = isKaraokeSize
            ? "lyrics-interlude-stack--karaoke"
            : isFullscreenSize
              ? "lyrics-interlude-stack--fullscreen"
              : "lyrics-interlude-stack--ipod";
          return (
            <div
              className={`${textSizeClass} ${fontClassName} lyrics-interlude-inline-with-line lyrics-interlude-stack flex w-full max-w-full flex-col gap-y-0 ${interludeStackItemsClass(lineTextAlign)} ${interludeStackKind}`}
            >
              <AnimatePresence
                initial={false}
                onExitComplete={() =>
                  dispatchDotsState({ type: "setDotsExitDone", value: true })
                }
              >
                {dotsActive && (
                  <motion.div
                    key="inline-dots"
                    initial={false}
                    animate={{
                      opacity: interludeInlineDotsOpacity,
                      scale: 1,
                      height: "auto",
                      marginBottom: 0,
                    }}
                    exit={{
                      opacity: 0,
                      scale: 0.88,
                      height: 0,
                      marginBottom: 0,
                    }}
                    transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
                    className="origin-top overflow-hidden"
                  >
                    <span className="karaoke-interlude-circle-dots inline-block">
                      <WordTimingHighlight
                        wordTimings={interludeInlineDotsLine!.wordTimings!}
                        lineStartTimeMs={parseInt(interludeInlineDotsLine!.startTimeMs, 10)}
                        currentTimeMs={timeMsForInterludeDots!}
                        processText={processText}
                        furiganaSegments={inlineDotsAnnotations}
                        koreanRomanized={!inlineDotsSoramimi && showKoreanRomanization}
                        japaneseRomaji={
                          !inlineDotsSoramimi && romanization.enabled && romanization.japaneseRomaji
                        }
                        chinesePinyin={
                          !inlineDotsSoramimi && romanization.enabled && romanization.chinese
                        }
                        pronunciationOnly={romanization.enabled && romanization.pronunciationOnly}
                        soramimiTargetLanguage={
                          inlineDotsSoramimi ? romanization.soramamiTargetLanguage : undefined
                        }
                        onSeekToTime={undefined}
                        isOldSchoolKaraoke={isOldSchoolKaraoke}
                        highlightColor={highlightColor}
                        glowFilter={glowFilter}
                        baseColor={baseColor}
                        isGradient={isGradientStyle}
                        rainbowHue={
                          isGradientStyle
                            ? ((timeMsForInterludeDots! / 6000) * 360) % 360
                            : undefined
                        }
                      />
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
              {lyricBody}
            </div>
          );
        }

        return lyricBody;
      })()}
      {processedTranslation &&
        processedTranslation !== processedOriginal && (
          <div
            className={`text-white ${fontClassName} ${translationSizeClass}`}
            style={{
              lineHeight: 1.1,
              opacity: 0.55,
            }}
          >
            {processedTranslation}
          </div>
        )}
    </>
  );
}
