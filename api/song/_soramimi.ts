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

export const SORAMIMI_SYSTEM_PROMPT = `Create 空耳 (soramimi) - Chinese phonetic readings/misheard lyrics (繁體字) that SOUND like Japanese/Korean lyrics.

CRITICAL: The reading field must contain ONLY Chinese characters! Never include Korean Hangul or Japanese kana in readings!

=== JAPANESE EXAMPLES ===

WRONG vs RIGHT:
- 何 read as "nani" → WRONG: {何|何} RIGHT: {何|那你}
- 私 read as "watashi" → WRONG: {私|我} RIGHT: {私|哇他西}
- 前 read as "mae" → WRONG: {前|前} RIGHT: {前|麥}
- 目 read as "me" → WRONG: {目|目} RIGHT: {目|沒}
- 夢 read as "yume" → WRONG: {夢|夢} RIGHT: {夢|欲沒}
- 心 read as "kokoro" → WRONG: {心|心} RIGHT: {心|口口落}

Common Japanese words:
- 何もいらない (na-ni-mo-i-ra-na-i) → {何|那你}{も|摸}{いらない|衣啦那衣}
- 私に (wa-ta-shi-ni) → {私|哇他西}{に|你}
- あなた (a-na-ta) → {あなた|阿那他}
- 好き (su-ki) → {好き|速奇}

=== KOREAN EXAMPLES ===

WRONG vs RIGHT (Korean reading must be Chinese, never Hangul!):
- 사랑 (sa-rang) → WRONG: {사랑|사랑} RIGHT: {사랑|思浪}
- 해요 (hae-yo) → WRONG: {해요|해요} RIGHT: {해요|海喲}
- 나를 (na-reul) → WRONG: {나를|나를} RIGHT: {나를|那路}
- 오빠 (o-ppa) → WRONG: {오빠|오빠} RIGHT: {오빠|偶爸}
- 사람 (sa-ram) → WRONG: {사람|사람} RIGHT: {사람|撒浪}

Common Korean words - wrap EACH word (Korean uses spaces between words):
- 사랑해요 (sa-rang-hae-yo) → {사랑해요|思浪嘿唷}
- 보고 싶어 (bo-go si-peo) → {보고|波哥} {싶어|西坡}
- 고마워요 (go-ma-wo-yo) → {고마워요|哥媽我喲}
- 나를 사랑해 (na-reul sa-rang-hae) → {나를|那路} {사랑해|思浪嘿}
- 내 마음 (nae ma-eum) → {내|奶} {마음|媽嗯}

=== FORMAT RULES ===

1. Format: {original|chinese_phonetic} for EVERY Japanese/Korean word
2. English words stay unwrapped (no braces)
3. PRESERVE spaces: Korean has spaces between words, keep them!
4. Output EVERY word - don't skip any Korean words!
5. Reading must be PURE CHINESE - no Hangul (한글) or Kana (かな) allowed!

=== PRONUNCIATION TIPS ===

Japanese: Read kanji by their Japanese pronunciation (kun/on-yomi as appropriate)
Korean: Each syllable needs a Chinese character that sounds similar:
- 사 → 思/撒, 랑 → 浪, 해 → 嘿/海, 요 → 喲
- 보 → 波, 고 → 哥, 싶 → 西, 어 → 坡/噢
- 나 → 那/奶, 를 → 路, 마 → 媽, 음 → 嗯

SPECIAL: っ/ッ (small tsu, pause/gemination) → use ～ NOT 促! Example: ずっと → {ずっと|祖～頭}

BONUS: Make readings poetic when sounds match meanings! 思浪 for 사랑 (love) is beautiful!`;

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
      if (textBefore) {
        // Keep text exactly as-is, including spaces
        segments.push({ text: textBefore });
      }
    }
    
    const text = match[1];
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
