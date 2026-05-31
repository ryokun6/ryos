import {
  LyricLine,
  LyricsAlignment,
  LyricsFont,
  KoreanDisplay,
  JapaneseFurigana,
  RomanizationSettings,
  getLyricsFontClassName,
} from "@/types/lyrics";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
  useMemo,
  useRef,
  useState,
  useEffect,
  useCallback,
} from "react";
import type { ReactNode } from "react";
import { useIpodStore } from "@/stores/useIpodStore";
import { useCoverPalette } from "@/hooks/useCoverPalette";
import { useShallow } from "zustand/react/shallow";
import { toRomaji } from "wanakana";
import {
  isChineseText,
  hasKanaTextLocal,
  hasKoreanText,
  renderKoreanWithRomanization,
  renderChineseWithPinyin,
  renderKanaWithRomaji,
  getFuriganaSegmentsPronunciationOnly,
  getKoreanPronunciationOnly,
  getChinesePronunciationOnly,
  getKanaPronunciationOnly,
  type FuriganaSegment,
} from "@/utils/romanization";
import { getDisplayReading } from "@/utils/furigana";
import { parseLyricTimestamps, findCurrentLineIndex } from "@/utils/lyricsSearch";
import {
  applyKaraokeInterludeEllipsis,
  buildInterludeLyricLineWithWordTimings,
  getIntroInterludeInlineLead,
  isInterludePlaceholderLine,
} from "@/utils/karaokeInterludeDisplay";
import type { LyricsDisplayProps } from "./types";
import {
  ANIMATION_CONFIG,
  EMPTY_FURIGANA_MAP,
  EMPTY_SORAMIMI_MAP,
  GLOW_FILTER,
  GLOW_SHADOW,
  GRADIENT_COLORS,
  GRADIENT_GLOW_FILTER,
  GRADIENT_GLOW_SHADOW,
  OLD_SCHOOL_HIGHLIGHT_COLOR,
  SERIF_RED_HIGHLIGHT_COLOR,
  getStyleCategory,
} from "./constants";
import { boostGlowColor, makeGlowFromColor, pickPrimaryColor } from "./colorUtils";
import { ErrorState, LoadingState } from "./LoadingErrorStates";
import { getVariants } from "./animationVariants";
import { LyricsLineRowContent } from "./LyricsLineRowContent";

export function LyricsDisplay({
  lines,
  originalLines,
  currentLine,
  isLoading,
  error,
  visible = true,
  videoVisible = true,
  alignment: alignmentOverride,
  koreanDisplay: koreanDisplayOverride,
  japaneseFurigana: japaneseFuriganaOverride,
  onAdjustOffset,
  onSwipeUp,
  onSwipeDown,
  isTranslating = false,
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
}: LyricsDisplayProps) {
  const { t } = useTranslation();

  // Read display settings from store (can be overridden by props)
  const {
    lyricsAlignment: storeAlignment,
    koreanDisplay: storeKoreanDisplay,
    japaneseFurigana: storeJapaneseFurigana,
    romanization: storeRomanization,
    uiVariant: storeUiVariant,
    lyricsFont: storeLyricsFont,
  } = useIpodStore(
    useShallow((s) => ({
      lyricsAlignment: s.lyricsAlignment,
      koreanDisplay: s.koreanDisplay,
      japaneseFurigana: s.japaneseFurigana,
      romanization: s.romanization,
      uiVariant: s.uiVariant,
      lyricsFont: s.lyricsFont,
    }))
  );

  const fontClassName =
    fontClassNameFromProp ??
    (storeUiVariant === "modern"
      ? storeLyricsFont === LyricsFont.SansSerif
        ? "font-ipod-modern-ui font-semibold"
        : getLyricsFontClassName(storeLyricsFont)
      : "font-geneva-12");

  // Use override props if provided, otherwise use store values
  const alignment = alignmentOverride ?? storeAlignment;
  const koreanDisplay = koreanDisplayOverride ?? storeKoreanDisplay;
  const japaneseFurigana = japaneseFuriganaOverride ?? storeJapaneseFurigana;
  
  // Use new romanization settings with fallback to legacy settings
  const romanization: RomanizationSettings = useMemo(() => {
    if (storeRomanization) {
      return storeRomanization;
    }
    // Fallback to legacy settings for backwards compatibility
    return {
      enabled: true,
      japaneseFurigana: japaneseFurigana === JapaneseFurigana.On,
      japaneseRomaji: false,
      korean: koreanDisplay === KoreanDisplay.Romanized,
      chinese: false,
      soramimi: false,
      soramamiTargetLanguage: "zh-TW",
    };
  }, [storeRomanization, japaneseFurigana, koreanDisplay]);

  // Determine if translation is active (showing translated lines alongside original)
  const hasTranslation = originalLines && lines !== originalLines;

  // Always use original lines for display and furigana
  const displayOriginalLines = originalLines || lines;

  // Pre-parse timestamps once for binary search (O(n) once, not on every search)
  const parsedTimestamps = useMemo(
    () => parseLyricTimestamps(displayOriginalLines),
    [displayOriginalLines]
  );

  // Calculate the actual current line index using binary search O(log n)
  // This fixes the bug where currentLine prop (from translated lines) doesn't match displayOriginalLines
  const actualCurrentLine = useMemo(() => {
    if (currentTimeMs === undefined || !displayOriginalLines.length) return currentLine;
    return findCurrentLineIndex(parsedTimestamps, currentTimeMs);
  }, [currentTimeMs, parsedTimestamps, displayOriginalLines.length, currentLine]);

  // Create a map of startTimeMs -> translated text for quick lookup
  // Also create index-based fallback in case timestamps don't match exactly
  const { translationMap, translationByIndex } = useMemo(() => {
    if (!hasTranslation) return { translationMap: new Map<string, string>(), translationByIndex: [] as string[] };
    const map = new Map<string, string>();
    const byIndex: string[] = [];
    lines.forEach((line) => {
      map.set(line.startTimeMs, line.words);
      byIndex.push(line.words);
    });
    return { translationMap: map, translationByIndex: byIndex };
  }, [hasTranslation, lines]);

  // Render function for lyrics with annotations (furigana, soramimi, romanization)
  // All data comes from parent via props - no internal fetching
  const renderWithFurigana = useCallback(
    (line: LyricLine, processedText: string): ReactNode => {
      // Master toggle - if romanization is disabled, return plain text
      if (!romanization.enabled) {
        return processedText;
      }
      
      const keyPrefix = `line-${line.startTimeMs}`;
      const pronunciationOnly = romanization.pronunciationOnly ?? false;
      
      // Soramimi (misheard lyrics) - renders phonetic approximations over original text
      // Chinese soramimi: phonetic Chinese characters, English soramimi: phonetic English
      // This takes priority over all other pronunciation options when enabled
      if (romanization.soramimi) {
        const soramimiSegments = soramimiMap.get(line.startTimeMs);
        if (soramimiSegments && soramimiSegments.length > 0) {
          // Pronunciation-only mode: show only the soramimi readings
          if (pronunciationOnly) {
            // English soramimi should have spaces between words for readability
            // Korean has natural spaces (preserved as segments), Japanese/Chinese may have AI-added spaces
            // Join with spaces and collapse multiple spaces to avoid double-spacing
            if (romanization.soramamiTargetLanguage === "en") {
              const pronunciationText = soramimiSegments
                .map(seg => seg.reading || seg.text)
                .join(" ")
                .replace(/\s+/g, " ")
                .trim();
              return <span key={keyPrefix}>{pronunciationText}</span>;
            }
            // Chinese soramimi: join without spaces (Chinese characters don't need spacing)
            const pronunciationText = soramimiSegments.map(seg => seg.reading || seg.text).join("");
            return <span key={keyPrefix}>{pronunciationText}</span>;
          }
          return (
            <>
              {(() => {
                let segmentOffset = 0;
                return soramimiSegments.map((segment) => {
                  const segmentKey = `soramimi-${segmentOffset}-${segment.text}-${segment.reading ?? ""}`;
                  segmentOffset += Math.max(segment.text.length, 1);
                // If there's a reading (the soramimi phonetic), display as ruby
                if (segment.reading) {
                  return (
                    <ruby key={segmentKey} className="lyrics-furigana lyrics-soramimi">
                      {segment.text}
                      <rp>(</rp>
                      <rt className="lyrics-furigana-rt lyrics-soramimi-rt">{segment.reading}</rt>
                      <rp>)</rp>
                    </ruby>
                  );
                }
                  return <span key={segmentKey}>{segment.text}</span>;
                });
              })()}
            </>
          );
        }
        // If soramimi is enabled but no data yet, show plain text (don't fall through to other methods)
        return processedText;
      }
      
      // If furigana is disabled, try other romanization types
      if (!romanization.japaneseFurigana) {
        // Chinese pinyin
        if (romanization.chinese && isChineseText(processedText)) {
          if (pronunciationOnly) {
            return <span key={keyPrefix}>{getChinesePronunciationOnly(processedText)}</span>;
          }
          return renderChineseWithPinyin(processedText, keyPrefix);
        }
        // Korean romanization
        if (romanization.korean && hasKoreanText(processedText)) {
          if (pronunciationOnly) {
            return <span key={keyPrefix}>{getKoreanPronunciationOnly(processedText)}</span>;
          }
          return renderKoreanWithRomanization(processedText, keyPrefix);
        }
        // Japanese kana to romaji
        if (romanization.japaneseRomaji && hasKanaTextLocal(processedText)) {
          if (pronunciationOnly) {
            return <span key={keyPrefix}>{getKanaPronunciationOnly(processedText)}</span>;
          }
          return renderKanaWithRomaji(processedText, keyPrefix);
        }
        return processedText;
      }

      // Get furigana segments for this line
      const segments = furiganaMap.get(line.startTimeMs);
      if (!segments || segments.length === 0) {
        // No furigana available - try other romanization types
        if (romanization.chinese && isChineseText(processedText)) {
          if (pronunciationOnly) {
            return <span key={keyPrefix}>{getChinesePronunciationOnly(processedText)}</span>;
          }
          return renderChineseWithPinyin(processedText, keyPrefix);
        }
        if (romanization.korean && hasKoreanText(processedText)) {
          if (pronunciationOnly) {
            return <span key={keyPrefix}>{getKoreanPronunciationOnly(processedText)}</span>;
          }
          return renderKoreanWithRomanization(processedText, keyPrefix);
        }
        if (romanization.japaneseRomaji && hasKanaTextLocal(processedText)) {
          if (pronunciationOnly) {
            return <span key={keyPrefix}>{getKanaPronunciationOnly(processedText)}</span>;
          }
          return renderKanaWithRomaji(processedText, keyPrefix);
        }
        return processedText;
      }

      // Pronunciation-only mode: show only the phonetic readings
      if (pronunciationOnly) {
        const options = {
          koreanRomanization: romanization.korean,
          japaneseRomaji: romanization.japaneseRomaji,
          chinesePinyin: romanization.chinese,
        };
        return <span key={keyPrefix}>{getFuriganaSegmentsPronunciationOnly(segments, options)}</span>;
      }

      // Render furigana segments with all romanization options (ruby annotations)
      return (
        <>
          {(() => {
            let segmentOffset = 0;
            return segments.map((segment) => {
              const segmentKey = `furigana-${segmentOffset}-${segment.text}-${segment.reading ?? ""}`;
              segmentOffset += Math.max(segment.text.length, 1);
            // Handle Japanese furigana (hiragana reading over kanji)
            const displayReadingSource = getDisplayReading(segment);
            if (displayReadingSource) {
              const displayReading = romanization.japaneseRomaji 
                ? toRomaji(displayReadingSource)
                : displayReadingSource;
              return (
                <ruby key={segmentKey} className="lyrics-furigana">
                  {segment.text}
                  <rp>(</rp>
                  <rt className="lyrics-furigana-rt">{displayReading}</rt>
                  <rp>)</rp>
                </ruby>
              );
            }
            
            // Korean romanization for mixed content
            if (romanization.korean && hasKoreanText(segment.text)) {
              return renderKoreanWithRomanization(segment.text, `${segmentKey}-kr`);
            }
            
            // Chinese pinyin for mixed content
            if (romanization.chinese && isChineseText(segment.text)) {
              return renderChineseWithPinyin(segment.text, `${segmentKey}-cn`);
            }
            
            // Standalone kana to romaji
            if (romanization.japaneseRomaji && hasKanaTextLocal(segment.text)) {
              return renderKanaWithRomaji(segment.text, `${segmentKey}-jp`);
            }
            
              return <span key={segmentKey}>{segment.text}</span>;
            });
          })()}
        </>
      );
    },
    [romanization, furiganaMap, soramimiMap]
  );

  // Memoize processText to prevent WordTimingHighlight renderItems from recomputing on every parent render
  // Note: Chinese Simplified→Traditional conversion is handled by the API in parseLyricsContent
  // Korean romanization is handled via ruby rendering, not text replacement
  const processText = useCallback(
    (text: string) => text,
    []
  );

  // For word-level timing, we still need to track Korean romanization state
  const showKoreanRomanization = romanization.enabled && romanization.korean;

  // Detect style category and whether to use outline styling. `styleCategory`
  // only depends on `fontClassName`; bundling all derived style values into a
  // single useMemo keeps every per-line render from re-running these tiny
  // switches and avoids freshly-allocated string props that bust child memo.
  const styleCategory = useMemo(
    () => getStyleCategory(fontClassName),
    [fontClassName]
  );
  const isOldSchoolKaraoke =
    styleCategory === "outline-blue" || styleCategory === "outline-red";

  // Extract primary color from album art for the glow-gold style
  const palette = useCoverPalette(styleCategory === 'glow-gold' ? (coverUrl ?? null) : null);
  const primaryGlow = useMemo(() => {
    const raw = pickPrimaryColor(palette);
    const boosted = boostGlowColor(raw);
    return makeGlowFromColor(boosted);
  }, [palette]);

  const styleProps = useMemo(() => {
    const isOutline =
      styleCategory === "outline-blue" || styleCategory === "outline-red";
    const isColoredGlow =
      styleCategory === "glow-gold" || styleCategory === "glow-gradient";
    const isGradient = styleCategory === "glow-gradient";

    let highlight: string;
    switch (styleCategory) {
      case "outline-blue":
        highlight = OLD_SCHOOL_HIGHLIGHT_COLOR;
        break;
      case "outline-red":
        highlight = SERIF_RED_HIGHLIGHT_COLOR;
        break;
      case "glow-gold":
        highlight = primaryGlow.color;
        break;
      case "glow-gradient":
        highlight = GRADIENT_COLORS;
        break;
      default:
        highlight = "rgba(255, 255, 255, 1)";
    }

    let shadowHighlight: string;
    if (isOutline) {
      shadowHighlight = "none";
    } else if (styleCategory === "glow-gold") {
      shadowHighlight = primaryGlow.shadow;
    } else if (styleCategory === "glow-gradient") {
      shadowHighlight = GRADIENT_GLOW_SHADOW;
    } else {
      shadowHighlight = GLOW_SHADOW;
    }

    let filter: string;
    if (isOutline) {
      filter = "none";
    } else if (styleCategory === "glow-gold") {
      filter = primaryGlow.filter;
    } else if (styleCategory === "glow-gradient") {
      filter = GRADIENT_GLOW_FILTER;
    } else {
      filter = GLOW_FILTER;
    }

    const base =
      styleCategory === "glow-gold" ? primaryGlow.baseColor : undefined;

    return {
      highlightColor: highlight,
      isColoredGlow,
      isGradientStyle: isGradient,
      glowShadowHighlight: shadowHighlight,
      glowFilterStr: filter,
      baseColorResolved: base,
    };
  }, [styleCategory, primaryGlow]);

  const {
    highlightColor,
    isColoredGlow,
    isGradientStyle,
    glowShadowHighlight,
    glowFilterStr,
    baseColorResolved,
  } = styleProps;

  const getTextAlign = (
    align: LyricsAlignment,
    lineIndex: number,
    totalVisibleLines: number
  ) => {
    if (
      align === LyricsAlignment.Center ||
      align === LyricsAlignment.FocusThree
    ) {
      return "center";
    }

    if (align === LyricsAlignment.Alternating) {
      if (totalVisibleLines === 1) return "center";
      return lineIndex === 0 ? "left" : "right";
    }

    if (totalVisibleLines === 1) {
      return "center";
    }
    if (totalVisibleLines === 2) {
      return lineIndex === 0 ? "left" : "right";
    }
    if (lineIndex === 0) return "left";
    if (lineIndex === 1) return "center";
    if (lineIndex === 2) return "right";

    return "center";
  };

  // Helper to compute lines for Alternating alignment (current + next)
  const computeAltVisibleLines = (
    allLines: LyricLine[],
    currIdx: number
  ): LyricLine[] => {
    if (!allLines.length) return [];

    // Initial state before any line is current
    if (currIdx < 0) {
      return allLines.slice(0, 2).filter(Boolean);
    }

    const clampedIdx = Math.min(currIdx, allLines.length - 1);
    const nextLine = allLines[clampedIdx + 1];

    if (clampedIdx % 2 === 0) {
      // Current is on top
      return [allLines[clampedIdx], nextLine].filter(Boolean);
    }

    // Current is at bottom
    return [nextLine, allLines[clampedIdx]].filter(Boolean);
  };

  // State to hold lines displayed in Alternating mode so we can delay updates
  // Use displayOriginalLines to ensure word timings are included (not translated lines)
  const [altLines, setAltLines] = useState<LyricLine[]>(() =>
    computeAltVisibleLines(displayOriginalLines, actualCurrentLine)
  );

  // Track previous lines array to detect song/translation changes
  const prevLinesRef = useRef<LyricLine[]>(displayOriginalLines);

  // Update alternating lines - instantly on song/translation change, delayed for line transitions
  useEffect(() => {
    if (alignment !== LyricsAlignment.Alternating) return;

    // Check if lines array changed (new song or translation switch)
    const linesChanged = prevLinesRef.current !== displayOriginalLines;
    prevLinesRef.current = displayOriginalLines;

    // Instantly update on song load, translation switch, initial state, or
    // while the overlay is hidden. Keeping the alternating pair in sync with
    // the current line whenever the lyrics are off-screen prevents a stale
    // pair from being painted on the first frame after the user re-enters
    // the lyrics view (or switches songs while it is hidden), which would
    // otherwise cause a second visible animation right after the entry
    // animation — the "double shift" bug.
    if (linesChanged || actualCurrentLine < 0 || !visible) {
      setAltLines(computeAltVisibleLines(displayOriginalLines, actualCurrentLine));
      return;
    }

    // For normal line transitions within the same song, apply delay
    // Determine the duration of the new current line
    const clampedIdx = Math.min(Math.max(0, actualCurrentLine), displayOriginalLines.length - 1);
    const currentStart =
      clampedIdx >= 0 && displayOriginalLines[clampedIdx]
        ? parseInt(displayOriginalLines[clampedIdx].startTimeMs)
        : null;
    const nextStart =
      clampedIdx + 1 < displayOriginalLines.length && displayOriginalLines[clampedIdx + 1]
        ? parseInt(displayOriginalLines[clampedIdx + 1].startTimeMs)
        : null;

    const rawDuration =
      currentStart !== null && nextStart !== null ? nextStart - currentStart : 0;

    // Use 20% of the line duration; clamp to 20-400ms range to avoid extremes
    // (prevents 6+ second delays on long instrumental breaks)
    const delayMs = Math.min(400, Math.max(20, Math.floor(rawDuration * 0.2)));

    const timer = setTimeout(() => {
      setAltLines(computeAltVisibleLines(displayOriginalLines, actualCurrentLine));
    }, delayMs);

    return () => clearTimeout(timer);
  }, [alignment, displayOriginalLines, actualCurrentLine, visible]);

  const nonAltVisibleLines = useMemo(() => {
    if (!displayOriginalLines.length) return [] as LyricLine[];

    // Handle initial display before any line is "current" (actualCurrentLine < 0)
    if (actualCurrentLine < 0) {
      // Show just the first line initially for both Center and FocusThree
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

    // FocusThree (prev, current, next)
    return displayOriginalLines.slice(Math.max(0, actualCurrentLine - 1), actualCurrentLine + 2);
  }, [displayOriginalLines, actualCurrentLine, alignment]);

  const visibleLines = useMemo(
    () =>
      applyKaraokeInterludeEllipsis({
        visibleLines:
          alignment === LyricsAlignment.Alternating ? altLines : nonAltVisibleLines,
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
        ? getIntroInterludeInlineLead(displayOriginalLines, currentTimeMs, showInterludeEllipsis)
        : null,
    [alignment, showInterludeEllipsis, actualCurrentLine, displayOriginalLines, currentTimeMs]
  );

  // Track touch start position and accumulated movement
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const accumulatedDeltaRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const hasTriggeredSwipeRef = useRef(false);

  // Vertical scroll (wheel) adjusts offset
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!interactive || !videoVisible || !onAdjustOffset) return;
    const delta = e.deltaY;
    const step = 50; // 50 ms per scroll step
    const change = delta > 0 ? step : -step;
    onAdjustOffset(change);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    // Stop propagation to prevent WindowFrame titlebar autohide from triggering
    e.stopPropagation();
    if (!interactive) return;
    if (e.touches.length === 1) {
      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        time: Date.now(),
      };
      accumulatedDeltaRef.current = { x: 0, y: 0 };
      hasTriggeredSwipeRef.current = false;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    // Stop propagation to prevent WindowFrame titlebar autohide from triggering
    e.stopPropagation();
    // Guard against missing touch data (e.g., multi-touch where first finger was lifted)
    if (!interactive || !touchStartRef.current || e.touches.length === 0) return;
    
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const dx = currentX - touchStartRef.current.x;
    const dy = currentY - touchStartRef.current.y;
    
    // Determine if this is primarily a horizontal or vertical gesture
    const isHorizontal = Math.abs(dx) > Math.abs(dy);
    
    if (isHorizontal && videoVisible && onAdjustOffset) {
      // Horizontal drag: adjust offset
      // Calculate incremental delta from last position
      const lastX = touchStartRef.current.x + accumulatedDeltaRef.current.x;
      const incrementalDx = currentX - lastX;
      
      if (Math.abs(incrementalDx) > 10) {
        const step = 50; // 50 ms per swipe unit
        const change = incrementalDx > 0 ? step : -step; // Swipe right = lyrics later (positive offset), swipe left = lyrics earlier (negative offset)
        onAdjustOffset(change);
        accumulatedDeltaRef.current.x = dx;
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    // Stop propagation to prevent WindowFrame titlebar autohide from triggering
    e.stopPropagation();
    if (!interactive || !touchStartRef.current || hasTriggeredSwipeRef.current) {
      touchStartRef.current = null;
      return;
    }
    
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    const deltaTime = Date.now() - touchStartRef.current.time;
    
    // Swipe thresholds
    const SWIPE_THRESHOLD = 80;
    const MAX_SWIPE_TIME = 500;
    const MAX_CROSS_DRIFT = 100;
    
    // Check for vertical swipe (song navigation)
    const isVerticalSwipe = 
      Math.abs(dy) > SWIPE_THRESHOLD &&
      Math.abs(dx) < MAX_CROSS_DRIFT &&
      deltaTime < MAX_SWIPE_TIME;
    
    if (isVerticalSwipe) {
      if (dy < 0 && onSwipeUp) {
        // Swipe up = next song
        onSwipeUp();
        hasTriggeredSwipeRef.current = true;
      } else if (dy > 0 && onSwipeDown) {
        // Swipe down = previous song
        onSwipeDown();
        hasTriggeredSwipeRef.current = true;
      }
    }
    
    touchStartRef.current = null;
  };

  // Handle touch cancel (e.g., incoming call, browser gesture conflict)
  // Clears refs to prevent stale state
  const handleTouchCancel = useCallback(() => {
    touchStartRef.current = null;
    accumulatedDeltaRef.current = { x: 0, y: 0 };
    hasTriggeredSwipeRef.current = false;
  }, []);

  const currentAnchorIdx =
    actualCurrentLine >= 0 && actualCurrentLine < displayOriginalLines.length
      ? actualCurrentLine
      : -1;

  if (!visible) return null;
  if (isLoading)
    return (
      <LoadingState
        bottomPaddingClass={bottomPaddingClass}
      />
    );
  if (error)
    return (
      <ErrorState
        error={error}
        bottomPaddingClass={bottomPaddingClass}
        textSizeClass={textSizeClass}
        fontClassName={fontClassName}
      />
    );
  if (!displayOriginalLines.length && !isLoading && !isTranslating)
    return (
      <ErrorState
        error={t("apps.ipod.lyrics.noLyricsAvailable")}
        bottomPaddingClass={bottomPaddingClass}
        textSizeClass={textSizeClass}
        fontClassName={fontClassName}
      />
    );

  return (
    <div
      className={`absolute inset-x-0 mx-auto top-0 left-0 right-0 bottom-0 w-full h-full overflow-hidden flex flex-col items-center justify-end ${gapClass} z-40 select-none no-select-gesture px-2 ${bottomPaddingClass} ${isOldSchoolKaraoke ? "lyrics-old-school" : ""}`}
      style={{
        ...(containerStyle || {}),
        pointerEvents: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
      }}
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
    >
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
          const lineTextAlign = getTextAlign(
            alignment,
            index,
            visibleLines.length
          );
          const translatedText = !isInterludePlaceholder && hasTranslation
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
          /** Gap dots sit inline on the lyric *after* the placeholder. Alternating order is either [placeholder, nextLyric] or [nextLyric, placeholder] depending on line index parity — only the former has the placeholder in prevVisible. */
          const interludeLeadForRow =
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
            opacity: hasWordTimings ? { duration: 0.15 } : ANIMATION_CONFIG.fade,
            textShadow: hasWordTimings ? { duration: 0.15 } : ANIMATION_CONFIG.fade,
            filter: ANIMATION_CONFIG.fade,
            duration: 0.15,
          };

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
                paddingLeft:
                  alignment === LyricsAlignment.Alternating &&
                  index === 0 &&
                  visibleLines.length > 1
                    ? "5%"
                    : undefined,
                paddingRight:
                  alignment === LyricsAlignment.Alternating &&
                  index === 1 &&
                  visibleLines.length > 1
                    ? "5%"
                    : undefined,
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
                interludePlaceholderDotsInlineOnlyGhost={interludePlaceholderDotsInlineOnlyGhost}
                interludeInlineDotsLine={interludeInlineDotsLine}
                timeMsForInterludeDots={timeMsForInterludeDots}
                interludeInlineCountdownStartMs={interludeLeadForRow?.countdownStartMs}
                lineTextAlign={lineTextAlign}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
