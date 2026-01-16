/**
 * Song API Constants and Schemas
 */

import { z } from "zod";

// =============================================================================
// Constants
// =============================================================================

export const kugouHeaders: HeadersInit = {
  "User-Agent":
    '{"percent": 21.4, "useragent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36", "system": "Chrome 116.0 Win10", "browser": "chrome", "version": 116.0, "os": "win10"}',
};

// KRC decryption key
export const KRC_DECRYPTION_KEY = [64, 71, 97, 119, 94, 50, 116, 71, 81, 54, 49, 45, 206, 210, 110, 105];

// YouTube video ID format: 11 characters, alphanumeric with - and _
export const YOUTUBE_VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

/**
 * Prefixes to skip when parsing lyrics (credits, production info, etc.)
 * Must match client-side parser (krcParser.ts) for consistent line counts
 */
export const SKIP_PREFIXES = [
  "作词", "作曲", "编曲", "制作", "发行", "出品", "监制", "策划", "统筹",
  "录音", "混音", "母带", "和声", "合声", "合声编写", "版权", "吉他", "贝斯", "鼓", "键盘",
  "企划", "词：", "詞：", "词曲：", "詞曲：", "曲", "男：", "女：", "合：", "OP", "SP", "TME享有",
  "Produced", "Composed", "Arranged", "Mixed", "Lyrics", "Keyboard",
  "Guitar", "Bass", "Drum", "Vocal", "Original Publisher", "Sub-publisher",
  "Electric Piano", "Synth by", "Recorded by", "Mixed by", "Mastered by",
  "Produced by", "Composed by", "Digital Editing by", "Mix Assisted by",
  "Mix by", "Mix Engineer", "Background vocals", "Background vocals by",
  "Chorus by", "Percussion by", "String by", "Harp by", "Piano by",
  "Piano Arranged by", "Written by", "Additional Production by",
  "Synthesizer", "Programming", "Background Vocals", "Recording Engineer",
  "Digital Editing", "Sessions", "Original publisher", "All Instruments by",
  "Additional Drums", "Digital editing by"
] as const;

// =============================================================================
// Schemas
// =============================================================================

export const LyricsSourceSchema = z.object({
  hash: z.string(),
  albumId: z.union([z.string(), z.number()]),
  title: z.string().max(500),
  artist: z.string().max(500),
  album: z.string().max(500).optional(),
});

export const UpdateSongSchema = z.object({
  title: z.string().max(500).optional(),
  artist: z.string().max(500).optional(),
  album: z.string().max(500).optional(),
  lyricOffset: z.number().min(-300000).max(300000).optional(),
  lyricsSource: LyricsSourceSchema.optional(),
  // Options to clear cached data when lyrics source changes
  clearTranslations: z.boolean().optional(),
  clearFurigana: z.boolean().optional(),
  clearSoramimi: z.boolean().optional(),
  clearLyrics: z.boolean().optional(),
  // Flag to indicate this is a share action (sets createdBy)
  isShare: z.boolean().optional(),
});

export const FetchLyricsSchema = z.object({
  action: z.literal("fetch-lyrics"),
  lyricsSource: LyricsSourceSchema.optional(),
  force: z.boolean().optional(),
  // Allow client to pass title/artist for auto-search when song not in Redis yet
  title: z.string().max(500).optional(),
  artist: z.string().max(500).optional(),
  // Return song metadata in response (useful for one-call song setup)
  returnMetadata: z.boolean().optional(),
  // Optional: include translation/furigana/soramimi info in same request to reduce round-trips
  translateTo: z.string().max(10).optional(),
  includeFurigana: z.boolean().optional(),
  includeSoramimi: z.boolean().optional(),
  // Target language for soramimi: "zh-TW" for Chinese, "en" for English
  soramimiTargetLanguage: z.enum(["zh-TW", "en"]).optional(),
});

export const SearchLyricsSchema = z.object({
  action: z.literal("search-lyrics"),
  query: z.string().max(500).optional(),
});

// =============================================================================
// SSE Streaming Schemas - Line-by-line streaming
// =============================================================================

// SSE streaming translation - streams each line as it's generated
export const TranslateStreamSchema = z.object({
  action: z.literal("translate-stream"),
  language: z.string().max(10),
  force: z.boolean().optional(),
});

// SSE streaming furigana - streams each line as it's generated
export const FuriganaStreamSchema = z.object({
  action: z.literal("furigana-stream"),
  force: z.boolean().optional(),
});

// SSE streaming soramimi - streams each line as it's generated
// Accepts optional furigana data to use for Japanese lyrics (provides pronunciation for kanji)
export const SoramimiStreamSchema = z.object({
  action: z.literal("soramimi-stream"),
  force: z.boolean().optional(),
  // Target language for soramimi output: "zh-TW" for Chinese characters, "en" for English phonetics
  // Defaults to "zh-TW" for backwards compatibility
  targetLanguage: z.enum(["zh-TW", "en"]).optional(),
  // Optional furigana data for Japanese songs - helps AI know correct kanji pronunciation
  // Format: 2D array of segments [{text, reading?}] indexed by line
  furigana: z.array(z.array(z.object({
    text: z.string(),
    reading: z.string().optional(),
  }))).optional(),
});

// Schema for clearing cached translations, furigana, and soramimi
export const ClearCachedDataSchema = z.object({
  action: z.literal("clear-cached-data"),
  clearTranslations: z.boolean().optional(),
  clearFurigana: z.boolean().optional(),
  clearSoramimi: z.boolean().optional(),
});

// Schema for unsharing a song (clearing createdBy)
export const UnshareSongSchema = z.object({
  action: z.literal("unshare"),
});

// AI response schemas
export const AiTranslatedTextsSchema = z.object({
  translatedTexts: z.array(z.string()),
});

export const FuriganaSegmentSchema = z.object({
  text: z.string(),
  reading: z.string().optional(),
});

export const AiFuriganaResponseSchema = z.object({
  annotatedLines: z.array(z.array(FuriganaSegmentSchema)),
});

// Soramimi schema (Chinese misheard lyrics)
export const SoramimiSegmentSchema = z.object({
  text: z.string(),
  reading: z.string().optional(),
});

export const AiSoramimiResponseSchema = z.object({
  annotatedLines: z.array(z.array(SoramimiSegmentSchema)),
});
