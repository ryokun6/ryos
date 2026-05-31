import type { CSSProperties, ReactNode } from "react";
import type { LyricLine, LyricWord, LyricsAlignment, KoreanDisplay, JapaneseFurigana, RomanizationSettings } from "@/types/lyrics";
import type { FuriganaSegment } from "@/utils/romanization";

export interface LyricsDisplayProps {
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
  /** Optional explicit font/stack. When omitted, classic LCD stays Geneva; modern uses Myriad (600) only for the Sans Serif lyric preset — other lyric display styles preserve their karaoke classes. */
  fontClassName?: string;
  /** Optional inline styles for the outer container (e.g., dynamic gap) */
  containerStyle?: CSSProperties;
  /** Furigana map from parent (Map of startTimeMs -> FuriganaSegment[]) */
  furiganaMap?: Map<string, FuriganaSegment[]>;
  /** Soramimi map from parent (Map of startTimeMs -> FuriganaSegment[]) */
  soramimiMap?: Map<string, FuriganaSegment[]>;
  /** Current playback time in milliseconds (for word-level highlighting) */
  currentTimeMs?: number;
  /** Callback to seek to a specific time in ms */
  onSeekToTime?: (timeMs: number) => void;
  /** Cover art URL for extracting primary color (used by glow-gold style) */
  coverUrl?: string | null;
  /** Show ellipsis placeholders during long karaoke interludes */
  showInterludeEllipsis?: boolean;
}

export interface FuriganaMappingResult {
  /** Word indices to render (some may be skipped if combined with previous) */
  renderItems: Array<{
    /** Index of the primary word timing */
    wordIdx: number;
    /** Combined text from all word timings in this unit */
    text: string;
    /** Reading for this unit (if any) */
    reading?: string;
    /** Extra duration from combined words (for animation) */
    extraDurationMs: number;
    /** Word indices that were combined into this unit (for skip tracking) */
    combinedWordIndices: number[];
  }>;
  /** Set of word indices that should be skipped (combined into another unit) */
  skipIndices: Set<number>;
}

export interface WordRenderItem {
  word: LyricWord;
  /** Extra duration from furigana spanning multiple words */
  extraDurationMs: number;
  /** Pre-rendered content (text or furigana) */
  content: ReactNode;
  /** Unique key for React */
  key: string;
}

export type LyricsLineRowContentProps = {
  line: LyricLine;
  isCurrent: boolean;
  isInterludePlaceholder?: boolean;
  hasWordTimings: boolean;
  /** Only passed for rows that need per-tick playback time (word highlight + gradient hue). */
  timeMsForRow: number | undefined;
  translatedText: string | null;
  textSizeClass: string;
  /** Row alignment from parent motion.div (stacked interlude dots follow this). */
  lineTextAlign?: string;
  lineHeightClass: string;
  fontClassName: string;
  interactive: boolean;
  onSeekToTime?: (timeMs: number) => void;
  romanization: RomanizationSettings;
  furiganaMap: Map<string, FuriganaSegment[]>;
  soramimiMap: Map<string, FuriganaSegment[]>;
  renderWithFurigana: (line: LyricLine, processedText: string) => ReactNode;
  processText: (text: string) => string;
  showKoreanRomanization: boolean;
  isOldSchoolKaraoke: boolean;
  isGradientStyle: boolean;
  isColoredGlow: boolean;
  highlightColor: string;
  baseColor: string | undefined;
  glowFilter: string;
  glowShadowHighlight: string;
  /** Intro: no anchor line; gap: dimmed line above interlude dots */
  interludeMeta?: {
    countdownStartMs: number;
    anchorLine: LyricLine | null;
  };
  /** Gap + alternating: placeholder row is ghost only; dots render on the next row */
  interludePlaceholderDotsInlineOnlyGhost?: boolean;
  /** Intro/gap + alternating: synthetic line for ●●● on the same row as the lyric */
  interludeInlineDotsLine?: LyricLine;
  timeMsForInterludeDots?: number;
  interludeInlineCountdownStartMs?: number;
};
