/**
 * Language detection utilities for CJK (Chinese, Japanese, Korean) text
 */

// Unicode ranges for different scripts
const UNICODE_RANGES = {
  // Korean
  hangulJamo: /[\u3131-\u314E\u314F-\u3163]/, // Hangul Jamo (consonants and vowels)
  hangulSyllables: /[\uAC00-\uD7A3]/, // Hangul Syllables (composed characters)
  hangulAll: /[\u3131-\u314E\u314F-\u3163\uAC00-\uD7A3]/, // All Hangul

  // Japanese
  hiragana: /[\u3040-\u309F]/, // Hiragana
  katakana: /[\u30A0-\u30FF]/, // Katakana
  kana: /[\u3040-\u309F\u30A0-\u30FF]/, // Both Hiragana and Katakana

  // Chinese/CJK Unified
  cjkUnified: /[\u4E00-\u9FFF]/, // CJK Unified Ideographs (Kanji/Hanzi)
  cjkExtA: /[\u3400-\u4DBF]/, // CJK Unified Ideographs Extension A
  cjkExtB: /[\u{20000}-\u{2A6DF}]/u, // CJK Unified Ideographs Extension B

  // Combined for broader detection
  anyCJK: /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7A3]/,
};

/**
 * Check if text contains Korean characters (Hangul)
 */
export function hasKoreanText(text: string): boolean {
  return UNICODE_RANGES.hangulAll.test(text);
}

/**
 * Check if text contains Japanese kana (Hiragana or Katakana)
 */
export function hasKanaText(text: string): boolean {
  return UNICODE_RANGES.kana.test(text);
}

/**
 * Check if text contains CJK ideographs (Kanji/Hanzi)
 */
export function hasKanjiText(text: string): boolean {
  return UNICODE_RANGES.cjkUnified.test(text);
}

/**
 * Check if text is Japanese (has both Kanji AND Kana)
 * This distinguishes Japanese from Chinese (which only has Hanzi, no Kana)
 */
export function isJapaneseText(text: string): boolean {
  return hasKanjiText(text) && hasKanaText(text);
}

/**
 * Check if text is likely Chinese (has CJK ideographs but no Kana or Hangul)
 */
export function isChineseText(text: string): boolean {
  return hasKanjiText(text) && !hasKanaText(text) && !hasKoreanText(text);
}

/**
 * Check if text contains any CJK characters
 */
export function hasCJKText(text: string): boolean {
  return UNICODE_RANGES.anyCJK.test(text);
}

/**
 * Check if any line in an array of lyrics contains Korean text
 */
export function lyricsHaveKorean(
  lines: { words: string }[] | undefined | null
): boolean {
  return lines?.some((line) => hasKoreanText(line.words)) ?? false;
}

/**
 * Check if any line in an array of lyrics contains Japanese text
 */
export function lyricsHaveJapanese(
  lines: { words: string }[] | undefined | null
): boolean {
  return lines?.some((line) => isJapaneseText(line.words)) ?? false;
}

/**
 * Check if any line in an array of lyrics contains Chinese text
 */
export function lyricsHaveChinese(
  lines: { words: string }[] | undefined | null
): boolean {
  return lines?.some((line) => isChineseText(line.words)) ?? false;
}
