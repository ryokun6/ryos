import { useEffect, useRef, useMemo, useCallback, memo, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Minus, Plus, ChevronsDown, Search } from "lucide-react";
import type { LyricLine, RomanizationSettings } from "@/types/lyrics";
import { ChineseVariant } from "@/types/lyrics";
import { convert as romanizeKorean } from "hangul-romanization";
import { pinyin } from "pinyin-pro";
import { toRomaji } from "wanakana";
import { Converter } from "opencc-js";
import {
  hasKoreanText,
  isChineseText,
  hasKanaTextLocal,
  KOREAN_REGEX,
  CHINESE_REGEX,
  FuriganaSegment,
} from "@/utils/romanization";
import { parseLyricTimestamps, findCurrentLineIndex } from "@/utils/lyricsSearch";
import { useIpodStore } from "@/stores/useIpodStore";
import { useShallow } from "zustand/react/shallow";

// Simplified to Traditional Chinese converter
const simplifiedToTraditional = Converter({ from: "cn", to: "tw" });

// Memoized lyric line component to prevent unnecessary re-renders
const LyricLineItem = memo(function LyricLineItem({
  line,
  index,
  isCurrent,
  isPast,
  romanizedText,
  displayText,
  onClick,
  setRef,
}: {
  line: LyricLine;
  index: number;
  isCurrent: boolean;
  isPast: boolean;
  romanizedText: string | null;
  displayText: string;
  onClick: () => void;
  setRef: (el: HTMLButtonElement | null) => void;
}) {
  return (
    <button
      type="button"
      key={`${line.startTimeMs}-${index}`}
      ref={setRef}
      onClick={onClick}
      className={cn(
        "w-full text-left py-2 px-3 rounded-xl",
        "hover:bg-white/10 active:bg-white/20",
        "focus:outline-none focus:ring-2 focus:ring-white/30 focus:ring-offset-0",
        isCurrent && "bg-white/20 text-white font-semibold",
        isPast && !isCurrent && "text-white/40",
        !isPast && !isCurrent && "text-white/60"
      )}
    >
      <div className="text-base leading-relaxed">
        {displayText || (
          <span className="italic opacity-50">♪</span>
        )}
      </div>
      {romanizedText && (
        <div className="text-xs opacity-60 mt-0.5">
          {romanizedText}
        </div>
      )}
    </button>
  );
});

export interface LyricsSyncModeProps {
  /** All lyrics lines for the current track */
  lines: LyricLine[];
  /** Current playback time in milliseconds (without offset applied) */
  currentTimeMs: number;
  /** Total duration in milliseconds */
  durationMs: number;
  /** Current offset in milliseconds */
  currentOffset: number;
  /** Romanization settings */
  romanization: RomanizationSettings;
  /** Furigana map for Japanese romaji (startTimeMs -> FuriganaSegment[]) */
  furiganaMap?: Map<string, FuriganaSegment[]>;
  /** Callback to set the new offset */
  onSetOffset: (offsetMs: number) => void;
  /** Callback to adjust offset by a delta */
  onAdjustOffset: (deltaMs: number) => void;
  /** Callback to seek to a specific time */
  onSeek: (timeMs: number) => void;
  /** Callback to close the sync mode */
  onClose: () => void;
  /** Callback to open lyrics search dialog */
  onSearchLyrics?: () => void;
}

/**
 * Format offset in milliseconds to a human-readable string
 */
function formatOffset(ms: number): string {
  const sign = ms >= 0 ? "+" : "";
  return `${sign}${(ms / 1000).toFixed(2)}s`;
}

/**
 * Format time in milliseconds to mm:ss
 */
function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Convert furigana segments to plain romaji text
 * Uses the reading (furigana) for kanji, converts kana directly
 */
function furiganaSegmentsToRomaji(segments: FuriganaSegment[]): string {
  return segments
    .map((seg) => {
      // If there's a reading (furigana for kanji), convert it to romaji
      if (seg.reading) {
        return toRomaji(seg.reading);
      }
      // Otherwise, check if the text itself is kana and convert it
      if (hasKanaTextLocal(seg.text)) {
        return toRomaji(seg.text);
      }
      // Keep non-Japanese characters as-is (spaces, punctuation, etc.)
      return seg.text;
    })
    .join("");
}

/**
 * Get plain text romanization for a line based on detected language
 * Returns null if no romanization applies
 */
function getRomanizedText(
  text: string,
  romanization: RomanizationSettings,
  furiganaSegments?: FuriganaSegment[]
): string | null {
  if (!romanization.enabled || !text) return null;

  // Check for Korean text
  if (romanization.korean && hasKoreanText(text)) {
    // Romanize only Korean parts, keep other characters
    KOREAN_REGEX.lastIndex = 0;
    return text.replace(KOREAN_REGEX, (match) => romanizeKorean(match));
  }

  // Check for Japanese romaji - use furigana segments if available
  if (romanization.japaneseRomaji) {
    if (furiganaSegments && furiganaSegments.length > 0) {
      // Use furigana data for accurate kanji readings
      return furiganaSegmentsToRomaji(furiganaSegments);
    }
    // Fallback: only convert kana (no kanji readings available)
    if (hasKanaTextLocal(text)) {
      // For text without furigana, we can only romanize the kana parts
      // Kanji will be kept as-is since we don't have readings
      return null; // Don't show partial romaji without kanji readings
    }
  }

  // Check for Chinese text (pinyin)
  if (romanization.chinese && isChineseText(text)) {
    // Get pinyin for the whole text
    CHINESE_REGEX.lastIndex = 0;
    return text.replace(CHINESE_REGEX, (match) => 
      pinyin(match, { type: 'string', toneType: 'none', separator: '' })
    );
  }

  return null;
}

/**
 * Interactive "Tap to Sync" mode for calibrating lyrics offset.
 * Shows a scrollable list of all lyrics lines with the current line highlighted.
 * User taps the line they're hearing to automatically calculate and set the offset.
 * 
 * This component is designed to be contained within a WindowFrame.
 */
export function LyricsSyncMode({
  lines,
  currentTimeMs,
  durationMs,
  currentOffset,
  romanization,
  furiganaMap,
  onSetOffset,
  onAdjustOffset,
  onSeek,
  onClose,
  onSearchLyrics,
}: LyricsSyncModeProps) {
  const { t } = useTranslation();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLButtonElement | null)[]>([]);
  
  // Auto-scroll state
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);
  
  // Offset adjustment step in ms
  const OFFSET_STEP = 100;

  // Read Chinese variant setting from store
  const { chineseVariant } = useIpodStore(
    useShallow((s) => ({
      chineseVariant: s.chineseVariant,
    }))
  );

  // Pre-parse timestamps once for binary search (O(n) once, not on every time update)
  const parsedTimestamps = useMemo(
    () => parseLyricTimestamps(lines),
    [lines]
  );

  // Calculate which line should be highlighted using binary search O(log n)
  const currentLineIndex = useMemo(() => {
    if (!lines.length) return -1;
    const adjustedTime = currentTimeMs + currentOffset;
    return findCurrentLineIndex(parsedTimestamps, adjustedTime);
  }, [parsedTimestamps, lines.length, currentTimeMs, currentOffset]);

  // Handle line tap - calculate new offset so this line plays at current time
  const handleLineTap = useCallback(
    (line: LyricLine) => {
      const lineStartMs = parseInt(line.startTimeMs, 10);
      // new_offset = line_start_time - current_playback_time
      // This means: "The line I tapped should be playing right now"
      const newOffset = lineStartMs - currentTimeMs;
      onSetOffset(newOffset);
    },
    [currentTimeMs, onSetOffset]
  );

  // Track last scrolled line to avoid redundant scrolls
  const lastScrolledLineRef = useRef<number>(-1);
  
  // Auto-scroll to keep current line visible (centered) - throttled
  useEffect(() => {
    if (
      isAutoScrollEnabled &&
      currentLineIndex >= 0 && 
      currentLineIndex !== lastScrolledLineRef.current &&
      lineRefs.current[currentLineIndex]
    ) {
      lastScrolledLineRef.current = currentLineIndex;
      lineRefs.current[currentLineIndex]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [currentLineIndex, isAutoScrollEnabled]);

  // Detect user scroll via wheel/touch events (these only fire from actual user interaction)
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleUserScroll = () => {
      setIsAutoScrollEnabled(false);
    };

    // wheel event only fires from mouse wheel / trackpad
    container.addEventListener("wheel", handleUserScroll, { passive: true });
    // touchmove fires when user drags on touch devices
    container.addEventListener("touchmove", handleUserScroll, { passive: true });
    
    return () => {
      container.removeEventListener("wheel", handleUserScroll);
      container.removeEventListener("touchmove", handleUserScroll);
    };
  }, []);

  // Resume auto-scroll and immediately scroll to current line
  const handleResumeAutoScroll = useCallback(() => {
    setIsAutoScrollEnabled(true);
    lastScrolledLineRef.current = -1; // Force scroll on next update
    // Immediately scroll to current line
    if (currentLineIndex >= 0 && lineRefs.current[currentLineIndex]) {
      lineRefs.current[currentLineIndex]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [currentLineIndex]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Initialize refs array
  useEffect(() => {
    lineRefs.current = lineRefs.current.slice(0, lines.length);
  }, [lines.length]);

  // Pre-compute romanized text for all lines (only when lines/romanization/furiganaMap change)
  const romanizedTexts = useMemo(() => {
    if (!romanization.enabled) return new Map<number, string | null>();
    
    const map = new Map<number, string | null>();
    lines.forEach((line, index) => {
      const furiganaSegments = furiganaMap?.get(line.startTimeMs);
      map.set(index, getRomanizedText(line.words, romanization, furiganaSegments));
    });
    return map;
  }, [lines, romanization, furiganaMap]);

  // Pre-compute display text for all lines (Chinese variant conversion)
  // Convert Chinese to Traditional if setting is enabled, but skip if text contains Japanese kana
  const displayTexts = useMemo(() => {
    const map = new Map<number, string>();
    lines.forEach((line, index) => {
      let text = line.words;
      // Only convert if:
      // 1. Chinese variant is Traditional
      // 2. Text is Chinese (has CJK characters, no kana, no hangul)
      // 3. Text doesn't contain Japanese kana (extra safety check)
      if (
        chineseVariant === ChineseVariant.Traditional &&
        text &&
        isChineseText(text) &&
        !hasKanaTextLocal(text)
      ) {
        text = simplifiedToTraditional(text);
      }
      map.set(index, text);
    });
    return map;
  }, [lines, chineseVariant]);

  return (
    <div
      className="w-full h-full flex flex-col bg-black/90"
      style={{ borderRadius: "inherit" }}
    >
      {/* Header - pt-7 to accommodate notitlebar hover titlebar */}
      <div className="px-4 pt-7 pb-3 border-b border-white/10 space-y-3">
        {/* Top row: Offset controls, action buttons, and close button */}
        <div className="flex items-center gap-3">
          {/* Offset controls */}
          <div className="flex items-center gap-1 bg-white/10 rounded-full px-1 py-0.5">
            <button
              type="button"
              onClick={() => onAdjustOffset(-OFFSET_STEP)}
              className="p-1.5 rounded-full hover:bg-white/10 active:bg-white/20 text-white"
              aria-label={t("apps.ipod.syncMode.decreaseOffset", "Decrease offset")}
            >
              <Minus className="w-4 h-4" />
            </button>
            <div className="text-white text-sm font-medium min-w-[70px] text-center">
              {formatOffset(currentOffset)}
            </div>
            <button
              type="button"
              onClick={() => onAdjustOffset(OFFSET_STEP)}
              className="p-1.5 rounded-full hover:bg-white/10 active:bg-white/20 text-white"
              aria-label={t("apps.ipod.syncMode.increaseOffset", "Increase offset")}
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Sync Scroll button */}
          {!isAutoScrollEnabled && (
            <button
              type="button"
              onClick={handleResumeAutoScroll}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 text-white"
              aria-label={t("apps.ipod.syncMode.syncScroll", "Sync Scroll")}
            >
              <ChevronsDown className="w-4 h-4" />
            </button>
          )}

          {/* Search Lyrics button */}
          {onSearchLyrics && (
            <button
              type="button"
              onClick={onSearchLyrics}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 text-white"
              aria-label={t("apps.ipod.syncMode.searchLyrics", "Search Lyrics")}
            >
              <Search className="w-4 h-4" />
            </button>
          )}

          {/* Done button */}
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 text-white text-xs font-medium"
          >
            {t("common.dialog.done", "Done")}
          </button>
        </div>

        {/* Seekbar */}
        <div className="flex items-center gap-2 text-white text-xs">
          <span className="w-10 text-right opacity-70">{formatTime(currentTimeMs)}</span>
          <input
            type="range"
            min={0}
            max={durationMs || 100}
            value={currentTimeMs}
            onChange={(e) => onSeek(Number(e.target.value))}
            className="flex-1 h-1 bg-white/20 rounded-full appearance-none cursor-pointer
                       [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 
                       [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer
                       [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:bg-white 
                       [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
          />
          <span className="w-10 opacity-70">{formatTime(durationMs)}</span>
        </div>

        {/* Instructions */}
        <div className="text-white/40 text-[10px] text-center">
          {t("apps.ipod.syncMode.instructions", "Tap the line you're hearing to sync lyrics")}
        </div>
      </div>

      {/* Scrollable lyrics list */}
      <div className="flex-1 relative overflow-hidden">
        <div
          ref={scrollContainerRef}
          className="absolute inset-0 overflow-y-auto px-3 py-4"
        >
          <div className="space-y-0.5">
            {lines.map((line, index) => (
              <LyricLineItem
                key={`${line.startTimeMs}-${index}`}
                line={line}
                index={index}
                isCurrent={index === currentLineIndex}
                isPast={index < currentLineIndex}
                romanizedText={romanizedTexts.get(index) ?? null}
                displayText={displayTexts.get(index) ?? line.words}
                onClick={() => handleLineTap(line)}
                setRef={(el) => {
                  lineRefs.current[index] = el;
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
