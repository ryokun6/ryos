import type { LyricWord } from "@/types/lyrics";
import type { FuriganaSegment } from "@/utils/romanization";
import { toRomaji } from "wanakana";
import {
  isChineseText,
  hasKanaTextLocal,
  KOREAN_REGEX,
  renderKoreanWithRomanization,
  renderChineseWithPinyin,
  renderKanaWithRomaji,
  getKoreanPronunciationOnly,
  getChinesePronunciationOnly,
  getKanaPronunciationOnly,
} from "@/utils/romanization";
import { getDisplayReading } from "@/utils/furigana";
import { useMemo, useRef, useEffect } from "react";
import type { ReactNode } from "react";
import {
  BASE_SHADOW,
  CSS_MASK_GRADIENT,
  CSS_MASK_GRADIENT_OLD_SCHOOL,
  GLOW_FILTER,
  GRADIENT_GLOW_FILTER,
  LYRICS_SHADOW_BLEED_BOTTOM,
  LYRICS_SHADOW_BLEED_TOP,
  LYRICS_SHADOW_BLEED_X,
  OLD_SCHOOL_BASE_COLOR,
  OLD_SCHOOL_BASE_STROKE,
  OLD_SCHOOL_HIGHLIGHT_COLOR,
  OLD_SCHOOL_HIGHLIGHT_STROKE,
  OLD_SCHOOL_PADDING,
  OLD_SCHOOL_PADDING_BOTTOM,
  OLD_SCHOOL_PADDING_TOP,
} from "./constants";
import {
  getTrailingWhitespace,
  mapWordTimingsToFurigana,
} from "./furiganaWordMapping";
import type { WordRenderItem } from "./types";

export function WordTimingHighlight({
  wordTimings,
  lineStartTimeMs,
  currentTimeMs,
  processText,
  furiganaSegments,
  koreanRomanized = false,
  japaneseRomaji = false,
  chinesePinyin = false,
  pronunciationOnly = false,
  soramimiTargetLanguage,
  onSeekToTime,
  isOldSchoolKaraoke = false,
  highlightColor,
  glowFilter,
  baseColor,
  isGradient = false,
  rainbowHue,
}: {
  wordTimings: LyricWord[];
  lineStartTimeMs: number;
  currentTimeMs: number;
  processText: (text: string) => string;
  furiganaSegments?: FuriganaSegment[];
  koreanRomanized?: boolean;
  japaneseRomaji?: boolean;
  chinesePinyin?: boolean;
  /** Show only pronunciation (replace original text with phonetic content) */
  pronunciationOnly?: boolean;
  /** Soramimi target language for spacing ("en" needs spaces between words) */
  soramimiTargetLanguage?: "zh-TW" | "en";
  onSeekToTime?: (timeMs: number) => void;
  /** Use old-school karaoke styling (black outline white text -> white outline blue text) */
  isOldSchoolKaraoke?: boolean;
  /** Highlight color for the active/filled state (or gradient string for gradient style) */
  highlightColor?: string;
  /** Glow filter for non-outline styles */
  glowFilter?: string;
  /** Base color for colored glow styles (gold/gradient inactive state) */
  baseColor?: string;
  /** Whether to use gradient text rendering */
  isGradient?: boolean;
  /** Current hue rotation in degrees for rainbow effect (0-360) */
  rainbowHue?: number;
}): ReactNode {
  // Refs for direct DOM manipulation (bypasses React reconciliation)
  const overlayRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const lastProgressRef = useRef<number[]>([]);
  
  // Time tracking for smooth interpolation
  const timeRef = useRef({
    propTime: currentTimeMs,
    propTimestamp: performance.now(),
    lastDisplayedTime: currentTimeMs,
  });

  // Pre-compute render items (only recalculates when inputs change)
  const renderItems = useMemo((): WordRenderItem[] => {
    // Helper to get content for a word (handles romanization)
    const getWordContent = (text: string): ReactNode => {
      const processed = processText(text);
      // Check for kana first (romaji)
      if (japaneseRomaji && hasKanaTextLocal(processed)) {
        if (pronunciationOnly) {
          return getKanaPronunciationOnly(processed);
        }
        return renderKanaWithRomaji(processed, "word");
      }
      // Then check Korean
      if (koreanRomanized && KOREAN_REGEX.test(text)) {
        KOREAN_REGEX.lastIndex = 0; // Reset regex state
        if (pronunciationOnly) {
          return getKoreanPronunciationOnly(processed);
        }
        return renderKoreanWithRomanization(processed);
      }
      // Then check Chinese
      if (chinesePinyin && isChineseText(processed)) {
        if (pronunciationOnly) {
          return getChinesePronunciationOnly(processed);
        }
        return renderChineseWithPinyin(processed, "word");
      }
      return processed;
    };

    // Helper to check if text is primarily Latin characters (romanized output needs spaces)
    const isLatinText = (text: string): boolean => {
      const latinChars = text.match(/[a-zA-Z]/g);
      return latinChars !== null && latinChars.length > text.length / 2;
    };

    // Helper to determine if a word's output will be romanized (Latin)
    const willOutputLatin = (text: string, reading?: string): boolean => {
      if (reading) {
        const displayReading = japaneseRomaji ? toRomaji(reading) : reading;
        return isLatinText(displayReading);
      }
      const processed = processText(text);
      if (japaneseRomaji && hasKanaTextLocal(processed)) return true;
      if (koreanRomanized && KOREAN_REGEX.test(text)) {
        KOREAN_REGEX.lastIndex = 0;
        return true;
      }
      if (chinesePinyin && isChineseText(processed)) return true;
      return false;
    };

    // English soramimi always needs spaces
    const isEnglishSoramimi = soramimiTargetLanguage === "en";

    if (furiganaSegments && furiganaSegments.length > 0) {
      // Use character-position alignment to handle boundary mismatches
      // When a furigana segment spans multiple word timings, they're combined into one unit
      const { renderItems: mappedItems } = mapWordTimingsToFurigana(wordTimings, furiganaSegments);
      
      return mappedItems.map((item, idx) => {
        const word = wordTimings[item.wordIdx];
        // Get trailing space from last combined word
        const lastWordIdx = item.combinedWordIndices[item.combinedWordIndices.length - 1];
        const lastWord = wordTimings[lastWordIdx];
        const trailingSpace = getTrailingWhitespace(lastWord.text);
        const isLastWord = idx === mappedItems.length - 1;
        
        let content: ReactNode;
        const displayReadingSource = getDisplayReading(item);
        if (displayReadingSource) {
          // Has a reading - show combined text with ruby annotation
          // Convert to romaji if japaneseRomaji is enabled
          const displayReading = japaneseRomaji ? toRomaji(displayReadingSource) : displayReadingSource;
          // Only add space if output is Latin (romanized) or English soramimi
          const outputIsLatin = isLatinText(displayReading) || isEnglishSoramimi;
          const needsSpace = pronunciationOnly && outputIsLatin && !trailingSpace && !isLastWord;
          const spacer = needsSpace ? " " : trailingSpace;
          
          if (pronunciationOnly) {
            content = <>{displayReading}{spacer}</>;
          } else {
            // Ruby annotation mode
            content = (
              <>
                <ruby className="lyrics-furigana lyrics-soramimi">
                  {item.text}
                  <rt className="lyrics-furigana-rt lyrics-soramimi-rt">{displayReading}</rt>
                </ruby>
                {trailingSpace}
              </>
            );
          }
        } else {
          // No reading - check if this word will be romanized
          const wordContent = getWordContent(word.text);
          const outputIsLatin = willOutputLatin(word.text) || isEnglishSoramimi;
          const needsSpace = pronunciationOnly && outputIsLatin && !trailingSpace && !isLastWord;
          content = needsSpace ? <>{wordContent}{" "}</> : wordContent;
        }
        
        return {
          word,
          extraDurationMs: item.extraDurationMs,
          content,
          key: `${item.wordIdx}-${item.text}`,
        };
      });
    }
    
    // No furigana - simple word list with romanization support
    return wordTimings.map((word, idx) => {
      const isLastWord = idx === wordTimings.length - 1;
      const trailingSpace = getTrailingWhitespace(word.text);
      const wordContent = getWordContent(word.text);
      // Only add space if output is Latin (romanized)
      const outputIsLatin = willOutputLatin(word.text) || isEnglishSoramimi;
      const needsSpace = pronunciationOnly && outputIsLatin && !trailingSpace && !isLastWord;
      const content = needsSpace ? <>{wordContent}{" "}</> : wordContent;
      return {
        word,
        extraDurationMs: 0,
        content,
        key: `${idx}-${word.text}`,
      };
    });
  }, [wordTimings, furiganaSegments, processText, koreanRomanized, japaneseRomaji, chinesePinyin, pronunciationOnly, soramimiTargetLanguage]);

  const timingWindows = useMemo(
    () =>
      renderItems.map(({ word, extraDurationMs }) => ({
        startTimeMs: word.startTimeMs,
        durationMs: word.durationMs + extraDurationMs,
      })),
    [renderItems]
  );

  // Sync time ref when prop changes
  useEffect(() => {
    timeRef.current.propTime = currentTimeMs;
    timeRef.current.propTimestamp = performance.now();
  }, [currentTimeMs]);

  // Animation loop - updates DOM directly without React re-renders
  // Uses CSS custom properties for GPU-accelerated mask animation
  useEffect(() => {
    let animationFrameId: number;
    
    const updateMasks = () => {
      // Interpolate time for smooth animation between prop updates
      const elapsed = performance.now() - timeRef.current.propTimestamp;
      const clampedElapsed = Math.min(elapsed, 500); // Max 500ms interpolation
      const rawTime = timeRef.current.propTime + clampedElapsed;
      
      // Monotonic time: ignore tiny backward jitter between progress ticks (~200ms). Keep at 100ms so local
      // playback stays smooth; larger remote-only drift is smoothed in useListenSync, not here.
      const lastDisplayed = timeRef.current.lastDisplayedTime;
      const isSeek = lastDisplayed - rawTime >= 100;
      const interpolatedTime = isSeek || rawTime >= lastDisplayed ? rawTime : lastDisplayed;
      timeRef.current.lastDisplayedTime = interpolatedTime;
      
      const timeIntoLine = interpolatedTime - lineStartTimeMs;
      
      // Only update words whose progress actually changed to avoid
      // forcing redundant style recalculations for already-filled words.
      timingWindows.forEach(({ startTimeMs, durationMs }, idx) => {
        const overlayEl = overlayRefs.current[idx];
        if (!overlayEl) return;

        // Calculate progress (0 to 1)
        let progress = 0;
        if (timeIntoLine >= startTimeMs) {
          progress = durationMs > 0
            ? Math.min(1, (timeIntoLine - startTimeMs) / durationMs)
            : 1;
        }

        const normalizedProgress =
          progress <= 0 ? 0 : progress >= 1 ? 1 : progress;
        const previousProgress = lastProgressRef.current[idx];
        if (
          previousProgress === normalizedProgress ||
          (Number.isFinite(previousProgress) &&
            Math.abs(previousProgress - normalizedProgress) < 0.001)
        ) {
          return;
        }

        lastProgressRef.current[idx] = normalizedProgress;
        overlayEl.style.setProperty("--mask-progress", normalizedProgress.toString());
      });
      
      animationFrameId = requestAnimationFrame(updateMasks);
    };
    
    animationFrameId = requestAnimationFrame(updateMasks);
    return () => cancelAnimationFrame(animationFrameId);
  }, [lineStartTimeMs, timingWindows]);

  // Initialize refs array length
  useEffect(() => {
    overlayRefs.current = overlayRefs.current.slice(0, renderItems.length);
  }, [renderItems.length]);

  useEffect(() => {
    lastProgressRef.current = Array.from({ length: renderItems.length }, () => Number.NaN);
  }, [lineStartTimeMs, timingWindows, renderItems.length]);

  const handleWordClick = (wordStartTimeMs: number) => {
    if (onSeekToTime) {
      onSeekToTime(lineStartTimeMs + wordStartTimeMs);
    }
  };

  // Render once - DOM updates happen via refs using CSS custom properties
  return (
    <>
      {renderItems.map((item, idx) => (
        <span
          key={item.key}
          className={`lyrics-word-highlight ${onSeekToTime ? "cursor-pointer" : ""}`}
          onClick={onSeekToTime ? (e) => { 
            e.stopPropagation(); 
            handleWordClick(item.word.startTimeMs); 
          } : undefined}
        >
          {/* Base layer: dimmed or old-school white with black outline */}
          <span 
            className={`lyrics-word-layer ${isOldSchoolKaraoke ? "" : baseColor ? "" : "opacity-55"}`} 
            style={{ 
              textShadow: isOldSchoolKaraoke ? "none" : BASE_SHADOW, 
              paddingTop: isOldSchoolKaraoke ? OLD_SCHOOL_PADDING_TOP : LYRICS_SHADOW_BLEED_TOP,
              marginTop: isOldSchoolKaraoke ? `-${OLD_SCHOOL_PADDING_TOP}` : `calc(-1 * ${LYRICS_SHADOW_BLEED_TOP})`,
              paddingBottom: isOldSchoolKaraoke ? OLD_SCHOOL_PADDING_BOTTOM : LYRICS_SHADOW_BLEED_BOTTOM,
              marginBottom: isOldSchoolKaraoke ? `-${OLD_SCHOOL_PADDING_BOTTOM}` : `calc(-1 * ${LYRICS_SHADOW_BLEED_BOTTOM})`,
              paddingLeft: isOldSchoolKaraoke ? OLD_SCHOOL_PADDING : LYRICS_SHADOW_BLEED_X,
              paddingRight: isOldSchoolKaraoke ? OLD_SCHOOL_PADDING : LYRICS_SHADOW_BLEED_X,
              marginLeft: isOldSchoolKaraoke ? `-${OLD_SCHOOL_PADDING}` : `calc(-1 * ${LYRICS_SHADOW_BLEED_X})`,
              marginRight: isOldSchoolKaraoke ? `-${OLD_SCHOOL_PADDING}` : `calc(-1 * ${LYRICS_SHADOW_BLEED_X})`,
              color: isOldSchoolKaraoke ? OLD_SCHOOL_BASE_COLOR : baseColor,
              WebkitTextStroke: isOldSchoolKaraoke ? OLD_SCHOOL_BASE_STROKE : undefined,
              paintOrder: isOldSchoolKaraoke ? "stroke fill" : undefined,
            } as React.CSSProperties}
          >
            {item.content}
          </span>
          {/* Highlight layer: glow or old-school colored outline */}
          <span
            aria-hidden="true"
            className="lyrics-word-layer"
            style={{ 
              // For gradient style, combine drop-shadow with hue-rotate based on playback time
              filter: isGradient && rainbowHue !== undefined
                ? `${GRADIENT_GLOW_FILTER} hue-rotate(${rainbowHue}deg)`
                : (isOldSchoolKaraoke ? "none" : (glowFilter || GLOW_FILTER)),
              paddingLeft: isOldSchoolKaraoke ? OLD_SCHOOL_PADDING : LYRICS_SHADOW_BLEED_X,
              paddingRight: isOldSchoolKaraoke ? OLD_SCHOOL_PADDING : LYRICS_SHADOW_BLEED_X,
              marginLeft: isOldSchoolKaraoke ? `-${OLD_SCHOOL_PADDING}` : `calc(-1 * ${LYRICS_SHADOW_BLEED_X})`,
              marginRight: isOldSchoolKaraoke ? `-${OLD_SCHOOL_PADDING}` : `calc(-1 * ${LYRICS_SHADOW_BLEED_X})`,
              // Keep GPU-composited to prevent pixel rounding
              backfaceVisibility: "hidden",
            }}
          >
            {/* Masked text - uses CSS custom property for GPU-accelerated animation */}
            <span
              ref={(el) => { overlayRefs.current[idx] = el; }}
              style={{ 
                display: "block",
                color: highlightColor || (isOldSchoolKaraoke ? OLD_SCHOOL_HIGHLIGHT_COLOR : "rgba(255, 255, 255, 1)"),
                opacity: isOldSchoolKaraoke ? undefined : 1,
                textShadow: isOldSchoolKaraoke ? "none" : BASE_SHADOW,
                WebkitTextStroke: isOldSchoolKaraoke ? OLD_SCHOOL_HIGHLIGHT_STROKE : undefined,
                paintOrder: isOldSchoolKaraoke ? "stroke fill" : undefined,
                // Use CSS custom property for mask - JS sets --mask-progress (0-1)
                // Old-school uses sharper edge, default uses soft feather
                maskImage: isOldSchoolKaraoke ? CSS_MASK_GRADIENT_OLD_SCHOOL : CSS_MASK_GRADIENT,
                WebkitMaskImage: isOldSchoolKaraoke ? CSS_MASK_GRADIENT_OLD_SCHOOL : CSS_MASK_GRADIENT,
                overflow: "visible",
                paddingTop: isOldSchoolKaraoke ? OLD_SCHOOL_PADDING_TOP : LYRICS_SHADOW_BLEED_TOP,
                marginTop: isOldSchoolKaraoke ? `-${OLD_SCHOOL_PADDING_TOP}` : `calc(-1 * ${LYRICS_SHADOW_BLEED_TOP})`,
                paddingBottom: isOldSchoolKaraoke ? OLD_SCHOOL_PADDING_BOTTOM : LYRICS_SHADOW_BLEED_BOTTOM,
                marginBottom: isOldSchoolKaraoke ? `-${OLD_SCHOOL_PADDING_BOTTOM}` : `calc(-1 * ${LYRICS_SHADOW_BLEED_BOTTOM})`,
                paddingLeft: isOldSchoolKaraoke ? OLD_SCHOOL_PADDING : LYRICS_SHADOW_BLEED_X,
                paddingRight: isOldSchoolKaraoke ? OLD_SCHOOL_PADDING : LYRICS_SHADOW_BLEED_X,
                marginLeft: isOldSchoolKaraoke ? `-${OLD_SCHOOL_PADDING}` : `calc(-1 * ${LYRICS_SHADOW_BLEED_X})`,
                marginRight: isOldSchoolKaraoke ? `-${OLD_SCHOOL_PADDING}` : `calc(-1 * ${LYRICS_SHADOW_BLEED_X})`,
                // Keep GPU-composited to prevent pixel rounding
                backfaceVisibility: "hidden",
                willChange: "mask-image",
              } as React.CSSProperties}
            >
              {item.content}
            </span>
          </span>
        </span>
      ))}
    </>
  );
}
