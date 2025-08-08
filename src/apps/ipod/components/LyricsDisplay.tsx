import {
  LyricLine,
  LyricsAlignment,
  ChineseVariant,
  KoreanDisplay,
} from "@/types/lyrics";
import { motion, AnimatePresence } from "framer-motion";
import { useMemo, useRef, useState, useEffect } from "react";
import type { CSSProperties } from "react";
import { Converter } from "opencc-js";
import { convert as romanize } from "hangul-romanization";
import {
  loadDefaultJapaneseParser,
  loadDefaultSimplifiedChineseParser,
} from "budoux";

interface LyricsDisplayProps {
  lines: LyricLine[];
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
}) => (
  <div
    className={`absolute inset-x-0 top-0 left-0 right-0 bottom-0 pointer-events-none flex items-end justify-center z-40 ${bottomPaddingClass}`}
    style={{
      paddingLeft: "max(env(safe-area-inset-left), 0.5rem)",
      paddingRight: "max(env(safe-area-inset-right), 0.5rem)",
    }}
  >
    <div className={`${textSizeClass} ${fontClassName} shimmer opacity-60`}>
      Loading lyrics…
    </div>
  </div>
);

const TranslatingState = ({
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
    style={{
      paddingLeft: "max(env(safe-area-inset-left), 0.5rem)",
      paddingRight: "max(env(safe-area-inset-right), 0.5rem)",
    }}
  >
    <div className={`${textSizeClass} ${fontClassName} shimmer opacity-60`}>
      Translating lyrics…
    </div>
  </div>
);

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
    style={{
      paddingLeft: "max(env(safe-area-inset-left), 0.5rem)",
      paddingRight: "max(env(safe-area-inset-right), 0.5rem)",
    }}
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
    scale: 0.8,
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
  currentLine,
  isLoading,
  error,
  visible = true,
  videoVisible = true,
  alignment = LyricsAlignment.FocusThree,
  chineseVariant = ChineseVariant.Traditional,
  koreanDisplay = KoreanDisplay.Original,
  onAdjustOffset,
  isTranslating = false,
  textSizeClass = "text-[12px]",
  lineHeightClass = "leading-[1.1]",
  interactive = true,
  bottomPaddingClass = "pb-5",
  gapClass = "gap-2",
  fontClassName = "font-geneva-12",
  containerStyle,
}: LyricsDisplayProps) {
  const chineseConverter = useMemo(
    () => Converter({ from: "cn", to: "tw" }),
    []
  );
  const japaneseParser = useMemo(() => loadDefaultJapaneseParser(), []);
  const chineseParser = useMemo(() => loadDefaultSimplifiedChineseParser(), []);

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
    if (/[\u3000-\u9fff]/.test(processed)) {
      const parser = isChineseText(processed) ? chineseParser : japaneseParser;
      return parser.parse(processed).join("\u200b");
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

  // Update alternating lines with a short delay when currentLine changes
  useEffect(() => {
    if (alignment !== LyricsAlignment.Alternating) return;

    const timer = setTimeout(() => {
      setAltLines(computeAltVisibleLines(lines, currentLine));
    }, 250); // 250 ms delay before replacing finished line

    return () => clearTimeout(timer);
  }, [alignment, lines, currentLine]);

  const nonAltVisibleLines = useMemo(() => {
    if (!lines.length) return [] as LyricLine[];

    // Handle initial display before any line is "current" (currentLine < 0)
    if (currentLine < 0) {
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
  if (isTranslating)
    return (
      <TranslatingState
        bottomPaddingClass={bottomPaddingClass}
        textSizeClass={textSizeClass}
        fontClassName={fontClassName}
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

  return (
    <motion.div
      layout={alignment === LyricsAlignment.Alternating}
      transition={ANIMATION_CONFIG.spring}
      className={`absolute inset-x-0 mx-auto top-0 left-0 right-0 bottom-0 w-full h-full overflow-hidden flex flex-col items-center justify-end ${gapClass} z-40 select-none ${bottomPaddingClass}`}
      style={{
        ...(containerStyle || {}),
        pointerEvents: interactive ? "auto" : "none",
        paddingLeft: "max(env(safe-area-inset-left), 0.5rem)",
        paddingRight: "max(env(safe-area-inset-right), 0.5rem)",
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
              className={`${textSizeClass} ${fontClassName} ${lineHeightClass} whitespace-pre-wrap break-words max-w-full text-white`}
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
              {processText(line.words)}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </motion.div>
  );
}
