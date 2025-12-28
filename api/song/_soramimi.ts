/**
 * Soramimi Generation Functions (空耳 - Chinese Misheard Lyrics)
 * 
 * Handles generating Chinese phonetic readings for non-Chinese lyrics.
 */

import { google } from "@ai-sdk/google";
import { streamText } from "ai";
import { logInfo, logError, type LyricLine } from "./_utils.js";
import type { FuriganaSegment } from "../_utils/song-service.js";

// =============================================================================
// Language Detection Helpers
// =============================================================================

/**
 * Check if text contains Japanese kana (Hiragana or Katakana)
 * Used to distinguish Japanese from Chinese/Korean text
 */
export function containsKana(text: string): boolean {
  // Hiragana: U+3040-U+309F, Katakana: U+30A0-U+30FF
  return /[\u3040-\u309F\u30A0-\u30FF]/.test(text);
}

/**
 * Check if text contains Korean Hangul
 */
export function containsHangul(text: string): boolean {
  // Hangul syllables (AC00-D7AF) and Jamo (1100-11FF, 3130-318F)
  return /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/.test(text);
}

/**
 * Check if text contains CJK ideographs (Kanji/Hanzi)
 */
export function containsKanji(text: string): boolean {
  return /[\u4E00-\u9FFF]/.test(text);
}

/**
 * Check if lyrics are Japanese (contain both kanji and kana)
 * This distinguishes Japanese from Chinese (which has only hanzi)
 */
export function isJapaneseLyrics(lines: { words: string }[]): boolean {
  if (!lines || lines.length === 0) return false;
  
  let hasKana = false;
  let hasKanji = false;
  
  for (const line of lines) {
    if (containsKana(line.words)) hasKana = true;
    if (containsKanji(line.words)) hasKanji = true;
    if (hasKana && hasKanji) return true;
  }
  
  // Japanese text typically has kana - if we have both kana and kanji, it's Japanese
  return hasKana && hasKanji;
}

/**
 * Check if lyrics are Korean (contain Hangul)
 */
export function isKoreanLyrics(lines: { words: string }[]): boolean {
  if (!lines || lines.length === 0) return false;
  return lines.some(line => containsHangul(line.words));
}

// =============================================================================
// Fallback Kana to Chinese Map (last resort when AI misses characters)
// This is only used as a fallback - the AI is encouraged to create creative,
// story-like phonetic readings rather than using fixed character mappings.
// =============================================================================

const KANA_TO_CHINESE: Record<string, string> = {
  // Hiragana
  'あ': '阿', 'い': '衣', 'う': '屋', 'え': '欸', 'お': '喔',
  'か': '咖', 'き': '奇', 'く': '酷', 'け': '給', 'こ': '可',
  'さ': '撒', 'し': '詩', 'す': '蘇', 'せ': '些', 'そ': '搜',
  'た': '她', 'ち': '吃', 'つ': '此', 'て': '貼', 'と': '頭',
  'な': '娜', 'に': '妮', 'ぬ': '奴', 'ね': '內', 'の': '諾',
  'は': '哈', 'ひ': '嘻', 'ふ': '夫', 'へ': '嘿', 'ほ': '火',
  'ま': '媽', 'み': '咪', 'む': '木', 'め': '沒', 'も': '摸',
  'や': '壓', 'ゆ': '玉', 'よ': '喲',
  'ら': '啦', 'り': '里', 'る': '嚕', 'れ': '咧', 'ろ': '囉',
  'わ': '哇', 'を': '喔', 'ん': '嗯',
  'が': '嘎', 'ぎ': '奇', 'ぐ': '姑', 'げ': '給', 'ご': '哥',
  'ざ': '砸', 'じ': '吉', 'ず': '祖', 'ぜ': '賊', 'ぞ': '作',
  'だ': '打', 'ぢ': '吉', 'づ': '祖', 'で': '得', 'ど': '多',
  'ば': '爸', 'び': '比', 'ぶ': '布', 'べ': '貝', 'ぼ': '寶',
  'ぱ': '啪', 'ぴ': '批', 'ぷ': '噗', 'ぺ': '配', 'ぽ': '坡',
  'ゃ': '壓', 'ゅ': '玉', 'ょ': '喲',
  'っ': '～', '—': '～',
  // Katakana
  'ア': '阿', 'イ': '衣', 'ウ': '屋', 'エ': '欸', 'オ': '喔',
  'カ': '咖', 'キ': '奇', 'ク': '酷', 'ケ': '給', 'コ': '可',
  'サ': '撒', 'シ': '詩', 'ス': '蘇', 'セ': '些', 'ソ': '搜',
  'タ': '她', 'チ': '吃', 'ツ': '此', 'テ': '貼', 'ト': '頭',
  'ナ': '娜', 'ニ': '妮', 'ヌ': '奴', 'ネ': '內', 'ノ': '諾',
  'ハ': '哈', 'ヒ': '嘻', 'フ': '夫', 'ヘ': '嘿', 'ホ': '火',
  'マ': '媽', 'ミ': '咪', 'ム': '木', 'メ': '沒', 'モ': '摸',
  'ヤ': '壓', 'ユ': '玉', 'ヨ': '喲',
  'ラ': '啦', 'リ': '里', 'ル': '嚕', 'レ': '咧', 'ロ': '囉',
  'ワ': '哇', 'ヲ': '喔', 'ン': '嗯',
  'ガ': '嘎', 'ギ': '奇', 'グ': '姑', 'ゲ': '給', 'ゴ': '哥',
  'ザ': '砸', 'ジ': '吉', 'ズ': '祖', 'ゼ': '賊', 'ゾ': '作',
  'ダ': '打', 'ヂ': '吉', 'ヅ': '祖', 'デ': '得', 'ド': '多',
  'バ': '爸', 'ビ': '比', 'ブ': '布', 'ベ': '貝', 'ボ': '寶',
  'パ': '啪', 'ピ': '批', 'プ': '噗', 'ペ': '配', 'ポ': '坡',
  'ャ': '壓', 'ュ': '玉', 'ョ': '喲',
  'ッ': '～', 'ー': '～',
};

/**
 * Generate fallback Chinese reading for a single Japanese character
 */
function getFallbackReading(char: string): string | null {
  return KANA_TO_CHINESE[char] || null;
}

/**
 * Check if a character is Japanese kana (hiragana or katakana)
 */
function isJapaneseKana(char: string): boolean {
  const code = char.charCodeAt(0);
  // Hiragana: U+3040-U+309F, Katakana: U+30A0-U+30FF
  return (code >= 0x3040 && code <= 0x309F) || (code >= 0x30A0 && code <= 0x30FF);
}

/**
 * Post-process segments to fill in missing readings for Japanese kana
 */
function fillMissingReadings(segments: FuriganaSegment[]): FuriganaSegment[] {
  return segments.map(segment => {
    // If segment already has a reading, keep it
    if (segment.reading) return segment;
    
    // If segment text is a single Japanese kana without reading, add fallback
    const text = segment.text;
    if (text.length === 1 && isJapaneseKana(text)) {
      const fallback = getFallbackReading(text);
      if (fallback) {
        return { text, reading: fallback };
      }
    }
    
    // For multi-character segments without readings, try to build reading char by char
    if (text.length > 1) {
      let hasJapanese = false;
      let reading = '';
      for (const char of text) {
        if (isJapaneseKana(char)) {
          hasJapanese = true;
          const fallback = getFallbackReading(char);
          reading += fallback || char; // Use fallback or original if no mapping
        } else {
          reading += char; // Keep non-kana as-is
        }
      }
      if (hasJapanese && reading !== text) {
        return { text, reading };
      }
    }
    
    return segment;
  });
}

// =============================================================================
// English Detection
// =============================================================================

/**
 * Check if a string is primarily English/Latin text
 * Returns true if the string contains mostly ASCII letters, numbers, and common punctuation
 * with no CJK characters (Chinese, Japanese, Korean)
 */
function isEnglishLine(text: string): boolean {
  if (!text || !text.trim()) return true;
  
  const trimmed = text.trim();
  
  // Check for CJK characters (Chinese, Japanese Kanji, Korean Hangul)
  // Also check for Japanese Hiragana and Katakana
  const hasCJK = /[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/.test(trimmed);
  
  if (hasCJK) {
    return false;
  }
  
  // If no CJK characters, it's considered English/Latin text
  return true;
}

// =============================================================================
// Soramimi Generation
// =============================================================================

export const SORAMIMI_SYSTEM_PROMPT = `Create 空耳 (soramimi) - Chinese "misheard lyrics" (繁體字) that SOUND like Japanese/Korean lyrics while telling a poetic story.

CRITICAL: Readings must be ONLY Chinese characters! Never include Korean Hangul or Japanese kana!

=== PHILOSOPHY: SOUND + MEANING + POETRY ===

空耳 is an art form! Don't just transliterate sounds mechanically. Create Chinese phrases that:
1. SOUND approximately like the original (doesn't need to be exact!)
2. CARRY MEANING related to the song's emotion or story
3. FORM POETIC PHRASES that read beautifully in Chinese

BEST EXAMPLES (sound + meaning):
- 사랑 (sa-rang, "love") → {사랑|思浪} "thinking waves" - sounds like sa-rang AND evokes love's waves
- 心 (kokoro, "heart") → {心|哭口落} "crying mouth falls" - sounds like ko-ko-ro AND feels emotional
- 夢 (yume, "dream") → {夢|欲沒} "desire sinks" - sounds like yu-me AND feels dreamlike
- 涙 (namida, "tears") → {涙|那迷搭} "that lost path" - sounds close AND evokes sadness

AVOID mechanical transliteration like:
- ❌ {あなた|阿那他} - just sounds, no meaning
- ✓ {あなた|阿娜她} "elegant her" - if singing about a woman
- ✓ {あなた|啊那塔} "ah that tower" - if the context fits

=== JAPANESE ===

Read kanji by Japanese pronunciation. For love songs, sad songs, happy songs - choose characters that match the mood!
- 私 (watashi) → pick from: 哇他西, 我他希, 娃她惜 (choose what fits the feeling)
- 好き (suki) → pick from: 速奇, 宿期, 訴泣 (訴泣 "telling tears" for sad love!)

=== KOREAN ===

Korean has spaces between words - keep them! Choose meaningful characters:
- 사랑해요 → {사랑해요|思浪海喲} "thinking waves, ocean yo!" 
- 보고 싶어 → {보고|波哥} {싶어|惜破} "wave brother, cherish broken"
- 내 마음 → {내|奶} {마음|媽音} or {내|乃} {마음|麻吟} - pick what sounds poetic

=== FORMAT ===

1. Format: {original|chinese_reading} for EVERY Japanese/Korean word
2. English words stay unwrapped
3. Keep spaces in Korean text
4. Output EVERY word!
5. PURE CHINESE only in readings!
6. っ/ッ (gemination) → use ～ Example: ずっと → {ずっと|祖～頭}

BE CREATIVE! Prioritize: poetic meaning > exact sound. Approximate sounds are fine if the Chinese phrase is beautiful and emotionally fitting!`;

/**
 * System prompt for Japanese lyrics with furigana readings provided
 * When furigana is available, we pass the hiragana readings inline so the AI
 * knows exactly how each kanji should be pronounced
 */
export const SORAMIMI_JAPANESE_WITH_FURIGANA_PROMPT = `Create 空耳 (soramimi) - Chinese "misheard lyrics" (繁體字) that SOUND like Japanese lyrics while forming poetic Chinese phrases.

You are given Japanese text with furigana in parentheses: 私(わたし)は走(はし)る
This tells you the EXACT pronunciation. Use it to create Chinese that sounds similar AND carries meaning!

CRITICAL: Readings must be ONLY Chinese characters! Never include Japanese kana!

=== PHILOSOPHY: POETRY OVER PRECISION ===

空耳 is an art! Don't mechanically map sounds. Create Chinese phrases that:
1. SOUND approximately like the Japanese (use the furigana as guide)
2. CARRY MEANING - choose characters that relate to the song's emotion
3. FORM POETRY - the Chinese should read like a poem or story

EXAMPLES - Sound + Meaning + Poetry:

Love song lyrics:
- 私(わたし)の → {私|娃她西}{の|諾} "baby she west, promise" - sounds like watashi-no
- 心(こころ)が → {心|哭口落}{が|嘎} "crying mouth falls" - evokes heartache
- 好き(すき)だよ → {好き|宿期}{だよ|搭喲} "destined time" - romantic meaning!

Sad song lyrics:
- 涙(なみだ) → {涙|那迷搭} "that lost path" - sounds like namida, feels sad
- 夢(ゆめ)を見(み)た → {夢|欲沒}{を|喔}{見|迷}{た|塔} "desire sinks, oh lost tower"
- 忘(わす)れない → {忘れない|娃思咧奈} "baby thinks, alas!" 

Happy/energetic:
- 走(はし)る → {走|哈西嚕} or {走|哈希露} "ha west dew" - pick what fits!
- 飛(と)ぶ → {飛|頭布} "head cloth" or {飛|兔步} "rabbit steps"

=== HOW TO USE FURIGANA ===

The furigana tells you pronunciation. Be creative with the Chinese!
- 大切(たいせつ)な人(ひと) → {大切|太惜刺}{な|那}{人|嘻頭} "too cherished thorn, that playful head"
- 名前(なまえ) → {名前|那嘛诶} or {名前|娜媽欸} - choose based on context

=== KANA GUIDELINES (flexible, not strict!) ===

These are suggestions - feel free to pick different characters that sound similar AND add meaning:
- あ → 阿/啊/娃, い → 衣/一/以, う → 屋/烏/舞, え → 欸/诶/耶, お → 喔/哦/噢
- か → 咖/卡/嘎, き → 奇/期/棋, く → 酷/哭/枯, け → 給/可/課, こ → 口/哭/枯
- さ → 撒/薩/灑, し → 西/思/詩, す → 蘇/速/訴, せ → 些/謝/洩, そ → 搜/梭/訴
- た → 他/她/塔, ち → 吃/痴/遲, つ → 此/刺/促, て → 貼/鐵/蝶, と → 頭/兔/途
- な → 那/娜/奈, に → 你/泥/尼, ぬ → 奴/怒, ね → 內/捏/涅, の → 諾/糯/挪
- は → 哈/哇/花, ひ → 嘻/希/悲, ふ → 夫/福/浮, へ → 嘿/黑/嘿, ほ → 火/乎/呼
- ま → 媽/嘛/馬, み → 咪/迷/蜜, む → 木/慕/霧, め → 沒/梅/迷, も → 摸/莫/默
- や → 壓/呀/雅, ゆ → 玉/欲/雨, よ → 喲/呦/幽
- ら → 啦/拉/辣, り → 里/離/理, る → 嚕/路/露, れ → 咧/裂/烈, ろ → 囉/落/洛
- わ → 哇/娃/挖, を → 喔/我/握, ん → 嗯/恩/音

SPECIAL: っ/ッ (gemination) → ～ Example: ずっと → {ずっと|祖～頭} or {ずっと|族～途}

=== FORMAT ===

1. Format: {original|chinese_reading} for ALL Japanese text (kanji AND kana)
2. English stays unwrapped
3. Annotate EVERY segment!
4. PURE CHINESE only - no kana allowed in readings!
5. Use furigana pronunciation as your sound guide

BE CREATIVE! A beautiful Chinese phrase that's 80% phonetically accurate is better than an ugly phrase that's 100% accurate. Tell a story with your characters!`;

// AI generation timeout (120 seconds for full song streaming)
// Increased since streaming keeps connection alive and we process entire song
const AI_TIMEOUT_MS = 120000;

/**
 * Clean AI output by removing malformed segments like {reading} without text
 * These occur when AI outputs just Chinese characters in braces without the original text
 */
function cleanAiOutput(line: string): string {
  // Remove malformed {reading} patterns (Chinese chars in braces without pipe)
  // Match {content} where content has no pipe and contains CJK characters
  return line.replace(/\{([^|{}]+)\}(?!\|)/g, (match, content) => {
    // If it contains CJK characters and no pipe, it's likely a malformed reading - remove it
    if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(content) && !content.includes('|')) {
      return '';
    }
    return match;
  });
}

/**
 * Clean reading to remove non-Chinese characters (Korean Hangul, Japanese kana)
 * AI sometimes incorrectly includes original text in the reading
 */
function cleanReading(reading: string): string {
  // Remove Korean (Hangul syllables and Jamo) and Japanese (Hiragana and Katakana)
  return reading.replace(/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\u3040-\u309F\u30A0-\u30FF]/g, '');
}

/**
 * Parse ruby markup format (e.g., "{사랑|思浪} {해요|海喲}") into FuriganaSegment array
 * 
 * SIMPLIFIED APPROACH: Trust the AI output directly without complex alignment.
 * This is the same approach used by furigana and is more robust for Korean text
 * which has spaces between words (unlike Japanese).
 */
/**
 * Strip furigana annotations from text
 * When we send annotated text like 耳(みみ), the AI outputs {耳(みみ)|咪咪}
 * We need to remove the (みみ) part to get just the original kanji
 */
function stripFuriganaAnnotation(text: string): string {
  // Remove parenthesized hiragana/katakana readings: 耳(みみ) -> 耳
  return text.replace(/\([\u3040-\u309F\u30A0-\u30FF]+\)/g, '');
}

function parseRubyMarkup(line: string): FuriganaSegment[] {
  // First clean the line of malformed segments
  const cleanedLine = cleanAiOutput(line);
  
  const segments: FuriganaSegment[] = [];
  
  // Match {text|reading} patterns and plain text between them
  const regex = /\{([^|}]+)\|([^}]+)\}/g;
  let match;
  let lastIndex = 0;
  
  while ((match = regex.exec(cleanedLine)) !== null) {
    // Add any plain text before this match (preserving it exactly as-is)
    if (match.index > lastIndex) {
      let textBefore = cleanedLine.slice(lastIndex, match.index);
      // AI sometimes outputs "|" as delimiter between words - strip it but keep spaces
      // e.g., "{넌|嫩} |{언제나|摁這那}" -> strip the standalone |
      textBefore = textBefore.replace(/\|/g, '');
      // Strip furigana annotations from plain text too
      textBefore = stripFuriganaAnnotation(textBefore);
      if (textBefore) {
        // Keep text exactly as-is, including spaces
        segments.push({ text: textBefore });
      }
    }
    
    // Strip furigana annotations from the text portion
    const text = stripFuriganaAnnotation(match[1]);
    const reading = cleanReading(match[2]);

    if (text) {
      // Only add reading if it's not empty after cleaning
      if (reading) {
        segments.push({ text, reading });
      } else {
        segments.push({ text });
      }
    }
    
    lastIndex = regex.lastIndex;
  }
  
  // Handle any remaining text after the last match
  if (lastIndex < cleanedLine.length) {
    let remaining = cleanedLine.slice(lastIndex);
    // Strip standalone | delimiters
    remaining = remaining.replace(/\|/g, '');
    // Strip furigana annotations
    remaining = stripFuriganaAnnotation(remaining);
    if (remaining) {
      segments.push({ text: remaining });
    }
  }
  
  return segments.length > 0 ? segments : [{ text: line }];
}

// =============================================================================
// NOTE: Complex alignment functions removed in favor of simpler approach
// =============================================================================
// 
// The previous implementation had `alignSegmentsToOriginal` and `buildFallbackSegments`
// which attempted to realign AI output to the original text character-by-character.
// 
// This caused issues with Korean text because:
// 1. Korean uses spaces between words (unlike Japanese)
// 2. Unicode normalization mismatches (NFC vs NFD) caused string comparisons to fail
// 3. When alignment failed, readings were lost
// 
// The new approach (same as furigana) trusts the AI output directly.
// The AI is instructed to output {original|reading} format which preserves the text.
// =============================================================================

/** Result of soramimi generation */
export interface SoramimiResult {
  segments: FuriganaSegment[][];
  /** True if AI generation succeeded, false if fallback was used */
  success: boolean;
}

// =============================================================================
// Furigana to Annotated Text Conversion
// =============================================================================

/**
 * Convert furigana segments to annotated text format for the AI prompt.
 * Adds hiragana readings in parentheses after kanji so the AI knows the pronunciation.
 * 
 * Example: [{text: "私", reading: "わたし"}, {text: "は"}] → "私(わたし)は"
 * 
 * This helps the AI generate accurate Chinese phonetic readings based on
 * the actual Japanese pronunciation rather than guessing.
 */
export function furiganaToAnnotatedText(segments: FuriganaSegment[]): string {
  return segments.map(seg => {
    if (seg.reading) {
      // Add the reading in parentheses after the text
      // This tells the AI exactly how the kanji is pronounced
      return `${seg.text}(${seg.reading})`;
    }
    return seg.text;
  }).join("");
}

/**
 * Convert an array of lyric lines with their furigana to annotated text.
 * For lines without furigana, returns the original text.
 * 
 * @param lines - Lyric lines (just need words property)
 * @param furigana - 2D array of furigana segments, indexed by line
 * @returns Array of annotated text strings
 */
export function convertLinesToAnnotatedText(
  lines: { words: string }[],
  furigana: FuriganaSegment[][] | undefined
): string[] {
  return lines.map((line, index) => {
    // If we have furigana for this line, convert it to annotated text
    if (furigana && furigana[index] && furigana[index].length > 0) {
      // Check if any segment has a reading (otherwise it's just plain text split into segments)
      const hasReadings = furigana[index].some(seg => seg.reading);
      if (hasReadings) {
        return furiganaToAnnotatedText(furigana[index]);
      }
    }
    // No furigana available, return original text
    return line.words;
  });
}

/**
 * Stream soramimi generation for all lyrics line-by-line using streamText
 * Emits each line as it's completed via onLine callback
 * 
 * English lines are kept intact without any Chinese phonetic readings.
 * 
 * @param lines - All lyrics lines to process
 * @param requestId - Request ID for logging
 * @param onLine - Callback called for each completed line (lineIndex, segments)
 * @returns Promise that resolves when streaming is complete
 */
export async function streamSoramimi(
  lines: LyricLine[],
  requestId: string,
  onLine: (lineIndex: number, segments: FuriganaSegment[]) => void
): Promise<SoramimiResult> {
  if (lines.length === 0) {
    return { segments: [], success: true };
  }

  // Separate English lines from non-English lines
  // English lines will be returned as-is without soramimi processing
  const lineInfo = lines.map((line, originalIndex) => ({
    line,
    originalIndex,
    isEnglish: isEnglishLine(line.words),
  }));

  const nonEnglishLines = lineInfo.filter(info => !info.isEnglish);
  const englishCount = lineInfo.filter(info => info.isEnglish).length;

  // Initialize results with fallback
  const results: FuriganaSegment[][] = new Array(lines.length);
  for (let i = 0; i < lines.length; i++) {
    results[i] = [{ text: lines[i].words }];
  }

  logInfo(requestId, `Soramimi stream starting`, { 
    totalLines: lines.length, 
    englishLines: englishCount, 
    nonEnglishLines: nonEnglishLines.length 
  });

  // Emit English lines immediately (they don't need processing)
  for (const info of lineInfo) {
    if (info.isEnglish) {
      onLine(info.originalIndex, results[info.originalIndex]);
    }
  }

  // If all lines are English, return them as plain text
  if (nonEnglishLines.length === 0) {
    logInfo(requestId, `All lines are English, skipping soramimi AI generation`);
    return { segments: results, success: true };
  }

  // Use numbered lines to help AI maintain line count (only for non-English lines)
  const textsToProcess = nonEnglishLines.map((info, idx) => `${idx + 1}: ${info.line.words}`).join("\n");

  const startTime = Date.now();
  logInfo(requestId, `Soramimi AI stream starting`, { linesCount: nonEnglishLines.length, timeoutMs: AI_TIMEOUT_MS });

  let completedCount = 0;
  let currentLineBuffer = "";

  // Helper to process a complete line
  const processLine = (line: string) => {
    const trimmedLine = line.trim();
    if (!trimmedLine) return;
    
    // Parse line number format: "1: {annotated|text}"
    const match = trimmedLine.match(/^(\d+)[:.\s]\s*(.*)$/);
    if (match) {
      const nonEnglishLineIndex = parseInt(match[1], 10) - 1;
      const content = match[2].trim();
      
      if (nonEnglishLineIndex >= 0 && nonEnglishLineIndex < nonEnglishLines.length && content) {
        const info = nonEnglishLines[nonEnglishLineIndex];
        const originalIndex = info.originalIndex;
        
        // SIMPLIFIED: Parse segments directly without complex alignment
        // The AI is instructed to output {original|reading} which preserves the text
        // This approach is more robust for Korean (which has spaces) and avoids
        // Unicode normalization issues that caused only the first word to work
        const rawSegments = parseRubyMarkup(content);
        const finalSegments = fillMissingReadings(rawSegments);
        
        results[originalIndex] = finalSegments;
        completedCount++;
        onLine(originalIndex, finalSegments);
      }
    }
  };

  try {
    // Use streamText and get the native text stream response
    const result = streamText({
      model: google("gemini-2.5-flash"),
      messages: [
        { role: "system", content: SORAMIMI_SYSTEM_PROMPT },
        { role: "user", content: textsToProcess },
      ],
      temperature: 0.7,
    });

    // Use toTextStreamResponse() to get native AI SDK streaming
    const textStreamResponse = result.toTextStreamResponse();
    const reader = textStreamResponse.body!.getReader();
    const decoder = new TextDecoder();
    
    let chunkCount = 0;
    let firstChunkTime: number | null = null;
    
    // Read from the native text stream response
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        break;
      }
      
      const text = decoder.decode(value, { stream: true });
      
      if (firstChunkTime === null && text.length > 0) {
        firstChunkTime = Date.now();
      }
      
      chunkCount++;
      currentLineBuffer += text;
      
      // Process complete lines (ending with newline)
      let newlineIdx;
      while ((newlineIdx = currentLineBuffer.indexOf("\n")) !== -1) {
        const completeLine = currentLineBuffer.slice(0, newlineIdx);
        currentLineBuffer = currentLineBuffer.slice(newlineIdx + 1);
        processLine(completeLine);
      }
    }
    
    // Process any remaining content in buffer
    if (currentLineBuffer.trim()) {
      processLine(currentLineBuffer);
    }

    const totalDurationMs = Date.now() - startTime;
    logInfo(requestId, `Soramimi AI stream completed`, { totalDurationMs, chunkCount });
    
    // Emit fallback for any non-English lines that weren't processed
    for (const info of nonEnglishLines) {
      const hasResult = results[info.originalIndex].some(seg => seg.reading);
      if (!hasResult) {
        // Not yet processed with readings, emit as fallback
        const fallback = fillMissingReadings([{ text: info.line.words }]);
        results[info.originalIndex] = fallback;
        onLine(info.originalIndex, fallback);
      }
    }
    
    logInfo(requestId, `Soramimi processing completed`, { 
      totalDurationMs, 
      completedNonEnglishLines: completedCount, 
      totalNonEnglishLines: nonEnglishLines.length,
      totalLines: lines.length
    });
    
    return { segments: results, success: true };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    
    logError(requestId, `Soramimi stream failed`, { error, durationMs, completedCount });
    
    // Emit fallback for remaining non-English lines
    for (const info of nonEnglishLines) {
      const hasResult = results[info.originalIndex].some(seg => seg.reading);
      if (!hasResult) {
        const fallback = fillMissingReadings([{ text: info.line.words }]);
        results[info.originalIndex] = fallback;
        onLine(info.originalIndex, fallback);
      }
    }
    
    return { segments: results, success: false };
  }
}
