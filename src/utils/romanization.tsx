/**
 * Romanization utilities for CJK (Chinese, Japanese, Korean) text
 * Provides shared rendering functions for ruby annotations
 */
import { convert as romanizeKorean } from "hangul-romanization";
import { pinyin } from "pinyin-pro";
import { toRomaji } from "wanakana";
import { Converter } from "opencc-js";
import { hasKoreanText, isChineseText } from "./languageDetection";

// Traditional to Simplified Chinese converter for accurate pinyin
// pinyin-pro gives incorrect readings for traditional characters (e.g., 車 → jū instead of chē)
const traditionalToSimplified = Converter({ from: "tw", to: "cn" });

// Re-export detection utilities for convenience
export { hasKoreanText, isChineseText, isJapaneseText, hasKanaText } from "./languageDetection";

/**
 * Type for furigana segments from API
 */
export interface FuriganaSegment {
  text: string;
  reading?: string;
}

/**
 * Options for romanization rendering
 */
export interface RomanizationOptions {
  koreanRomanization?: boolean;
  japaneseRomaji?: boolean;
  chinesePinyin?: boolean;
}

// ============================================================================
// Regex Patterns (consolidated from multiple files)
// ============================================================================

/** Korean character range (Hangul Jamo + Syllables) */
export const KOREAN_REGEX = /[\u3131-\u314e\u314f-\u3163\uac00-\ud7a3]+/g;

/** Japanese kana (Hiragana + Katakana + Katakana Phonetic Extensions) */
export const KANA_REGEX = /[\u3040-\u309f\u30a0-\u30ff\u31f0-\u31ff]+/g;

/** Chinese characters (CJK Unified Ideographs + Extensions) */
export const CHINESE_REGEX = /[\u4e00-\u9fff\u3400-\u4dbf\u20000-\u2a6df\u2a700-\u2b73f\u2b740-\u2b81f\u2b820-\u2ceaf\uf900-\ufaff\u2f800-\u2fa1f]+/g;

// ============================================================================
// Local Detection Helpers (using local regex for global matching)
// ============================================================================

/**
 * Check if text contains any Japanese kana (using local regex)
 * Note: This uses a local regex instance to avoid global state issues
 */
export function hasKanaTextLocal(text: string): boolean {
  KANA_REGEX.lastIndex = 0;
  return KANA_REGEX.test(text);
}

/**
 * Check if text contains any Chinese characters (using local regex)
 */
export function hasChineseTextLocal(text: string): boolean {
  CHINESE_REGEX.lastIndex = 0;
  return CHINESE_REGEX.test(text);
}

// ============================================================================
// Ruby Rendering Functions
// ============================================================================

/**
 * Render text with Korean romanization as ruby annotation
 */
export function renderKoreanWithRomanization(text: string, keyPrefix: string = "kr"): React.ReactNode {
  const segments: { text: string; isKorean: boolean }[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  
  KOREAN_REGEX.lastIndex = 0;
  while ((match = KOREAN_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), isKorean: false });
    }
    segments.push({ text: match[0], isKorean: true });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), isKorean: false });
  }
  
  if (segments.length === 0) {
    return text;
  }
  
  return (
    <>
      {segments.map((seg, idx) => {
        if (seg.isKorean) {
          const romanized = romanizeKorean(seg.text);
          return (
            <ruby key={`${keyPrefix}-${idx}`} className="lyrics-furigana lyrics-korean-ruby">
              {seg.text}
              <rp>(</rp>
              <rt className="lyrics-furigana-rt lyrics-korean-rt">{romanized}</rt>
              <rp>)</rp>
            </ruby>
          );
        }
        return <span key={`${keyPrefix}-${idx}`}>{seg.text}</span>;
      })}
    </>
  );
}

/**
 * Render text with Chinese pinyin as ruby annotation
 * Converts traditional Chinese to simplified internally for accurate pinyin lookup,
 * but displays the original characters
 */
export function renderChineseWithPinyin(text: string, keyPrefix: string = "cn"): React.ReactNode {
  // Convert traditional to simplified for accurate pinyin lookup
  // pinyin-pro gives wrong readings for traditional chars (e.g., 車 → jū instead of chē)
  const simplifiedText = traditionalToSimplified(text);
  
  // Get pinyin with tone marks for each character (from simplified text)
  const pinyinResult = pinyin(simplifiedText, { type: 'array', toneType: 'symbol' });
  const chars = [...text]; // Original characters for display
  
  if (chars.length === 0) {
    return text;
  }
  
  return (
    <>
      {chars.map((char, idx) => {
        // Check if this character is a Chinese character
        CHINESE_REGEX.lastIndex = 0;
        if (CHINESE_REGEX.test(char)) {
          const charPinyin = pinyinResult[idx] || '';
          return (
            <ruby key={`${keyPrefix}-${idx}`} className="lyrics-furigana lyrics-pinyin-ruby">
              {char}
              <rp>(</rp>
              <rt className="lyrics-furigana-rt lyrics-pinyin-rt">{charPinyin}</rt>
              <rp>)</rp>
            </ruby>
          );
        }
        return <span key={`${keyPrefix}-sp-${idx}`}>{char}</span>;
      })}
    </>
  );
}

/**
 * Render Japanese kana with romaji as ruby annotation
 * Converts hiragana/katakana to Latin letters
 */
export function renderKanaWithRomaji(text: string, keyPrefix: string = "jp"): React.ReactNode {
  const segments: { text: string; isKana: boolean }[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  
  KANA_REGEX.lastIndex = 0;
  while ((match = KANA_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), isKana: false });
    }
    segments.push({ text: match[0], isKana: true });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), isKana: false });
  }
  
  if (segments.length === 0) {
    return text;
  }
  
  return (
    <>
      {segments.map((seg, idx) => {
        if (seg.isKana) {
          const romaji = toRomaji(seg.text);
          return (
            <ruby key={`${keyPrefix}-${idx}`} className="lyrics-furigana lyrics-romaji-ruby">
              {seg.text}
              <rp>(</rp>
              <rt className="lyrics-furigana-rt lyrics-romaji-rt">{romaji}</rt>
              <rp>)</rp>
            </ruby>
          );
        }
        return <span key={`${keyPrefix}-sp-${idx}`}>{seg.text}</span>;
      })}
    </>
  );
}

/**
 * Render furigana segments with all romanization types
 * Handles: Japanese furigana (with optional romaji), Korean, Chinese pinyin, standalone kana
 */
export function renderFuriganaSegments(
  segments: FuriganaSegment[],
  options: RomanizationOptions = {}
): React.ReactNode {
  const { koreanRomanization = false, japaneseRomaji = false, chinesePinyin = false } = options;
  
  return (
    <>
      {segments.map((segment, index) => {
        // Handle Japanese furigana (hiragana reading over kanji)
        if (segment.reading) {
          // If japaneseRomaji is enabled, convert the reading to romaji
          const displayReading = japaneseRomaji 
            ? toRomaji(segment.reading)
            : segment.reading;
          return (
            <ruby key={index} className="lyrics-furigana">
              {segment.text}
              <rp>(</rp>
              <rt className="lyrics-furigana-rt">{displayReading}</rt>
              <rp>)</rp>
            </ruby>
          );
        }
        
        // Check for Korean text when romanization is enabled
        if (koreanRomanization && hasKoreanText(segment.text)) {
          return renderKoreanWithRomanization(segment.text, `seg-${index}`);
        }
        
        // Check for Chinese text when pinyin is enabled
        if (chinesePinyin && isChineseText(segment.text)) {
          return renderChineseWithPinyin(segment.text, `seg-${index}`);
        }
        
        // Check for standalone kana when romaji is enabled
        if (japaneseRomaji && hasKanaTextLocal(segment.text)) {
          return renderKanaWithRomaji(segment.text, `seg-${index}`);
        }
        
        return <span key={index}>{segment.text}</span>;
      })}
    </>
  );
}

/**
 * Render text with applicable romanization based on detected language
 * Returns plain text if no romanization matches
 */
export function renderTextWithRomanization(
  text: string,
  options: RomanizationOptions,
  keyPrefix: string = "rom"
): React.ReactNode {
  const { koreanRomanization = false, japaneseRomaji = false, chinesePinyin = false } = options;
  
  // Check for Chinese text and render with pinyin if enabled
  if (chinesePinyin && isChineseText(text)) {
    return renderChineseWithPinyin(text, keyPrefix);
  }
  
  // Check for Korean text and render with romanization if enabled
  if (koreanRomanization && hasKoreanText(text)) {
    return renderKoreanWithRomanization(text, keyPrefix);
  }
  
  // Check for Japanese kana and render with romaji if enabled
  if (japaneseRomaji && hasKanaTextLocal(text)) {
    return renderKanaWithRomaji(text, keyPrefix);
  }
  
  return text;
}
