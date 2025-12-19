/**
 * Word-level timing information from KRC format
 */
export interface LyricWord {
  /** The text content of this word/syllable */
  text: string;
  /** Start time offset from the line start in milliseconds */
  startTimeMs: number;
  /** Duration of this word in milliseconds */
  durationMs: number;
}

export interface LyricLine {
  startTimeMs: string;
  words: string;
  /** Optional word-level timing data from KRC format */
  wordTimings?: LyricWord[];
}

export enum LyricsFont {
  SansSerif = "sans-serif",
  Serif = "serif",
  Rounded = "rounded",
}

export enum LyricsAlignment {
  Alternating = "alternating",
  FocusThree = "focusThree",
  Center = "center",
}

export enum ChineseVariant {
  Original = "original",
  Traditional = "traditional",
  Simplified = "simplified",
}

export enum KoreanDisplay {
  Original = "original",
  Romanized = "romanized",
}

export enum JapaneseFurigana {
  Off = "off",
  On = "on",
}
