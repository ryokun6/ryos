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

/**
 * Romanization settings for lyrics display
 * Controls ruby annotations for various languages
 */
export interface RomanizationSettings {
  /** Master toggle - when false, no romanization is shown */
  enabled: boolean;
  /** Japanese furigana - hiragana readings over kanji (e.g., 日本 → にほん) */
  japaneseFurigana: boolean;
  /** Japanese romaji - Latin pronunciation over all Japanese (e.g., 日本 → nihon) */
  japaneseRomaji: boolean;
  /** Korean romanization - Latin over hangul (e.g., 한국 → hanguk) */
  korean: boolean;
  /** Chinese pinyin - Latin with tones over hanzi (e.g., 中国 → zhōngguó) */
  chinese: boolean;
  /** Chinese soramimi (空耳) - misheard lyrics in Chinese characters that phonetically match original (e.g., sorry sorry → 搜哩搜哩) */
  chineseSoramimi: boolean;
}
