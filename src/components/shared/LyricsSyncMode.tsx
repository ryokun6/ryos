import { useEffect, useRef, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { X, Minus, Plus } from "lucide-react";
import type { LyricLine, RomanizationSettings } from "@/types/lyrics";
import { convert as romanizeKorean } from "hangul-romanization";
import { pinyin } from "pinyin-pro";
import { toRomaji } from "wanakana";
import {
  hasKoreanText,
  isChineseText,
  hasKanaTextLocal,
  KOREAN_REGEX,
  CHINESE_REGEX,
  FuriganaSegment,
} from "@/utils/romanization";

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
}: LyricsSyncModeProps) {
  const { t } = useTranslation();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLButtonElement | null)[]>([]);
  
  // Offset adjustment step in ms
  const OFFSET_STEP = 100;

  // Calculate which line should be highlighted based on current time + offset
  const currentLineIndex = useMemo(() => {
    if (!lines.length) return -1;
    const adjustedTime = currentTimeMs + currentOffset;

    // Find the line that should be active at the adjusted time
    for (let i = lines.length - 1; i >= 0; i--) {
      const lineStart = parseInt(lines[i].startTimeMs, 10);
      if (adjustedTime >= lineStart) {
        return i;
      }
    }
    return -1;
  }, [lines, currentTimeMs, currentOffset]);

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

  // Auto-scroll to keep current line visible (centered)
  useEffect(() => {
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

  return (
    <div 
      className="absolute inset-0 z-50 flex flex-col bg-black/60 backdrop-blur-md"
      style={{ borderRadius: "inherit" }}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/10 space-y-3">
        {/* Top row: close button and centered instructions */}
        <div className="relative flex items-center justify-center">
          <div className="text-white text-xs opacity-70 text-center">
            {t("apps.ipod.syncMode.instructions", "Tap the line you're hearing")}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="absolute right-0 p-1 rounded-full hover:bg-white/10 transition-colors text-white"
            aria-label={t("common.close", "Close")}
          >
            <X className="w-4 h-4" />
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

        {/* Offset controls */}
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => onAdjustOffset(-OFFSET_STEP)}
            className="p-1.5 rounded-full hover:bg-white/10 active:bg-white/20 transition-colors text-white"
            aria-label={t("apps.ipod.syncMode.decreaseOffset", "Decrease offset")}
          >
            <Minus className="w-4 h-4" />
          </button>
          <div className="text-white text-sm font-medium min-w-[80px] text-center">
            {formatOffset(currentOffset)}
          </div>
          <button
            type="button"
            onClick={() => onAdjustOffset(OFFSET_STEP)}
            className="p-1.5 rounded-full hover:bg-white/10 active:bg-white/20 transition-colors text-white"
            aria-label={t("apps.ipod.syncMode.increaseOffset", "Increase offset")}
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Scrollable lyrics list */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-3 py-4"
      >
        <div className="space-y-0.5">
          {lines.map((line, index) => {
            const isCurrent = index === currentLineIndex;
            const isPast = index < currentLineIndex;
            const furiganaSegments = furiganaMap?.get(line.startTimeMs);
            const romanizedText = getRomanizedText(line.words, romanization, furiganaSegments);

            return (
              <button
                type="button"
                key={`${line.startTimeMs}-${index}`}
                ref={(el) => {
                  lineRefs.current[index] = el;
                }}
                onClick={() => handleLineTap(line)}
                className={cn(
                  "w-full text-left py-2 px-3 rounded-md transition-all duration-200",
                  "hover:bg-white/10 active:bg-white/20",
                  "focus:outline-none focus:ring-2 focus:ring-white/30",
                  isCurrent && "bg-white/20 text-white font-semibold",
                  isPast && !isCurrent && "text-white/40",
                  !isPast && !isCurrent && "text-white/60"
                )}
              >
                <div className="text-base leading-relaxed">
                  {line.words || (
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
          })}
        </div>
      </div>

    </div>
  );
}
