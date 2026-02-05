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
  SerifRed = "serif-red",      // Japanese classic: serif + red outline
  GoldGlow = "gold-glow",      // Warm karaoke bar: rounded + gold glow
  Gradient = "gradient",       // Modern: gradient fill (blue → cyan)
}

/**
 * Gets the CSS class name for a lyrics font setting.
 * Pure function - no memoization needed.
 */
export function getLyricsFontClassName(font: LyricsFont): string {
  switch (font) {
    case LyricsFont.Serif:
      return "font-lyrics-serif";
    case LyricsFont.SansSerif:
      return "font-lyrics-sans";
    case LyricsFont.SerifRed:
      return "font-lyrics-serif-red";
    case LyricsFont.GoldGlow:
      return "font-lyrics-gold-glow";
    case LyricsFont.Gradient:
      return "font-lyrics-gradient";
    case LyricsFont.Rounded:
    default:
      return "font-lyrics-rounded";
  }
}

export enum LyricsAlignment {
  Alternating = "alternating",
  FocusThree = "focusThree",
  Center = "center",
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
  /** Soramimi (空耳) - misheard lyrics that phonetically approximate the original */
  soramimi: boolean;
  /** Target language for soramimi: "zh-TW" for Chinese (搜哩搜哩), "en" for English (meet sue mate a tie) */
  soramamiTargetLanguage: "zh-TW" | "en";
  /** Only pronunciation - replace original text with phonetic content (e.g., 日本 → にほん, 한국 → hanguk) */
  pronunciationOnly?: boolean;
}
