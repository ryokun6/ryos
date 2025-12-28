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

const SORAMIMI_SYSTEM_PROMPT = `Create 空耳 (soramimi) - Traditional Chinese (繁體字) phonetic readings that sound like the original AND form beautiful, meaningful Chinese phrases.

FORMAT: {original|chinese} for Japanese/Korean, plain English stays unwrapped

GROUPING (Critical!):
- Group by natural phrase boundaries (2-4 segments per line)
- Keep verb phrases together: {見ていた|密貼伊她} not {見|密}{て|貼}{い|伊}{た|她}
- Keep particles with their words: {君を|寄迷我} or {夢の|欲沒諾}
- Korean words as units: {사랑해|思浪海}

PHONETIC + POETIC EXAMPLES (must sound similar AND mean something beautiful):
- 君を (ki-mi-wo) → 寄迷我 (jì-mí-wǒ) = "lost in thoughts of me" ♡ echoes "you"
- 夢を (yu-me-wo) → 欲沒我 (yù-mò-wǒ) = "desire drowns me" ♡ echoes "dream"
- 見ていた (mi-te-i-ta) → 密貼伊她 (mì-tiē-yī-tā) = "closely cling to her" ♡ echoes "watching"
- 愛してる (a-i-shi-te-ru) → 愛詩特露 (ài-shī-tè-lù) = "love poem, special dew" ♡ starts with 愛!
- 사랑해 (sa-rang-hae) → 思浪海 (sī-làng-hǎi) = "longing for waves and sea" ♡ romantic
- 桜 (sa-ku-ra) → 撒枯落 (sā-kū-luò) = "scatter, wither, fall" ♡ cherry blossoms falling!
- 涙 (na-mi-da) → 那迷答 (nà-mí-dá) = "that puzzling answer" ♡ tears are confusing
- 心 (ko-ko-ro) → 可可柔 (kě-kě-róu) = "so so gentle" ♡ soft heart
- 空 (so-ra) → 嗖啦 (sōu-la) = "whoosh" ♡ wind in the sky

RULES:
1. EVERY Japanese/Korean character needs a Chinese reading
2. Only Chinese characters in readings (never ひらがな/カタカナ)
3. Match syllable count and sounds
4. No added punctuation (，。！)
5. PRIORITIZE meaningful readings that echo the original meaning!

Example:
Input:
1: 夢を見ていた
2: I love you  
3: 君をloveしてる
4: 사랑해요

Output:
1: {夢を|欲沒}{見ていた|密貼伊她}
2: I love you
3: {君を|寄迷我}love{してる|詩特露}
4: {사랑|思浪}{해요|海喲}`;

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
 * Parse ruby markup format (e.g., "{Sor|搜} {ry|哩}") into FuriganaSegment array
 * Preserves spaces as plain text segments for proper timing alignment
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
    // Add any plain text before this match (including spaces)
    if (match.index > lastIndex) {
      const textBefore = cleanedLine.slice(lastIndex, match.index);
      if (textBefore) {
        // Only add non-empty, non-whitespace-only segments, or single space
        if (textBefore === ' ') {
          segments.push({ text: ' ' });
        } else if (textBefore.trim()) {
          segments.push({ text: textBefore.trim() });
        }
      }
    }
    
    const text = match[1];
    const reading = match[2];
    
    if (text) {
      segments.push({ text, reading });
    }
    
    lastIndex = regex.lastIndex;
  }
  
  // Handle any remaining text
  if (lastIndex < cleanedLine.length) {
    const remaining = cleanedLine.slice(lastIndex);
    if (remaining && remaining.trim()) {
      segments.push({ text: remaining.trim() });
    }
  }
  
  return segments.length > 0 ? segments : [{ text: line }];
}

/**
 * Align parsed segments to match the original text by word boundaries
 * Simple approach: match segments to words in original, insert spaces between
 */
function alignSegmentsToOriginal(segments: FuriganaSegment[], original: string): FuriganaSegment[] {
  // Filter out space-only segments (we'll reconstruct spaces from original)
  const contentSegments = segments.filter(s => s.text.trim());
  
  if (contentSegments.length === 0) {
    return [{ text: original }];
  }
  
  const result: FuriganaSegment[] = [];
  let originalIdx = 0;
  let segmentIdx = 0;
  
  while (originalIdx < original.length && segmentIdx < contentSegments.length) {
    const char = original[originalIdx];
    
    // Handle spaces - add them directly
    if (char === ' ') {
      if (result.length > 0 && result[result.length - 1].text !== ' ') {
        result.push({ text: ' ' });
      }
      originalIdx++;
      continue;
    }
    
    const segment = contentSegments[segmentIdx];
    const segmentText = segment.text;
    
    // Try to find this segment starting from current position
    const remainingOriginal = original.slice(originalIdx);
    
    // Case-insensitive search for the segment text
    const matchIndex = remainingOriginal.toLowerCase().indexOf(segmentText.toLowerCase());
    
    if (matchIndex === 0) {
      // Segment matches at current position
      const matchedText = original.slice(originalIdx, originalIdx + segmentText.length);
      result.push({ text: matchedText, reading: segment.reading });
      originalIdx += segmentText.length;
      segmentIdx++;
    } else if (matchIndex > 0 && matchIndex < 3) {
      // Segment is close (within a few chars) - add skipped chars without reading
      for (let i = 0; i < matchIndex; i++) {
        const skippedChar = original[originalIdx + i];
        if (skippedChar === ' ') {
          if (result.length === 0 || result[result.length - 1].text !== ' ') {
            result.push({ text: ' ' });
          }
        } else {
          result.push({ text: skippedChar });
        }
      }
      originalIdx += matchIndex;
      // Don't increment segmentIdx - retry matching the segment
    } else {
      // Segment doesn't match well - add current char and move on
      result.push({ text: char });
      originalIdx++;
      
      // If we've gone too far without finding the segment, skip it
      if (matchIndex < 0 || matchIndex > 10) {
        segmentIdx++;
      }
    }
  }
  
  // Add any remaining original text
  while (originalIdx < original.length) {
    const char = original[originalIdx];
    if (char === ' ') {
      if (result.length === 0 || result[result.length - 1].text !== ' ') {
        result.push({ text: ' ' });
      }
    } else {
      result.push({ text: char });
    }
    originalIdx++;
  }
  
  // Verify reconstruction
  const reconstructed = result.map(s => s.text).join('');
  if (reconstructed !== original) {
    // Alignment failed - return simple fallback with readings where we can find them
    return buildFallbackSegments(segments, original);
  }
  
  return result;
}

/**
 * Fallback: Build segments by splitting original text and matching readings
 */
function buildFallbackSegments(segments: FuriganaSegment[], original: string): FuriganaSegment[] {
  const result: FuriganaSegment[] = [];
  const words = original.split(/(\s+)/); // Split but keep spaces
  
  // Build a map of text -> reading from segments
  const readingMap = new Map<string, string>();
  for (const seg of segments) {
    if (seg.reading && seg.text.trim()) {
      readingMap.set(seg.text.toLowerCase(), seg.reading);
    }
  }
  
  for (const word of words) {
    if (!word) continue;
    
    if (/^\s+$/.test(word)) {
      // It's whitespace
      result.push({ text: ' ' });
    } else {
      // Try to find a reading for this word or its parts
      const reading = readingMap.get(word.toLowerCase());
      if (reading) {
        result.push({ text: word, reading });
      } else {
        // Try to find readings for substrings
        let found = false;
        for (const [text, r] of readingMap) {
          if (word.toLowerCase().startsWith(text)) {
            result.push({ text: word.slice(0, text.length), reading: r });
            if (word.length > text.length) {
              result.push({ text: word.slice(text.length) });
            }
            found = true;
            break;
          }
        }
        if (!found) {
          result.push({ text: word });
        }
      }
    }
  }
  
  return result.length > 0 ? result : [{ text: original }];
}

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

  // Create abort controller with timeout
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), AI_TIMEOUT_MS);

  const startTime = Date.now();
  logInfo(requestId, `Soramimi AI stream starting`, { linesCount: nonEnglishLines.length, timeoutMs: AI_TIMEOUT_MS });

  let currentLineBuffer = "";
  let completedCount = 0;

  try {
    const result = streamText({
      model: google("gemini-2.5-flash"),
      messages: [
        { role: "system", content: SORAMIMI_SYSTEM_PROMPT },
        { role: "user", content: textsToProcess },
      ],
      temperature: 0.7,
      abortSignal: abortController.signal,
    });

    // Process streaming text
    for await (const chunk of result.textStream) {
      currentLineBuffer += chunk;
      
      // Process complete lines (ending with newline)
      let newlineIdx;
      while ((newlineIdx = currentLineBuffer.indexOf("\n")) !== -1) {
        const completeLine = currentLineBuffer.slice(0, newlineIdx).trim();
        currentLineBuffer = currentLineBuffer.slice(newlineIdx + 1);
        
        if (!completeLine) continue;
        
        // Parse line number format: "1: {annotated|text}"
        const match = completeLine.match(/^(\d+)[:.\s]\s*(.*)$/);
        if (match) {
          const nonEnglishLineIndex = parseInt(match[1], 10) - 1; // 1-based to 0-based in non-English lines
          const content = match[2].trim();
          
          if (nonEnglishLineIndex >= 0 && nonEnglishLineIndex < nonEnglishLines.length && content) {
            const info = nonEnglishLines[nonEnglishLineIndex];
            const originalIndex = info.originalIndex;
            const original = info.line.words;
            
            // Parse and align segments
            const rawSegments = parseRubyMarkup(content);
            const alignedSegments = alignSegmentsToOriginal(rawSegments, original);
            const finalSegments = fillMissingReadings(alignedSegments);
            
            results[originalIndex] = finalSegments;
            completedCount++;
            onLine(originalIndex, finalSegments);
          }
        }
      }
    }
    
    // Handle any remaining content (last line might not end with newline)
    if (currentLineBuffer.trim()) {
      const match = currentLineBuffer.trim().match(/^(\d+)[:.\s]\s*(.*)$/);
      if (match) {
        const nonEnglishLineIndex = parseInt(match[1], 10) - 1;
        const content = match[2].trim();
        
        if (nonEnglishLineIndex >= 0 && nonEnglishLineIndex < nonEnglishLines.length && content) {
          const info = nonEnglishLines[nonEnglishLineIndex];
          const originalIndex = info.originalIndex;
          const original = info.line.words;
          
          const rawSegments = parseRubyMarkup(content);
          const alignedSegments = alignSegmentsToOriginal(rawSegments, original);
          const finalSegments = fillMissingReadings(alignedSegments);
          
          results[originalIndex] = finalSegments;
          completedCount++;
          onLine(originalIndex, finalSegments);
        }
      }
    }
    
    clearTimeout(timeoutId);
    const durationMs = Date.now() - startTime;
    
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
    
    logInfo(requestId, `Soramimi stream completed`, { 
      durationMs, 
      completedNonEnglishLines: completedCount, 
      totalNonEnglishLines: nonEnglishLines.length,
      totalLines: lines.length
    });
    
    return { segments: results, success: true };
  } catch (error) {
    clearTimeout(timeoutId);
    const durationMs = Date.now() - startTime;
    const isTimeout = error instanceof Error && error.name === "AbortError";
    
    logError(requestId, `Soramimi stream failed${isTimeout ? " (timeout)" : ""}`, { error, durationMs, completedCount });
    
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
