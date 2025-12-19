import {
  LyricLine,
  LyricWord,
  LyricsAlignment,
  ChineseVariant,
  KoreanDisplay,
  JapaneseFurigana,
} from "@/types/lyrics";
import { motion, AnimatePresence } from "framer-motion";
import { useMemo, useRef, useState, useEffect } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Converter } from "opencc-js";
import { convert as romanize } from "hangul-romanization";
import { useTranslation } from "react-i18next";
import { useIpodStore } from "@/stores/useIpodStore";
import { useFurigana, FuriganaSegment } from "@/hooks/useFurigana";
import { useShallow } from "zustand/react/shallow";

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
  textSizeClass = "text-[12px]",
  fontClassName = "font-geneva-12",
}: {
  bottomPaddingClass?: string;
  textSizeClass?: string;
  fontClassName?: string;
}) => {
  const { t } = useTranslation();

  return (
    <div
      className={`absolute inset-x-0 top-0 left-0 right-0 bottom-0 pointer-events-none flex items-end justify-center z-40 ${bottomPaddingClass}`}
    >
      <div className={`${textSizeClass} ${fontClassName} shimmer opacity-60`}>
        {t("apps.ipod.status.loadingLyrics")}
      </div>
    </div>
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
}) => (
  <div
    className={`absolute inset-x-0 top-0 left-0 right-0 bottom-0 pointer-events-none flex items-end justify-center z-40 ${bottomPaddingClass}`}
  >
    <div className={`text-white/70 ${textSizeClass} ${fontClassName}`}>
      {error || "Unable to load lyrics"}
    </div>
  </div>
);


/**
 * Render furigana segments as React nodes
 */
function renderFuriganaSegments(segments: FuriganaSegment[]): React.ReactNode {
  return (
    <>
      {segments.map((segment, index) => {
        if (segment.reading) {
          return (
            <ruby key={index} className="lyrics-furigana">
              {segment.text}
              <rp>(</rp>
              <rt className="lyrics-furigana-rt">{segment.reading}</rt>
              <rp>)</rp>
            </ruby>
          );
        }
        return <span key={index}>{segment.text}</span>;
      })}
    </>
  );
}

/**
 * Map furigana segments to individual words based on character positions
 * When a segment with reading spans multiple words, keeps it intact with the first word
 * Returns an array where each index corresponds to a word's furigana segments
 * Words whose characters were "borrowed" by a previous segment get null to indicate skip
 */
function mapWordsToFurigana(
  wordTimings: LyricWord[],
  furiganaSegments: FuriganaSegment[]
): (FuriganaSegment[] | null)[] {
  const result: (FuriganaSegment[] | null)[] = [];
  
  let segmentIndex = 0;
  let charInSegment = 0;
  // Track how many chars were "borrowed" from future words by a previous segment
  let charsBorrowedFromFuture = 0;
  
  for (const word of wordTimings) {
    // If this word's characters were already rendered by a previous word's furigana
    if (charsBorrowedFromFuture >= word.text.length) {
      charsBorrowedFromFuture -= word.text.length;
      result.push(null); // Signal to skip this word entirely
      continue;
    }
    
    // Partial borrow - skip some chars
    const effectiveWordLength = word.text.length - charsBorrowedFromFuture;
    charsBorrowedFromFuture = 0;
    
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
    
    result.push(wordFurigana);
  }
  
  return result;
}

/**
 * Single word with karaoke-style clip animation
 * Uses inline-grid with CSS classes for consistent text flow
 */
function AnimatedWord({
  word,
  timeIntoLine,
  content,
}: {
  word: LyricWord;
  timeIntoLine: number;
  content: React.ReactNode;
}) {
  const wordStartMs = word.startTimeMs;
  const wordDurationMs = word.durationMs;

  // Calculate progress through this word (0 to 1)
  let progress = 0;
  if (timeIntoLine >= wordStartMs) {
    if (wordDurationMs > 0) {
      progress = Math.min(1, (timeIntoLine - wordStartMs) / wordDurationMs);
    } else {
      progress = 1;
    }
  }

  // Gradient mask for soft feathered edge
  // Offset so that 0% progress shows nothing (gradient starts in negative space)
  const feather = 15; // Width of the soft edge in percentage
  const progressPercent = progress * (100 + feather) - feather;
  const gradientStart = progressPercent;
  const gradientEnd = progressPercent + feather;

  // Base shadow for text legibility (same as inactive lines)
  const baseShadow = "0 0 2px black, 0 0 2px black, 0 0 2px black";
  // Glow shadow for highlighted text - includes base shadow for legibility
  const glowShadow = "0 0 8px rgba(255,255,255,0.9), 0 0 2px black, 0 0 2px black, 0 0 2px black";

  return (
    <span className="lyrics-word-highlight">
      {/* Base layer - dimmed to match inactive line opacity */}
      <span className="opacity-50 lyrics-word-layer" style={{ textShadow: baseShadow }}>{content}</span>
      {/* Overlay layer - gradient mask for soft feathered edge with glow */}
      <span
        aria-hidden="true"
        className="lyrics-word-layer"
        style={{
          maskImage: `linear-gradient(to right, black ${gradientStart}%, transparent ${gradientEnd}%)`,
          WebkitMaskImage: `linear-gradient(to right, black ${gradientStart}%, transparent ${gradientEnd}%)`,
          textShadow: glowShadow,
        }}
      >
        {content}
      </span>
    </span>
  );
}

/**
 * Static word rendering without animation (for inactive lines with word timings)
 * Uses the same DOM structure as animated words for consistent line breaking
 */
function StaticWordRendering({
  wordTimings,
  processText,
  furiganaSegments,
}: {
  wordTimings: LyricWord[];
  processText: (text: string) => string;
  furiganaSegments?: FuriganaSegment[];
}): ReactNode {
  // Base shadow for text legibility (same as inactive lines)
  const baseShadow = "0 0 2px black, 0 0 2px black, 0 0 2px black";

  // When furigana is present, render with ruby elements
  if (furiganaSegments && furiganaSegments.length > 0) {
    const wordFuriganaList = mapWordsToFurigana(wordTimings, furiganaSegments);

    return (
      <>
        {wordTimings.map((word, idx) => {
          const wordFurigana = wordFuriganaList[idx];

          // Skip words whose characters were already rendered by a previous word's furigana
          if (wordFurigana === null) {
            return null;
          }

          const content =
            wordFurigana.length > 0
              ? renderFuriganaSegments(wordFurigana)
              : processText(word.text);

          return (
            <span key={`${idx}-${word.text}`} className="lyrics-word-highlight">
              <span className="lyrics-word-layer" style={{ textShadow: baseShadow }}>
                {content}
              </span>
            </span>
          );
        })}
      </>
    );
  }

  // No furigana - render each word in the same structure
  return (
    <>
      {wordTimings.map((word, idx) => (
        <span key={`${idx}-${word.text}`} className="lyrics-word-highlight">
          <span className="lyrics-word-layer" style={{ textShadow: baseShadow }}>
            {processText(word.text)}
          </span>
        </span>
      ))}
    </>
  );
}

/**
 * Renders a line with word-level timing highlights
 * Uses requestAnimationFrame for smooth updates
 */
function WordTimingHighlight({
  wordTimings,
  lineStartTimeMs,
  currentTimeMs,
  processText,
  furiganaSegments,
}: {
  wordTimings: LyricWord[];
  lineStartTimeMs: number;
  currentTimeMs: number;
  processText: (text: string) => string;
  furiganaSegments?: FuriganaSegment[];
}): ReactNode {
  // Track time for interpolation between prop updates
  const timeRef = useRef({
    propTime: currentTimeMs,
    propTimestamp: performance.now(),
    lastDisplayedTime: currentTimeMs, // Track last displayed time for monotonic guarantee
  });
  
  // Force re-render on each animation frame
  const [, forceUpdate] = useState(0);

  // Sync when currentTimeMs prop changes
  useEffect(() => {
    timeRef.current.propTime = currentTimeMs;
    timeRef.current.propTimestamp = performance.now();
  }, [currentTimeMs]);

  // High-frequency timer for smooth animation
  useEffect(() => {
    let animationFrameId: number;
    
    const tick = () => {
      forceUpdate(n => n + 1);
      animationFrameId = requestAnimationFrame(tick);
    };
    
    animationFrameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  // Interpolate time, but clamp to not go more than 500ms ahead of last prop
  const elapsed = performance.now() - timeRef.current.propTimestamp;
  const maxInterpolation = 500; // Don't interpolate more than 500ms ahead
  const clampedElapsed = Math.min(elapsed, maxInterpolation);
  const rawInterpolatedTime = timeRef.current.propTime + clampedElapsed;
  
  // MONOTONIC TIME FIX: Never allow time to decrease unless it's a significant jump (seek)
  // Small backward jumps (<500ms) are likely audio player jitter - hold current time
  // Large backward jumps (>=500ms) are likely intentional seeks - allow them
  const lastDisplayed = timeRef.current.lastDisplayedTime;
  const backwardAmount = lastDisplayed - rawInterpolatedTime;
  const isSignificantSeek = backwardAmount >= 500;
  const interpolatedTime = isSignificantSeek || rawInterpolatedTime >= lastDisplayed
    ? rawInterpolatedTime
    : lastDisplayed; // Hold at last displayed time to prevent jitter
  
  // Update last displayed time
  timeRef.current.lastDisplayedTime = interpolatedTime;
  
  // Calculate time elapsed since the start of this line
  const timeIntoLine = interpolatedTime - lineStartTimeMs;

  // When furigana is present, render per-word with clip effect
  if (furiganaSegments && furiganaSegments.length > 0) {
    const wordFuriganaList = mapWordsToFurigana(wordTimings, furiganaSegments);
    
    return (
      <>
        {wordTimings.map((word, idx) => {
          const wordFurigana = wordFuriganaList[idx];
          
          // Skip words whose characters were already rendered by a previous word's furigana
          if (wordFurigana === null) {
            return null;
          }
          
          const wordStartMs = word.startTimeMs;
          const wordDurationMs = word.durationMs;
          
          // Calculate progress through this word (0 to 1)
          let progress = 0;
          if (timeIntoLine >= wordStartMs) {
            if (wordDurationMs > 0) {
              progress = Math.min(1, (timeIntoLine - wordStartMs) / wordDurationMs);
            } else {
              progress = 1;
            }
          }
          
          // Gradient mask for soft feathered edge
          // Offset so that 0% progress shows nothing (gradient starts in negative space)
          const feather = 15;
          const progressPercent = progress * (100 + feather) - feather;
          const gradientStart = progressPercent;
          const gradientEnd = progressPercent + feather;
          
          const content = wordFurigana.length > 0
            ? renderFuriganaSegments(wordFurigana)
            : processText(word.text);
          
          // Base shadow for text legibility (same as inactive lines)
          const baseShadow = "0 0 2px black, 0 0 2px black, 0 0 2px black";
          // Glow shadow for highlighted text - includes base shadow for legibility
          const glowShadow = "0 0 8px rgba(255,255,255,0.9), 0 0 2px black, 0 0 2px black, 0 0 2px black";
          
          return (
            <span key={`${idx}-${word.text}`} className="lyrics-word-highlight">
              <span className="opacity-50 lyrics-word-layer" style={{ textShadow: baseShadow }}>{content}</span>
              {/* Overlay layer - gradient mask for soft feathered edge with glow */}
              <span
                aria-hidden="true"
                className="lyrics-word-layer"
                style={{
                  maskImage: `linear-gradient(to right, black ${gradientStart}%, transparent ${gradientEnd}%)`,
                  WebkitMaskImage: `linear-gradient(to right, black ${gradientStart}%, transparent ${gradientEnd}%)`,
                  textShadow: glowShadow,
                }}
              >
                {content}
              </span>
            </span>
          );
        })}
      </>
    );
  }

  // No furigana - render each word with individual karaoke effect
  return (
    <>
      {wordTimings.map((word, idx) => (
        <AnimatedWord
          key={`${idx}-${word.text}`}
          word={word}
          timeIntoLine={timeIntoLine}
          content={processText(word.text)}
        />
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
  const currentTextShadow = isCurrent && !hasWordTiming
    ? "0 0 8px rgba(255,255,255,0.9), 0 0 2px black, 0 0 2px black, 0 0 2px black"
    : "0 0 2px black, 0 0 2px black, 0 0 2px black";
  
  return {
    initial: {
      opacity: 0,
      scale: 0.93,
      filter: "none",
      y: 10,
      textShadow:
        "0 0 2px black, 0 0 2px black, 0 0 2px black, 0 0 0px rgba(255,255,255,0)",
    },
    animate: {
      opacity: isAlternating
        ? isCurrent
          ? 1
          : 0.5
        : isCurrent
        ? 1
        : position === 1 || position === -1
        ? 0.5
        : 0.1,
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
      textShadow:
        "0 0 2px black, 0 0 2px black, 0 0 2px black, 0 0 0px rgba(255,255,255,0)",
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
}: LyricsDisplayProps) {
  // Read display settings from store (can be overridden by props)
  const {
    lyricsAlignment: storeAlignment,
    chineseVariant: storeChineseVariant,
    koreanDisplay: storeKoreanDisplay,
    japaneseFurigana: storeJapaneseFurigana,
  } = useIpodStore(
    useShallow((s) => ({
      lyricsAlignment: s.lyricsAlignment,
      chineseVariant: s.chineseVariant,
      koreanDisplay: s.koreanDisplay,
      japaneseFurigana: s.japaneseFurigana,
    }))
  );

  // Use override props if provided, otherwise use store values
  const alignment = alignmentOverride ?? storeAlignment;
  const chineseVariant = chineseVariantOverride ?? storeChineseVariant;
  const koreanDisplay = koreanDisplayOverride ?? storeKoreanDisplay;
  const japaneseFurigana = japaneseFuriganaOverride ?? storeJapaneseFurigana;

  const chineseConverter = useMemo(
    () => Converter({ from: "cn", to: "tw" }),
    []
  );

  // Determine if we're showing original lyrics (not translations)
  // Furigana should only be applied to original Japanese lyrics
  const isShowingOriginal = !originalLines || lines === originalLines;

  // Use original lines for furigana fetching (furigana only applies to original Japanese text)
  const linesForFurigana = originalLines || lines;

  // Fetch and manage furigana using the extracted hook
  const { renderWithFurigana, furiganaMap } = useFurigana({
    lines: linesForFurigana,
    enabled: japaneseFurigana === JapaneseFurigana.On,
    isShowingOriginal,
    onLoadingChange: onFuriganaLoadingChange,
  });

  const isChineseText = (text: string) => {
    const chineseRegex = /[\u4E00-\u9FFF]/;
    const japaneseRegex = /[\u3040-\u309F\u30A0-\u30FF]/;
    return chineseRegex.test(text) && !japaneseRegex.test(text);
  };

  const processText = (text: string) => {
    let processed = text;
    if (
      chineseVariant === ChineseVariant.Traditional &&
      isChineseText(processed)
    ) {
      processed = chineseConverter(processed);
    }
    if (koreanDisplay === KoreanDisplay.Romanized) {
      if (/[\u3131-\u314e\u314f-\u3163\uac00-\ud7a3]/.test(processed)) {
        processed = romanize(processed);
      }
    }
    return processed;
  };

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
  const prevLinesRef = useRef<LyricLine[]>(lines);

  // Update alternating lines - instantly on song/translation change, delayed for line transitions
  useEffect(() => {
    if (alignment !== LyricsAlignment.Alternating) return;

    // Check if lines array changed (new song or translation switch)
    const linesChanged = prevLinesRef.current !== lines;
    prevLinesRef.current = lines;

    // Instantly update on song load, translation switch, or initial state
    if (linesChanged || currentLine < 0) {
      setAltLines(computeAltVisibleLines(lines, currentLine));
      return;
    }

    // For normal line transitions within the same song, apply delay
    // Determine the duration of the new current line
    const clampedIdx = Math.min(Math.max(0, currentLine), lines.length - 1);
    const currentStart =
      clampedIdx >= 0 && lines[clampedIdx]
        ? parseInt(lines[clampedIdx].startTimeMs)
        : null;
    const nextStart =
      clampedIdx + 1 < lines.length && lines[clampedIdx + 1]
        ? parseInt(lines[clampedIdx + 1].startTimeMs)
        : null;

    const rawDuration =
      currentStart !== null && nextStart !== null ? nextStart - currentStart : 0;

    // Use 20% of the line duration; clamp to a reasonable range to avoid extremes
    const delayMs = Math.max(20, Math.floor(rawDuration * 0.2));

    const timer = setTimeout(() => {
      setAltLines(computeAltVisibleLines(lines, currentLine));
    }, delayMs);

    return () => clearTimeout(timer);
  }, [alignment, lines, currentLine]);

  const nonAltVisibleLines = useMemo(() => {
    if (!lines.length) return [] as LyricLine[];

    // Handle initial display before any line is "current" (currentLine < 0)
    if (currentLine < 0) {
      // Show just the first line initially for both Center and FocusThree
      return lines.slice(0, 1).filter(Boolean) as LyricLine[];
    }

    if (alignment === LyricsAlignment.Center) {
      const clampedCurrentLine = Math.min(
        Math.max(0, currentLine),
        lines.length - 1
      );
      const currentActualLine = lines[clampedCurrentLine];
      return currentActualLine ? [currentActualLine] : [];
    }

    // FocusThree (prev, current, next)
    return lines.slice(Math.max(0, currentLine - 1), currentLine + 2);
  }, [lines, currentLine, alignment]);

  const visibleLines =
    alignment === LyricsAlignment.Alternating ? altLines : nonAltVisibleLines;

  const lastTouchY = useRef<number | null>(null);

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!interactive || !onAdjustOffset || !videoVisible) return;
    const delta = e.deltaY;
    const step = 50; // 50 ms per scroll step (was 200)
    const change = delta > 0 ? step : -step;
    onAdjustOffset(change);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (e.touches.length === 1) {
      lastTouchY.current = e.touches[0].clientY;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (lastTouchY.current === null || !onAdjustOffset || !videoVisible) return;
    const currentY = e.touches[0].clientY;
    const dy = currentY - lastTouchY.current;
    if (Math.abs(dy) > 10) {
      // Threshold to start adjustment
      const step = 50; // 50 ms per swipe (was 200)
      const change = dy > 0 ? step : -step; // Inverted: swipe down = lyrics later (positive offset), swipe up = lyrics earlier (negative offset)
      onAdjustOffset(change);
      lastTouchY.current = currentY;
    }
  };

  if (!visible) return null;
  if (isLoading)
    return (
      <LoadingState
        bottomPaddingClass={bottomPaddingClass}
        textSizeClass={textSizeClass}
        fontClassName={fontClassName}
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
  if (!lines.length && !isLoading && !isTranslating)
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
      className={`absolute inset-x-0 mx-auto top-0 left-0 right-0 bottom-0 w-full h-full overflow-hidden flex flex-col items-center justify-end ${gapClass} z-40 select-none no-select-gesture px-0 ${bottomPaddingClass}`}
      style={{
        ...(containerStyle || {}),
        pointerEvents: interactive ? "auto" : "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
      }}
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
    >
      <AnimatePresence mode="popLayout">
        {visibleLines.map((line, index) => {
          const isCurrent = line === lines[currentLine];
          let position = 0;

          if (alignment === LyricsAlignment.Alternating) {
            position = isCurrent ? 0 : 1;
          } else {
            const currentActualIdx = lines.indexOf(lines[currentLine]);
            const lineActualIdx = lines.indexOf(line);
            position = lineActualIdx - currentActualIdx;
          }

          // Determine if line has word timings available
          const hasWordTimings =
            isShowingOriginal &&
            line.wordTimings &&
            line.wordTimings.length > 0;

          // Determine if we should use animated word-level highlighting (only for current line)
          const shouldUseAnimatedWordTiming =
            hasWordTimings && isCurrent && currentTimeMs !== undefined;

          const variants = getVariants(
            position,
            alignment === LyricsAlignment.Alternating,
            isCurrent,
            shouldUseAnimatedWordTiming
          );
          // Ensure transitions are extra smooth during offset adjustments
          // For word-timing lines, make opacity/textShadow instant to prevent flash during transition
          const dynamicTransition = {
            ...ANIMATION_CONFIG.spring,
            opacity: shouldUseAnimatedWordTiming ? { duration: 0 } : ANIMATION_CONFIG.fade,
            textShadow: shouldUseAnimatedWordTiming ? { duration: 0 } : ANIMATION_CONFIG.fade,
            filter: ANIMATION_CONFIG.fade,
            duration: 0.15, // Faster transitions for smoother adjustment feedback
          };
          const lineTextAlign = getTextAlign(
            alignment,
            index,
            visibleLines.length
          );

          return (
            <motion.div
              key={line.startTimeMs}
              layout="position"
              initial="initial"
              animate="animate"
              exit="exit"
              variants={variants}
              transition={dynamicTransition}
              className={`px-2 md:px-6 ${textSizeClass} ${fontClassName} ${lineHeightClass} whitespace-pre-wrap break-words max-w-full text-white`}
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
              {shouldUseAnimatedWordTiming ? (
                <WordTimingHighlight
                  wordTimings={line.wordTimings!}
                  lineStartTimeMs={parseInt(line.startTimeMs, 10)}
                  currentTimeMs={currentTimeMs!}
                  processText={processText}
                  furiganaSegments={
                    japaneseFurigana === JapaneseFurigana.On
                      ? furiganaMap.get(line.startTimeMs)
                      : undefined
                  }
                />
              ) : hasWordTimings ? (
                <StaticWordRendering
                  wordTimings={line.wordTimings!}
                  processText={processText}
                  furiganaSegments={
                    japaneseFurigana === JapaneseFurigana.On
                      ? furiganaMap.get(line.startTimeMs)
                      : undefined
                  }
                />
              ) : (
                renderWithFurigana(line, processText(line.words))
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
