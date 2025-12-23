import {
  LyricLine,
  LyricWord,
  LyricsAlignment,
  ChineseVariant,
  KoreanDisplay,
  JapaneseFurigana,
  RomanizationSettings,
} from "@/types/lyrics";
import { motion, AnimatePresence } from "framer-motion";
import { useMemo, useRef, useState, useEffect } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Converter } from "opencc-js";
import { useIpodStore } from "@/stores/useIpodStore";
import { useFurigana, FuriganaSegment } from "@/hooks/useFurigana";
import { useShallow } from "zustand/react/shallow";
import {
  isChineseText,
  hasKanaTextLocal,
  KOREAN_REGEX,
  renderFuriganaSegments,
  renderKoreanWithRomanization,
  renderChineseWithPinyin,
  renderKanaWithRomaji,
} from "@/utils/romanization";

interface LyricsDisplayProps {
  lines: LyricLine[];
  /** Original untranslated lyrics (used for furigana) */
  originalLines?: LyricLine[];
  currentLine: number;
  isLoading: boolean;
  error?: string;
  /** Whether the overlay should be visible */
  visible?: boolean;
  /** Whether the video is visible */
  videoVisible?: boolean;
  /** Override alignment (if not provided, reads from store) */
  alignment?: LyricsAlignment;
  /** Override Chinese variant (if not provided, reads from store) */
  chineseVariant?: ChineseVariant;
  /** Override Korean display (if not provided, reads from store) */
  koreanDisplay?: KoreanDisplay;
  /** Override Japanese furigana (if not provided, reads from store) */
  japaneseFurigana?: JapaneseFurigana;
  /** Callback to adjust lyric offset in ms (positive = lyrics earlier) */
  onAdjustOffset?: (deltaMs: number) => void;
  /** Callback when swiping up (next song) */
  onSwipeUp?: () => void;
  /** Callback when swiping down (previous song) */
  onSwipeDown?: () => void;
  /** Whether lyrics are currently being translated */
  isTranslating?: boolean;
  /** Optional tailwind class for text size */
  textSizeClass?: string;
  /** Optional tailwind class for line height */
  lineHeightClass?: string;
  /** Whether the overlay should capture pointer events */
  interactive?: boolean;
  /** Optional tailwind class to control bottom padding (e.g. "pb-24"). Defaults to "pb-5" */
  bottomPaddingClass?: string;
  /** Optional tailwind class for spacing between lyric items */
  gapClass?: string;
  /** Optional font class to apply to lyric lines; defaults to Geneva */
  fontClassName?: string;
  /** Optional inline styles for the outer container (e.g., dynamic gap) */
  containerStyle?: CSSProperties;
  /** Callback when furigana loading state changes */
  onFuriganaLoadingChange?: (isLoading: boolean) => void;
  /** Current playback time in milliseconds (for word-level highlighting) */
  currentTimeMs?: number;
  /** Callback to seek to a specific time in ms */
  onSeekToTime?: (timeMs: number) => void;
}

const ANIMATION_CONFIG = {
  spring: {
    type: "spring" as const,
    stiffness: 200,
    damping: 30,
    mass: 1,
  },
  fade: {
    duration: 0.2,
  },
} as const;

const LoadingState = ({
  bottomPaddingClass = "pb-5",
}: {
  bottomPaddingClass?: string;
}) => {
  return (
    <div
      className={`absolute inset-x-0 top-0 left-0 right-0 bottom-0 pointer-events-none flex items-end justify-center z-40 ${bottomPaddingClass}`}
    />
  );
};

const ErrorState = ({
  error,
  bottomPaddingClass = "pb-5",
  textSizeClass = "text-[12px]",
  fontClassName = "font-geneva-12",
}: {
  error?: string;
  bottomPaddingClass?: string;
  textSizeClass?: string;
  fontClassName?: string;
}) => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // Fade out after 3 seconds
    const timer = setTimeout(() => {
      setVisible(false);
    }, 3000);
    return () => clearTimeout(timer);
  }, [error]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className={`absolute inset-x-0 top-0 left-0 right-0 bottom-0 pointer-events-none flex items-end justify-center z-40 ${bottomPaddingClass}`}
        >
          <div className={`text-white/70 ${textSizeClass} ${fontClassName}`}>
            {error || "Unable to load lyrics"}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};



/**
 * Result of mapping furigana to a word, including timing adjustments
 * When a furigana segment spans multiple words, the first word gets extended timing
 */
interface WordFuriganaMapping {
  /** The furigana segments for this word, or null if word was borrowed by a previous word */
  segments: FuriganaSegment[] | null;
  /** Extra duration (in ms) to add to this word's animation because it covers borrowed characters */
  extraDurationMs: number;
}

/**
 * Map furigana segments to individual words based on character positions
 * When a segment with reading spans multiple words, keeps it intact with the first word
 * Returns an array where each index corresponds to a word's furigana mapping
 * Words whose characters were "borrowed" by a previous segment get null segments to indicate skip
 * Words that borrow from future words get extraDurationMs to extend their animation
 */
function mapWordsToFurigana(
  wordTimings: LyricWord[],
  furiganaSegments: FuriganaSegment[]
): WordFuriganaMapping[] {
  const result: WordFuriganaMapping[] = [];
  
  let segmentIndex = 0;
  let charInSegment = 0;
  // Track how many chars were "borrowed" from future words by a previous segment
  let charsBorrowedFromFuture = 0;
  // Track which word index borrowed the chars so we can add extra duration to it
  let borrowingWordIndex = -1;
  
  for (let wordIndex = 0; wordIndex < wordTimings.length; wordIndex++) {
    const word = wordTimings[wordIndex];
    
    // If this word's characters were already rendered by a previous word's furigana
    if (charsBorrowedFromFuture >= word.text.length) {
      charsBorrowedFromFuture -= word.text.length;
      result.push({ segments: null, extraDurationMs: 0 }); // Signal to skip this word entirely
      
      // Add this word's duration to the borrowing word's extra duration
      if (borrowingWordIndex >= 0 && result[borrowingWordIndex]) {
        result[borrowingWordIndex].extraDurationMs += word.durationMs;
      }
      continue;
    }
    
    // Partial borrow - skip some chars but this word still gets some content
    if (charsBorrowedFromFuture > 0) {
      // Add proportional duration for the borrowed portion
      if (borrowingWordIndex >= 0 && result[borrowingWordIndex]) {
        const borrowedPortion = charsBorrowedFromFuture / word.text.length;
        result[borrowingWordIndex].extraDurationMs += word.durationMs * borrowedPortion;
      }
    }
    const effectiveWordLength = word.text.length - charsBorrowedFromFuture;
    charsBorrowedFromFuture = 0;
    borrowingWordIndex = -1;
    
    const wordFurigana: FuriganaSegment[] = [];
    let wordCharsRemaining = effectiveWordLength;
    
    while (wordCharsRemaining > 0 && segmentIndex < furiganaSegments.length) {
      const segment = furiganaSegments[segmentIndex];
      const charsAvailableInSegment = segment.text.length - charInSegment;
      const isStartOfSegment = charInSegment === 0;
      
      if (charsAvailableInSegment <= wordCharsRemaining) {
        // Take the rest of this segment
        wordFurigana.push({
          text: segment.text.slice(charInSegment),
          reading: isStartOfSegment ? segment.reading : undefined,
        });
        wordCharsRemaining -= charsAvailableInSegment;
        segmentIndex++;
        charInSegment = 0;
      } else {
        // Segment is larger than remaining word chars
        // If this segment has a reading and we're at the start, keep the WHOLE segment
        // with this word to preserve furigana (don't split kanji compounds)
        if (isStartOfSegment && segment.reading) {
          wordFurigana.push({
            text: segment.text,
            reading: segment.reading,
          });
          // Track how many extra chars we borrowed from future words
          const extraChars = segment.text.length - wordCharsRemaining;
          charsBorrowedFromFuture = extraChars;
          borrowingWordIndex = wordIndex; // This word is the one borrowing
          // Skip past this entire segment for future words
          segmentIndex++;
          charInSegment = 0;
          wordCharsRemaining = 0;
        } else {
          // No reading or we're mid-segment, safe to split
          wordFurigana.push({
            text: segment.text.slice(charInSegment, charInSegment + wordCharsRemaining),
            reading: undefined,
          });
          charInSegment += wordCharsRemaining;
          wordCharsRemaining = 0;
        }
      }
    }
    
    result.push({ segments: wordFurigana, extraDurationMs: 0 });
  }
  
  return result;
}

// Shared shadow constants for word highlighting
const BASE_SHADOW = "0 0 6px rgba(0,0,0,0.5), 0 0 6px rgba(0,0,0,0.5)";
// Text shadow glow for non-word-timed lines
const GLOW_SHADOW = "0 0 6px rgba(255,255,255,0.9), 0 0 6px rgba(0,0,0,0.5), 0 0 6px rgba(0,0,0,0.5)";
// Drop shadow filter for word-timed glow (applied to container, not clipped by mask)
const GLOW_FILTER = "drop-shadow(0 0 6px rgba(255,255,255,0.4))";
const FEATHER = 15; // Width of the soft edge in percentage

/**
 * Calculate gradient mask values for a word based on progress
 */
function calculateMask(progress: number): string {
  const progressPercent = progress * (100 + FEATHER) - FEATHER;
  return `linear-gradient(to right, black ${progressPercent}%, transparent ${progressPercent + FEATHER}%)`;
}

/**
 * Static word rendering without animation (for inactive lines with word timings)
 * Uses the same DOM structure as animated words for consistent line breaking
 */
function StaticWordRendering({
  wordTimings,
  processText,
  furiganaSegments,
  koreanRomanized = false,
  japaneseRomaji = false,
  chinesePinyin = false,
  lineStartTimeMs,
  onSeekToTime,
}: {
  wordTimings: LyricWord[];
  processText: (text: string) => string;
  furiganaSegments?: FuriganaSegment[];
  koreanRomanized?: boolean;
  japaneseRomaji?: boolean;
  chinesePinyin?: boolean;
  lineStartTimeMs?: number;
  onSeekToTime?: (timeMs: number) => void;
}): ReactNode {
  // Pre-compute render items for consistency with animated version
  const renderItems = useMemo(() => {
    // Helper to get content for a word (handles romanization)
    const getWordContent = (text: string): ReactNode => {
      const processed = processText(text);
      // Check for kana first (romaji)
      if (japaneseRomaji && hasKanaTextLocal(processed)) {
        return renderKanaWithRomaji(processed, "word");
      }
      // Then check Korean
      if (koreanRomanized && KOREAN_REGEX.test(text)) {
        KOREAN_REGEX.lastIndex = 0; // Reset regex state
        return renderKoreanWithRomanization(processed);
      }
      // Then check Chinese
      if (chinesePinyin && isChineseText(processed)) {
        return renderChineseWithPinyin(processed, "word");
      }
      return processed;
    };

    if (furiganaSegments && furiganaSegments.length > 0) {
      const wordFuriganaList = mapWordsToFurigana(wordTimings, furiganaSegments);
      const items: { key: string; content: ReactNode; startTimeMs: number }[] = [];
      
      wordTimings.forEach((word, idx) => {
        const mapping = wordFuriganaList[idx];
        if (!mapping || mapping.segments === null) return;
        
        items.push({
          key: `${idx}-${word.text}`,
          content: mapping.segments.length > 0
            ? renderFuriganaSegments(mapping.segments, { koreanRomanization: koreanRomanized, japaneseRomaji, chinesePinyin })
            : getWordContent(word.text),
          startTimeMs: word.startTimeMs,
        });
      });
      
      return items;
    }
    
    return wordTimings.map((word, idx) => ({
      key: `${idx}-${word.text}`,
      content: getWordContent(word.text),
      startTimeMs: word.startTimeMs,
    }));
  }, [wordTimings, furiganaSegments, processText, koreanRomanized, japaneseRomaji, chinesePinyin]);

  const handleWordClick = (wordStartTimeMs: number) => {
    if (onSeekToTime && lineStartTimeMs !== undefined) {
      onSeekToTime(lineStartTimeMs + wordStartTimeMs);
    }
  };

  return (
    <>
      {renderItems.map((item) => (
          <span
            key={item.key}
            className={`lyrics-word-highlight ${onSeekToTime ? "cursor-pointer" : ""}`}
            onClick={onSeekToTime ? (e) => { e.stopPropagation(); handleWordClick(item.startTimeMs); } : undefined}
          >
            <span className="opacity-50 lyrics-word-layer" style={{ textShadow: BASE_SHADOW, paddingBottom: "0.35em", marginBottom: "-0.35em" }}>
              {item.content}
            </span>
          </span>
      ))}
    </>
  );
}

/**
 * Word timing data with pre-computed content for rendering
 */
interface WordRenderItem {
  word: LyricWord;
  /** Extra duration from furigana spanning multiple words */
  extraDurationMs: number;
  /** Pre-rendered content (text or furigana) */
  content: ReactNode;
  /** Unique key for React */
  key: string;
}

/**
 * Renders a line with word-level timing highlights.
 * Uses direct DOM manipulation via refs for smooth 60fps animation
 * without causing React re-renders on every frame.
 */
function WordTimingHighlight({
  wordTimings,
  lineStartTimeMs,
  currentTimeMs,
  processText,
  furiganaSegments,
  koreanRomanized = false,
  japaneseRomaji = false,
  chinesePinyin = false,
  onSeekToTime,
}: {
  wordTimings: LyricWord[];
  lineStartTimeMs: number;
  currentTimeMs: number;
  processText: (text: string) => string;
  furiganaSegments?: FuriganaSegment[];
  koreanRomanized?: boolean;
  japaneseRomaji?: boolean;
  chinesePinyin?: boolean;
  onSeekToTime?: (timeMs: number) => void;
}): ReactNode {
  // Refs for direct DOM manipulation (bypasses React reconciliation)
  const overlayRefs = useRef<(HTMLSpanElement | null)[]>([]);
  
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
        return renderKanaWithRomaji(processed, "word");
      }
      // Then check Korean
      if (koreanRomanized && KOREAN_REGEX.test(text)) {
        KOREAN_REGEX.lastIndex = 0; // Reset regex state
        return renderKoreanWithRomanization(processed);
      }
      // Then check Chinese
      if (chinesePinyin && isChineseText(processed)) {
        return renderChineseWithPinyin(processed, "word");
      }
      return processed;
    };

    if (furiganaSegments && furiganaSegments.length > 0) {
      const wordFuriganaList = mapWordsToFurigana(wordTimings, furiganaSegments);
      const items: WordRenderItem[] = [];
      
      wordTimings.forEach((word, idx) => {
        const mapping = wordFuriganaList[idx];
        // Skip words whose characters were borrowed by a previous word's furigana
        if (!mapping || mapping.segments === null) return;
        
        const content = mapping.segments.length > 0
          ? renderFuriganaSegments(mapping.segments, { koreanRomanization: koreanRomanized, japaneseRomaji, chinesePinyin })
          : getWordContent(word.text);
        
        items.push({
          word,
          extraDurationMs: mapping.extraDurationMs,
          content,
          key: `${idx}-${word.text}`,
        });
      });
      
      return items;
    }
    
    // No furigana - simple word list with romanization support
    return wordTimings.map((word, idx) => ({
      word,
      extraDurationMs: 0,
      content: getWordContent(word.text),
      key: `${idx}-${word.text}`,
    }));
  }, [wordTimings, furiganaSegments, processText, koreanRomanized, japaneseRomaji, chinesePinyin]);

  // Sync time ref when prop changes
  useEffect(() => {
    timeRef.current.propTime = currentTimeMs;
    timeRef.current.propTimestamp = performance.now();
  }, [currentTimeMs]);

  // Animation loop - updates DOM directly without React re-renders
  useEffect(() => {
    let animationFrameId: number;
    
    const updateMasks = () => {
      // Interpolate time for smooth animation between prop updates
      const elapsed = performance.now() - timeRef.current.propTimestamp;
      const clampedElapsed = Math.min(elapsed, 500); // Max 500ms interpolation
      const rawTime = timeRef.current.propTime + clampedElapsed;
      
      // Monotonic time: prevent backward jitter unless it's a significant seek
      const lastDisplayed = timeRef.current.lastDisplayedTime;
      const isSeek = lastDisplayed - rawTime >= 500;
      const interpolatedTime = isSeek || rawTime >= lastDisplayed ? rawTime : lastDisplayed;
      timeRef.current.lastDisplayedTime = interpolatedTime;
      
      const timeIntoLine = interpolatedTime - lineStartTimeMs;
      
      // Update each word's mask directly via DOM
      renderItems.forEach((item, idx) => {
        const overlayEl = overlayRefs.current[idx];
        if (!overlayEl) return;
        
        const { word, extraDurationMs } = item;
        const durationMs = word.durationMs + extraDurationMs;
        
        // Calculate progress (0 to 1)
        let progress = 0;
        if (timeIntoLine >= word.startTimeMs) {
          progress = durationMs > 0
            ? Math.min(1, (timeIntoLine - word.startTimeMs) / durationMs)
            : 1;
        }
        
        // Apply gradient mask directly to DOM
        const mask = calculateMask(progress);
        overlayEl.style.maskImage = mask;
        overlayEl.style.webkitMaskImage = mask;
      });
      
      animationFrameId = requestAnimationFrame(updateMasks);
    };
    
    animationFrameId = requestAnimationFrame(updateMasks);
    return () => cancelAnimationFrame(animationFrameId);
  }, [lineStartTimeMs, renderItems]);

  // Initialize refs array length
  useEffect(() => {
    overlayRefs.current = overlayRefs.current.slice(0, renderItems.length);
  }, [renderItems.length]);

  // Initial mask (hidden) - prevents flash before animation loop kicks in
  const initialMask = calculateMask(0);

  const handleWordClick = (wordStartTimeMs: number) => {
    if (onSeekToTime) {
      onSeekToTime(lineStartTimeMs + wordStartTimeMs);
    }
  };

  // Render once - DOM updates happen via refs, not re-renders
  return (
    <>
      {renderItems.map((item, idx) => (
        <span
          key={item.key}
          className={`lyrics-word-highlight ${onSeekToTime ? "cursor-pointer" : ""}`}
          onClick={onSeekToTime ? (e) => { e.stopPropagation(); handleWordClick(item.word.startTimeMs); } : undefined}
        >
          <span className="opacity-50 lyrics-word-layer" style={{ textShadow: BASE_SHADOW, paddingBottom: "0.35em", marginBottom: "-0.35em" }}>
            {item.content}
          </span>
          {/* Glow wrapper - filter applied here creates glow around masked content */}
          <span
            aria-hidden="true"
            className="lyrics-word-layer"
            style={{ filter: GLOW_FILTER }}
          >
            {/* Masked text - only highlighted portion visible */}
            <span
              ref={(el) => { overlayRefs.current[idx] = el; }}
              style={{ 
                display: "block",
                color: "rgba(255,255,255,0.9)",
                textShadow: BASE_SHADOW,
                maskImage: initialMask,
                WebkitMaskImage: initialMask,
                overflow: "visible",
                paddingBottom: "0.35em",
                marginBottom: "-0.35em",
              }}
            >
              {item.content}
            </span>
          </span>
        </span>
      ))}
    </>
  );
}

const getVariants = (
  position: number,
  isAlternating: boolean,
  isCurrent: boolean,
  hasWordTiming: boolean = false
) => {
  // For lines with word-level timing, glow is handled by the overlay layer
  // For other lines, apply glow at the parent level
  const currentTextShadow = isCurrent && !hasWordTiming ? GLOW_SHADOW : BASE_SHADOW;
  
  // For lines with word timing, use subtle opacity fade for inactive lines
  // For non-word-timed lines, use normal opacity animation
  const getAnimateOpacity = () => {
    // Alternating layout: less aggressive dimming
    if (isAlternating) return isCurrent ? 1 : 0.8;
    
    if (hasWordTiming) {
      // Word-timed lines: current at full, inactive more faded for focus effect
      if (isCurrent) return 1;
      return 0.8;
    }
    // Non-word-timed lines: normal opacity animation
    if (isCurrent) return 1;
    return position === 1 || position === -1 ? 0.35 : 0.1;
  };

  // For word-timed lines, start at target opacity to avoid flash on entry
  const initialOpacity = hasWordTiming ? getAnimateOpacity() : 0;
  
  return {
    initial: {
      opacity: initialOpacity,
      scale: 0.93,
      filter: "none",
      y: 10,
      textShadow: BASE_SHADOW,
    },
    animate: {
      opacity: getAnimateOpacity(),
      scale: isAlternating
        ? 1
        : isCurrent || position === 1 || position === -1
        ? 1
        : 0.9,
      filter: "none",
      y: 0,
      textShadow: currentTextShadow,
    },
    exit: {
      opacity: 0,
      scale: 0.9,
      filter: "none",
      y: -10,
      textShadow: BASE_SHADOW,
    },
  };
};

export function LyricsDisplay({
  lines,
  originalLines,
  currentLine,
  isLoading,
  error,
  visible = true,
  videoVisible = true,
  alignment: alignmentOverride,
  chineseVariant: chineseVariantOverride,
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
  fontClassName = "font-geneva-12",
  containerStyle,
  onFuriganaLoadingChange,
  currentTimeMs,
  onSeekToTime,
}: LyricsDisplayProps) {
  // Read display settings from store (can be overridden by props)
  const {
    lyricsAlignment: storeAlignment,
    chineseVariant: storeChineseVariant,
    koreanDisplay: storeKoreanDisplay,
    japaneseFurigana: storeJapaneseFurigana,
    romanization: storeRomanization,
  } = useIpodStore(
    useShallow((s) => ({
      lyricsAlignment: s.lyricsAlignment,
      chineseVariant: s.chineseVariant,
      koreanDisplay: s.koreanDisplay,
      japaneseFurigana: s.japaneseFurigana,
      romanization: s.romanization,
    }))
  );

  // Use override props if provided, otherwise use store values
  const alignment = alignmentOverride ?? storeAlignment;
  const chineseVariant = chineseVariantOverride ?? storeChineseVariant;
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
    };
  }, [storeRomanization, japaneseFurigana, koreanDisplay]);

  const chineseConverter = useMemo(
    () => Converter({ from: "cn", to: "tw" }),
    []
  );

  // Determine if translation is active (showing translated lines alongside original)
  const hasTranslation = originalLines && lines !== originalLines;

  // Always use original lines for display and furigana
  const displayOriginalLines = originalLines || lines;

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

  // Use original lines for furigana fetching (furigana only applies to original Japanese text)
  const linesForFurigana = displayOriginalLines;

  // Fetch and manage furigana using the extracted hook
  const { renderWithFurigana, furiganaMap } = useFurigana({
    lines: linesForFurigana,
    isShowingOriginal: true, // Always showing original now
    romanization,
    onLoadingChange: onFuriganaLoadingChange,
  });

  const processText = (text: string) => {
    let processed = text;
    if (
      chineseVariant === ChineseVariant.Traditional &&
      isChineseText(processed)
    ) {
      processed = chineseConverter(processed);
    }
    // Note: Korean romanization is now handled via ruby rendering, not text replacement
    return processed;
  };

  // For word-level timing, we still need to track Korean romanization state
  const showKoreanRomanization = romanization.enabled && romanization.korean;

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
  const [altLines, setAltLines] = useState<LyricLine[]>(() =>
    computeAltVisibleLines(lines, currentLine)
  );

  // Track previous lines array to detect song/translation changes
  const prevLinesRef = useRef<LyricLine[]>(displayOriginalLines);

  // Update alternating lines - instantly on song/translation change, delayed for line transitions
  useEffect(() => {
    if (alignment !== LyricsAlignment.Alternating) return;

    // Check if lines array changed (new song or translation switch)
    const linesChanged = prevLinesRef.current !== displayOriginalLines;
    prevLinesRef.current = displayOriginalLines;

    // Instantly update on song load, translation switch, or initial state
    if (linesChanged || currentLine < 0) {
      setAltLines(computeAltVisibleLines(displayOriginalLines, currentLine));
      return;
    }

    // For normal line transitions within the same song, apply delay
    // Determine the duration of the new current line
    const clampedIdx = Math.min(Math.max(0, currentLine), displayOriginalLines.length - 1);
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

    // Use 20% of the line duration; clamp to a reasonable range to avoid extremes
    const delayMs = Math.max(20, Math.floor(rawDuration * 0.2));

    const timer = setTimeout(() => {
      setAltLines(computeAltVisibleLines(displayOriginalLines, currentLine));
    }, delayMs);

    return () => clearTimeout(timer);
  }, [alignment, displayOriginalLines, currentLine]);

  const nonAltVisibleLines = useMemo(() => {
    if (!displayOriginalLines.length) return [] as LyricLine[];

    // Handle initial display before any line is "current" (currentLine < 0)
    if (currentLine < 0) {
      // Show just the first line initially for both Center and FocusThree
      return displayOriginalLines.slice(0, 1).filter(Boolean) as LyricLine[];
    }

    if (alignment === LyricsAlignment.Center) {
      const clampedCurrentLine = Math.min(
        Math.max(0, currentLine),
        displayOriginalLines.length - 1
      );
      const currentActualLine = displayOriginalLines[clampedCurrentLine];
      return currentActualLine ? [currentActualLine] : [];
    }

    // FocusThree (prev, current, next)
    return displayOriginalLines.slice(Math.max(0, currentLine - 1), currentLine + 2);
  }, [displayOriginalLines, currentLine, alignment]);

  const visibleLines =
    alignment === LyricsAlignment.Alternating ? altLines : nonAltVisibleLines;

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
    if (!interactive || !touchStartRef.current) return;
    
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
        error="No lyrics available"
        bottomPaddingClass={bottomPaddingClass}
        textSizeClass={textSizeClass}
        fontClassName={fontClassName}
      />
    );

  return (
    <div
      className={`absolute inset-x-0 mx-auto top-0 left-0 right-0 bottom-0 w-full h-full overflow-hidden flex flex-col items-center justify-end ${gapClass} z-40 select-none no-select-gesture px-2 ${bottomPaddingClass}`}
      style={{
        ...(containerStyle || {}),
        pointerEvents: interactive ? "auto" : "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
      }}
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <AnimatePresence mode="popLayout">
        {visibleLines.map((line, index) => {
          const isCurrent = line === displayOriginalLines[currentLine];
          let position = 0;

          if (alignment === LyricsAlignment.Alternating) {
            position = isCurrent ? 0 : 1;
          } else {
            const currentActualIdx = displayOriginalLines.indexOf(displayOriginalLines[currentLine]);
            const lineActualIdx = displayOriginalLines.indexOf(line);
            position = lineActualIdx - currentActualIdx;
          }

          // Determine if line has word timings available (always check original lines)
          const hasWordTimings =
            line.wordTimings &&
            line.wordTimings.length > 0;

          // Determine if we should use animated word-level highlighting (only for current line)
          const shouldUseAnimatedWordTiming =
            hasWordTimings && isCurrent && currentTimeMs !== undefined;

          const variants = getVariants(
            position,
            alignment === LyricsAlignment.Alternating,
            isCurrent,
            hasWordTimings
          );
          // Ensure transitions are extra smooth during offset adjustments
          // For word-timing lines, use subtle fade; word highlights handle the main visual feedback
          const dynamicTransition = {
            ...ANIMATION_CONFIG.spring,
            opacity: hasWordTimings ? { duration: 0.15 } : ANIMATION_CONFIG.fade,
            textShadow: hasWordTimings ? { duration: 0.15 } : ANIMATION_CONFIG.fade,
            filter: ANIMATION_CONFIG.fade,
            duration: 0.15, // Faster transitions for smoother adjustment feedback
          };
          const lineTextAlign = getTextAlign(
            alignment,
            index,
            visibleLines.length
          );

          // Get translated text if translation is active
          // Try timestamp lookup first, then fall back to index-based lookup
          const lineIndex = displayOriginalLines.indexOf(line);
          const translatedText = hasTranslation 
            ? (translationMap.get(line.startTimeMs) || translationByIndex[lineIndex] || null)
            : null;

          // Determine translation size class based on textSizeClass
          // - Fullscreen (viewport units vw/vh or fullscreen-lyrics-text): use viewport-relative sizing
          // - Karaoke window (karaoke-lyrics-text): use container-relative sizing
          // - iPod window (text-[12px] default): use small fixed size
          const isFullscreenSize = textSizeClass.includes("vw") || textSizeClass.includes("vh") || textSizeClass.includes("fullscreen-lyrics-text");
          const isKaraokeSize = textSizeClass.includes("karaoke-lyrics-text");
          const translationSizeClass = isFullscreenSize 
            ? "lyrics-translation-fullscreen"
            : isKaraokeSize
            ? "lyrics-translation-karaoke"
            : "lyrics-translation-ipod";


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
              }}
            >
              {/* Original lyrics with karaoke highlighting */}
              <div
                className={`${textSizeClass} ${fontClassName} ${lineHeightClass} ${onSeekToTime && !hasWordTimings ? "cursor-pointer" : ""}`}
                onClick={onSeekToTime && !hasWordTimings ? (e) => { e.stopPropagation(); onSeekToTime(parseInt(line.startTimeMs, 10)); } : undefined}
              >
                {shouldUseAnimatedWordTiming ? (
                  <WordTimingHighlight
                    wordTimings={line.wordTimings!}
                    lineStartTimeMs={parseInt(line.startTimeMs, 10)}
                    currentTimeMs={currentTimeMs!}
                    processText={processText}
                    furiganaSegments={
                      romanization.enabled && romanization.japaneseFurigana
                        ? furiganaMap.get(line.startTimeMs)
                        : undefined
                    }
                    koreanRomanized={showKoreanRomanization}
                    japaneseRomaji={romanization.enabled && romanization.japaneseRomaji}
                    chinesePinyin={romanization.enabled && romanization.chinese}
                    onSeekToTime={onSeekToTime}
                  />
                ) : hasWordTimings ? (
                  <StaticWordRendering
                    wordTimings={line.wordTimings!}
                    processText={processText}
                    furiganaSegments={
                      romanization.enabled && romanization.japaneseFurigana
                        ? furiganaMap.get(line.startTimeMs)
                        : undefined
                    }
                    koreanRomanized={showKoreanRomanization}
                    japaneseRomaji={romanization.enabled && romanization.japaneseRomaji}
                    chinesePinyin={romanization.enabled && romanization.chinese}
                    lineStartTimeMs={parseInt(line.startTimeMs, 10)}
                    onSeekToTime={onSeekToTime}
                  />
                ) : (
                  // The hook's renderWithFurigana handles furigana + all romanization types
                  renderWithFurigana(line, processText(line.words))
                )}
              </div>
              {/* Translated subtitle (shown below original when translation is active) */}
              {/* Only show if translation differs from processed original (handles Traditional Chinese conversion) */}
              {translatedText && processText(translatedText) !== processText(line.words) && (
                <div 
                  className={`text-white ${fontClassName} ${translationSizeClass}`}
                  style={{
                    lineHeight: 1.1,
                    marginTop: 0,
                    opacity: 0.5,
                  }}
                >
                  {processText(translatedText)}
                </div>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
