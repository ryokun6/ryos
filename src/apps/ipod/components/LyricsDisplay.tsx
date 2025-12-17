import {
  LyricLine,
  LyricsAlignment,
  ChineseVariant,
  KoreanDisplay,
  JapaneseFurigana,
} from "@/types/lyrics";
import { motion, AnimatePresence } from "framer-motion";
import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import type { CSSProperties } from "react";
import { Converter } from "opencc-js";
import { convert as romanize } from "hangul-romanization";
import { useTranslation } from "react-i18next";
import { getApiUrl } from "@/utils/platform";
import { ActivityIndicator } from "@/components/ui/activity-indicator";

// Type for furigana segments from API
interface FuriganaSegment {
  text: string;
  reading?: string;
}

// Types for SSE streaming events from furigana API
interface FuriganaChunkEvent {
  type: "chunk";
  chunkIndex: number;
  totalChunks: number;
  startIndex: number;
  annotatedLines: FuriganaSegment[][];
}

interface FuriganaCompleteEvent {
  type: "complete";
  totalLines: number;
}

interface FuriganaErrorEvent {
  type: "error";
  message: string;
}

type FuriganaSSEEvent = FuriganaChunkEvent | FuriganaCompleteEvent | FuriganaErrorEvent;

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
  alignment?: LyricsAlignment;
  chineseVariant?: ChineseVariant;
  koreanDisplay?: KoreanDisplay;
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
  /** Optional tailwind class for loading spinner size (defaults to "w-4 h-4") */
  spinnerSizeClass?: string;
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

// Processing indicator shown in top-right when translating or fetching furigana
const ProcessingIndicator = ({ sizeClass = "w-5 h-5" }: { sizeClass?: string }) => {
  // Parse the size from sizeClass (e.g., "w-4 h-4" -> 16, "w-[min(5vw,5vh)]" -> use md)
  const getSize = (): number | "sm" | "md" | "lg" => {
    const match = sizeClass.match(/w-(\d+)/);
    if (match) {
      const twSize = parseInt(match[1], 10);
      return twSize * 4; // Tailwind w-4 = 16px
    }
    return "md";
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ duration: 0.2 }}
      className="absolute top-[13px] right-3 pointer-events-none z-50"
    >
      <ActivityIndicator
        size={getSize()}
        className={`${sizeClass} text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]`}
      />
    </motion.div>
  );
};

const LoadingState = ({
  bottomPaddingClass = "pb-5",
  textSizeClass = "text-[12px]",
  fontClassName = "font-geneva-12",
  spinnerSizeClass = "w-5 h-5",
}: {
  bottomPaddingClass?: string;
  textSizeClass?: string;
  fontClassName?: string;
  spinnerSizeClass?: string;
}) => {
  const { t } = useTranslation();
  
  // Parse the size from sizeClass (e.g., "w-4 h-4" -> 16, "w-[min(5vw,5vh)]" -> use md)
  const getSize = (): number | "sm" | "md" | "lg" => {
    const match = spinnerSizeClass.match(/w-(\d+)/);
    if (match) {
      const twSize = parseInt(match[1], 10);
      return twSize * 4; // Tailwind w-4 = 16px
    }
    return "md";
  };

  return (
    <>
      {/* Spinner in top-right corner */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        transition={{ duration: 0.2 }}
        className="absolute top-[13px] right-3 pointer-events-none z-50"
      >
        <ActivityIndicator
          size={getSize()}
          className={`${spinnerSizeClass} text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]`}
        />
      </motion.div>
      <div
        className={`absolute inset-x-0 top-0 left-0 right-0 bottom-0 pointer-events-none flex items-end justify-center z-40 ${bottomPaddingClass}`}
      >
        <div className={`${textSizeClass} ${fontClassName} shimmer opacity-60`}>
          {t("apps.ipod.status.loadingLyrics")}
        </div>
      </div>
    </>
  );
};

const ErrorState = ({
  bottomPaddingClass = "pb-5",
  textSizeClass = "text-[12px]",
  fontClassName = "font-geneva-12",
}: {
  bottomPaddingClass?: string;
  textSizeClass?: string;
  fontClassName?: string;
}) => (
  <div
    className={`absolute inset-x-0 top-0 left-0 right-0 bottom-0 pointer-events-none flex items-end justify-center z-40 ${bottomPaddingClass}`}
  >
    <div className={`text-white/70 ${textSizeClass} ${fontClassName}`}></div>
  </div>
);

const getVariants = (
  position: number,
  isAlternating: boolean,
  isCurrent: boolean
) => ({
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
    textShadow: isCurrent
      ? "0 0 8px rgba(255,255,255,0.9), 0 0 2px black, 0 0 2px black, 0 0 2px black"
      : "0 0 2px black, 0 0 2px black, 0 0 2px black",
  },
  exit: {
    opacity: 0,
    scale: 0.9,
    filter: "none",
    y: -10,
    textShadow:
      "0 0 2px black, 0 0 2px black, 0 0 2px black, 0 0 0px rgba(255,255,255,0)",
  },
});

export function LyricsDisplay({
  lines,
  originalLines,
  currentLine,
  isLoading,
  error,
  visible = true,
  videoVisible = true,
  alignment = LyricsAlignment.FocusThree,
  chineseVariant = ChineseVariant.Traditional,
  koreanDisplay = KoreanDisplay.Original,
  japaneseFurigana = JapaneseFurigana.On,
  onAdjustOffset,
  isTranslating = false,
  textSizeClass = "text-[12px]",
  lineHeightClass = "leading-[1.1]",
  interactive = true,
  bottomPaddingClass = "pb-5",
  gapClass = "gap-2",
  fontClassName = "font-geneva-12",
  containerStyle,
  spinnerSizeClass = "w-5 h-5",
}: LyricsDisplayProps) {
  const chineseConverter = useMemo(
    () => Converter({ from: "cn", to: "tw" }),
    []
  );

  // State for furigana annotations
  const [furiganaMap, setFuriganaMap] = useState<Map<string, FuriganaSegment[]>>(
    new Map()
  );
  const furiganaCacheKeyRef = useRef<string>("");
  const [isFetchingFurigana, setIsFetchingFurigana] = useState(false);

  // Determine if we're showing original lyrics (not translations)
  // Furigana should only be applied to original Japanese lyrics
  const isShowingOriginal = !originalLines || lines === originalLines;

  // Check if text is Japanese (contains kanji AND hiragana/katakana)
  // This distinguishes Japanese from Chinese (which only has hanzi, no kana)
  const isJapaneseText = useCallback((text: string): boolean => {
    const hasKanji = /[\u4E00-\u9FFF]/.test(text);
    const hasKana = /[\u3040-\u309F\u30A0-\u30FF]/.test(text); // Hiragana or Katakana
    return hasKanji && hasKana;
  }, []);

  // Use original lines for furigana fetching (furigana only applies to original Japanese text)
  const linesForFurigana = originalLines || lines;

  // Fetch furigana for original lines when enabled - now handles streaming responses
  useEffect(() => {
    if (japaneseFurigana !== JapaneseFurigana.On || linesForFurigana.length === 0) {
      setIsFetchingFurigana(false);
      return;
    }

    // Check if any lines are Japanese text (has both kanji and kana)
    const hasJapanese = linesForFurigana.some((line) => isJapaneseText(line.words));
    if (!hasJapanese) {
      setIsFetchingFurigana(false);
      return;
    }

    // Create cache key from original lines
    const cacheKey = JSON.stringify(linesForFurigana.map((l) => l.startTimeMs + l.words));
    if (cacheKey === furiganaCacheKeyRef.current) {
      setIsFetchingFurigana(false);
      return; // Already fetched for these lines
    }

    const controller = new AbortController();
    setIsFetchingFurigana(true);

    const MAX_RETRIES = 3;
    const INITIAL_DELAY = 1000; // 1 second

    const handleStreamingResponse = async (res: Response): Promise<void> => {
      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      const decoder = new TextDecoder();
      let buffer = "";
      // Use a progressive map that gets updated with each chunk
      const progressiveMap = new Map<string, FuriganaSegment[]>();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (controller.signal.aborted) {
          reader.cancel();
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const eventData = JSON.parse(line.slice(6)) as FuriganaSSEEvent;
              
              if (eventData.type === "chunk") {
                // Update the progressive map with this chunk's data
                eventData.annotatedLines.forEach((segments, index) => {
                  const globalIndex = eventData.startIndex + index;
                  if (globalIndex < linesForFurigana.length) {
                    const lineKey = linesForFurigana[globalIndex].startTimeMs;
                    progressiveMap.set(lineKey, segments);
                  }
                });

                // Update state with progressive results
                if (!controller.signal.aborted) {
                  setFuriganaMap(new Map(progressiveMap));
                }
              } else if (eventData.type === "complete") {
                // Ensure final state is set
                if (!controller.signal.aborted) {
                  setFuriganaMap(new Map(progressiveMap));
                  furiganaCacheKeyRef.current = cacheKey;
                  setIsFetchingFurigana(false);
                }
              } else if (eventData.type === "error") {
                throw new Error(eventData.message);
              }
            } catch (parseError) {
              console.warn("Failed to parse furigana SSE event:", parseError);
            }
          }
        }
      }
    };

    const handleNonStreamingResponse = async (res: Response): Promise<void> => {
      const data: { annotatedLines: FuriganaSegment[][] } = await res.json();
      const newMap = new Map<string, FuriganaSegment[]>();
      linesForFurigana.forEach((line, index) => {
        if (data.annotatedLines[index]) {
          newMap.set(line.startTimeMs, data.annotatedLines[index]);
        }
      });
      setFuriganaMap(newMap);
      furiganaCacheKeyRef.current = cacheKey;
      setIsFetchingFurigana(false);
    };

    const fetchWithRetry = async (attempt: number): Promise<void> => {
      try {
        const res = await fetch(getApiUrl("/api/furigana"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lines: linesForFurigana }),
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(`Failed to fetch furigana (status ${res.status})`);
        }

        // Check if this is a streaming response (text/event-stream)
        const contentType = res.headers.get("content-type") || "";
        
        if (contentType.includes("text/event-stream")) {
          // Handle streaming response
          await handleStreamingResponse(res);
        } else {
          // Handle non-streaming response (small requests or cached)
          await handleNonStreamingResponse(res);
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          // Request was aborted, don't retry
          return;
        }

        if (attempt < MAX_RETRIES) {
          // Exponential backoff: 1s, 2s, 4s
          const delay = INITIAL_DELAY * Math.pow(2, attempt - 1);
          console.warn(`Furigana fetch attempt ${attempt} failed, retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          
          // Check if aborted during delay
          if (controller.signal.aborted) return;
          
          return fetchWithRetry(attempt + 1);
        }

        console.error("Failed to fetch furigana after all retries:", err);
        setIsFetchingFurigana(false);
      }
    };

    fetchWithRetry(1);

    return () => {
      controller.abort();
    };
  }, [linesForFurigana, japaneseFurigana, isJapaneseText]);

  // Render text with furigana using ruby elements
  // Only applies furigana when showing original lyrics (not translations)
  const renderWithFurigana = useCallback(
    (line: LyricLine, processedText: string): React.ReactNode => {
      // Don't apply furigana if disabled or if we're showing translations
      if (japaneseFurigana !== JapaneseFurigana.On || !isShowingOriginal) {
        return processedText;
      }

      const segments = furiganaMap.get(line.startTimeMs);
      if (!segments || segments.length === 0) {
        return processedText;
      }

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
    },
    [japaneseFurigana, furiganaMap, isShowingOriginal]
  );

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

  // Update alternating lines using a percentage of the new line's duration
  useEffect(() => {
    if (alignment !== LyricsAlignment.Alternating) return;

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
        spinnerSizeClass={spinnerSizeClass}
      />
    );
  if (error)
    return (
      <ErrorState
        bottomPaddingClass={bottomPaddingClass}
        textSizeClass={textSizeClass}
        fontClassName={fontClassName}
      />
    );
  if (!lines.length && !isLoading && !isTranslating)
    return (
      <ErrorState
        bottomPaddingClass={bottomPaddingClass}
        textSizeClass={textSizeClass}
        fontClassName={fontClassName}
      />
    );

  // Check if any processing is happening
  const isProcessing = isTranslating || isFetchingFurigana;

  return (
    <>
      {/* Processing indicator in top-left corner */}
      <AnimatePresence>
        {isProcessing && <ProcessingIndicator sizeClass={spinnerSizeClass} />}
      </AnimatePresence>
      <motion.div
      layout={alignment === LyricsAlignment.Alternating}
      transition={ANIMATION_CONFIG.spring}
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

          const variants = getVariants(
            position,
            alignment === LyricsAlignment.Alternating,
            isCurrent
          );
          // Ensure transitions are extra smooth during offset adjustments
          const dynamicTransition = {
            ...ANIMATION_CONFIG.spring,
            opacity: ANIMATION_CONFIG.fade,
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
              layoutId={`${line.startTimeMs}-${line.words.substring(0, 10)}`}
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
              {renderWithFurigana(line, processText(line.words))}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </motion.div>
    </>
  );
}
