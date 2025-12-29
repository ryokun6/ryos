/**
 * Romanization utilities for CJK (Chinese, Japanese, Korean) text
 * Provides shared rendering functions for ruby annotations
 */
import { convert as romanizeKorean } from "hangul-romanization";
import { pinyin } from "pinyin-pro";
import { toRomaji } from "wanakana";
import { hasKoreanText, isChineseText } from "./languageDetection";

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
 * Note: pinyin-pro may give less accurate readings for some Traditional Chinese characters
 */
export function renderChineseWithPinyin(text: string, keyPrefix: string = "cn"): React.ReactNode {
  // Get pinyin without tone marks for each character
  const pinyinResult = pinyin(text, { type: 'array', toneType: 'none' });
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
          return <span key={index}>{renderKoreanWithRomanization(segment.text, `seg-${index}`)}</span>;
        }
        
        // Check for Chinese text when pinyin is enabled
        if (chinesePinyin && isChineseText(segment.text)) {
          return <span key={index}>{renderChineseWithPinyin(segment.text, `seg-${index}`)}</span>;
        }
        
        // Check for standalone kana when romaji is enabled
        if (japaneseRomaji && hasKanaTextLocal(segment.text)) {
          return <span key={index}>{renderKanaWithRomaji(segment.text, `seg-${index}`)}</span>;
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

// ============================================================================
// Pronunciation-Only Rendering Functions
// These return only the phonetic content, replacing the original text
// ============================================================================

/**
 * Get pronunciation-only text for Korean (romanized form)
 */
export function getKoreanPronunciationOnly(text: string): string {
  let result = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  
  KOREAN_REGEX.lastIndex = 0;
  while ((match = KOREAN_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      result += text.slice(lastIndex, match.index);
    }
    result += romanizeKorean(match[0]);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    result += text.slice(lastIndex);
  }
  
  return result || text;
}

/**
 * Get pronunciation-only text for Chinese (pinyin)
 * No spaces within word - spaces are added at segment level in getFuriganaSegmentsPronunciationOnly
 * Note: pinyin-pro may give less accurate readings for some Traditional Chinese characters
 */
export function getChinesePronunciationOnly(text: string): string {
  // Get pinyin without tone marks for each character
  const pinyinResult = pinyin(text, { type: 'array', toneType: 'none' });
  const chars = [...text];
  
  let result = "";
  for (let idx = 0; idx < chars.length; idx++) {
    const char = chars[idx];
    CHINESE_REGEX.lastIndex = 0;
    if (CHINESE_REGEX.test(char)) {
      result += pinyinResult[idx] || char;
    } else {
      result += char;
    }
  }
  
  return result;
}

/**
 * Get pronunciation-only text for Japanese kana (romaji)
 */
export function getKanaPronunciationOnly(text: string): string {
  let result = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  
  KANA_REGEX.lastIndex = 0;
  while ((match = KANA_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      result += text.slice(lastIndex, match.index);
    }
    result += toRomaji(match[0]);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    result += text.slice(lastIndex);
  }
  
  return result || text;
}

/**
 * Get pronunciation-only text from furigana segments
 * Returns the reading/pronunciation instead of the original text
 * Adds spaces between segments only when the OUTPUT is romanized (latin characters)
 * Language-specific: only adds spaces for content that is actually romanized
 */
export function getFuriganaSegmentsPronunciationOnly(
  segments: FuriganaSegment[],
  options: RomanizationOptions = {}
): string {
  const { koreanRomanization = false, japaneseRomaji = false, chinesePinyin = false } = options;
  
  // Helper to check if text is primarily Latin characters
  const isLatinText = (text: string): boolean => {
    const latinChars = text.match(/[a-zA-Z]/g);
    return latinChars !== null && latinChars.length > text.length / 2;
  };
  
  // Build parts with metadata about whether each is Latin
  const partsWithMeta: { text: string; isLatin: boolean }[] = [];
  
  for (const segment of segments) {
    // If segment has a reading (furigana), use that
    if (segment.reading) {
      const output = japaneseRomaji ? toRomaji(segment.reading) : segment.reading;
      partsWithMeta.push({ text: output, isLatin: isLatinText(output) });
      continue;
    }
    
    // Check for Korean text - only romanize if setting is on
    if (koreanRomanization && hasKoreanText(segment.text)) {
      const output = getKoreanPronunciationOnly(segment.text);
      partsWithMeta.push({ text: output, isLatin: true });
      continue;
    }
    
    // Check for Chinese text - only convert to pinyin if setting is on
    if (chinesePinyin && isChineseText(segment.text)) {
      const output = getChinesePronunciationOnly(segment.text);
      partsWithMeta.push({ text: output, isLatin: true });
      continue;
    }
    
    // Check for standalone kana - only romanize if setting is on
    if (japaneseRomaji && hasKanaTextLocal(segment.text)) {
      const output = getKanaPronunciationOnly(segment.text);
      partsWithMeta.push({ text: output, isLatin: true });
      continue;
    }
    
    // Otherwise, keep the original text (including spaces)
    // Whitespace-only segments are not Latin but should be preserved
    const isWhitespace = /^\s*$/.test(segment.text);
    partsWithMeta.push({ text: segment.text, isLatin: !isWhitespace && isLatinText(segment.text) });
  }
  
  // Build result: only add spaces between Latin parts
  let result = "";
  for (let i = 0; i < partsWithMeta.length; i++) {
    const part = partsWithMeta[i];
    const prevPart = i > 0 ? partsWithMeta[i - 1] : null;
    
    // Add space before this part if:
    // - This part is Latin AND previous part exists AND previous part is Latin
    // - AND no natural whitespace already exists
    if (part.isLatin && prevPart?.isLatin && result.length > 0 && !result.endsWith(" ") && !part.text.startsWith(" ")) {
      result += " ";
    }
    result += part.text;
  }
  
  return result.replace(/\s+/g, " ").trim();
}

/**
 * Render furigana segments as pronunciation-only (plain text replacement)
 * Returns only the phonetic content without ruby annotations
 */
export function renderFuriganaSegmentsPronunciationOnly(
  segments: FuriganaSegment[],
  options: RomanizationOptions = {},
  keyPrefix: string = "pron"
): React.ReactNode {
  return <span key={keyPrefix}>{getFuriganaSegmentsPronunciationOnly(segments, options)}</span>;
}

/**
 * Get pronunciation-only text based on detected language
 */
export function getPronunciationOnlyText(
  text: string,
  options: RomanizationOptions
): string {
  const { koreanRomanization = false, japaneseRomaji = false, chinesePinyin = false } = options;
  
  // Check for Chinese text and get pinyin
  if (chinesePinyin && isChineseText(text)) {
    return getChinesePronunciationOnly(text);
  }
  
  // Check for Korean text and get romanization
  if (koreanRomanization && hasKoreanText(text)) {
    return getKoreanPronunciationOnly(text);
  }
  
  // Check for Japanese kana and get romaji
  if (japaneseRomaji && hasKanaTextLocal(text)) {
    return getKanaPronunciationOnly(text);
  }
  
  return text;
}
