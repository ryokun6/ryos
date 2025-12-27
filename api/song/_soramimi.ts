/**
 * Soramimi Generation Functions (空耳 - Chinese Misheard Lyrics)
 * 
 * Handles generating Chinese phonetic readings for non-Chinese lyrics.
 */

import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { logInfo, logError, type LyricLine } from "./_utils.js";
import type { FuriganaSegment } from "../_utils/song-service.js";

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

const SORAMIMI_SYSTEM_PROMPT = `Create Chinese 空耳 (soramimi) phonetic readings. Use Traditional Chinese (繁體字).

CRITICAL: KEEP ENGLISH WORDS INTACT
- English words should be output exactly as-is WITHOUT any Chinese reading
- Only add Chinese readings for Japanese kana, Japanese kanji, and Korean characters
- Format for English: just the word itself, no braces: "hello" → hello
- Format for non-English: {original|chinese}

IMPORTANT: Use MEANINGFUL Chinese words when possible!
- Prefer real Chinese words/phrases over random phonetic characters
- Choose characters that sound similar AND have related or interesting meanings
- Use common, recognizable vocabulary

COVERAGE RULES BY LANGUAGE:
- Japanese kana: EACH kana = 1 Chinese char (prefer meaningful chars):
  {な|娜}{に|妮}{げ|給} or {な|那}{に|你}{げ|鬼}
- Japanese kanji: BY SYLLABLE COUNT of the reading, use meaningful words:
  - 愛(あい/ai) "love" = 2 syllables → {愛|哀} (哀 āi = sorrow, poetic!)
  - 夢(ゆめ/yume) "dream" = 2 syllables → {夢|玉美} (玉美 = jade beauty)
  - 雪(ゆき/yuki) "snow" = 2 syllables → {雪|遇奇} (遇奇 = encounter wonder)
  - 君(きみ/kimi) "you" = 2 syllables → {君|奇蜜} (奇蜜 = sweet miracle)
  - 心(こころ/kokoro) "heart" = 3 syllables → {心|叩叩肉} (knocking flesh/heart)
  - 花(はな/hana) "flower" = 2 syllables → {花|哈娜} (哈娜 = a lovely name)
  - 空(そら/sora) "sky" = 2 syllables → {空|搜啦}
  - 歌(うた/uta) "song" = 2 syllables → {歌|嗚她} (cry for her)
- Japanese っ (small tsu) or — (long dash): Use ～ for the pause: {っ|～} or {—|～}
- English: KEEP AS-IS, no Chinese reading: "love" → love, "hello" → hello
- Korean: BY SYLLABLE, prefer meaningful matches:
  - 안녕(annyeong) "peace/hello" → {안|安}{녕|寧} (安寧 = peace, SAME meaning!)
  - 사랑(sarang) "love" → {사|撒}{랑|浪} (撒浪 = scatter waves)
  - 감사(gamsa) "thanks" → {감|甘}{사|謝} (甘謝 = sweet thanks)
  - 행복(haengbok) "happiness" → {행|幸}{복|福} (幸福 = happiness, SAME meaning!)
  - 영원히(yeongwonhi) "forever" → {영|永}{원|遠}{히|嘻} (永遠 = forever!)
  - 시간(sigan) "time" → {시|時}{간|間} (時間 = time, SAME meaning!)
  - 세상(sesang) "world" → {세|世}{상|上} (世上 = world, SAME meaning!)
  - 기억(gieok) "memory" → {기|奇}{억|憶} (奇憶 = wonder + remember)
  - 마음(maeum) "heart" → {마|媽}{음|音} (媽音 = mother's sound)
  - 노래(norae) "song" → {노|諾}{래|來} (諾來 = promise comes)
  - 하늘(haneul) "sky" → {하|哈}{늘|呢}
  - 눈물(nunmul) "tears" → {눈|嫩}{물|木}
  - 미안(mian) "sorry" → {미|迷}{안|安}
  - 좋아해(joahae) "I like you" → {좋|就}{아|啊}{해|嗨}

Format: {original|chinese} for non-English, plain text for English

LINE RULES:
- Input: "1: text" → Output: "1: {x|讀}..." or "1: english words"
- Keep exact same line numbers
- For mixed lines: {日本語|讀音} English words {日本語|讀音}

Japanese kana reference (basic phonetic mapping):
あ阿 い衣 う屋 え欸 お喔 | か咖 き奇 く酷 け給 こ可
さ撒 し詩 す蘇 せ些 そ搜 | た她 ち吃 つ此 て貼 と頭
な娜 に妮 ぬ奴 ね內 の諾 | は哈 ひ嘻 ふ夫 へ嘿 ほ火
ま媽 み咪 む木 め沒 も摸 | ら啦 り里 る嚕 れ咧 ろ囉
わ哇 を喔 ん嗯 っ～ —～

Korean syllable reference (common mappings):
아阿 어喔 오喔 우屋 으嗯 이衣 | 가咖 거哥 고高 구姑 기奇
나娜 너呢 노諾 누奴 니妮 | 다她 더德 도都 두肚 디低
마媽 머摸 모摸 무木 미咪 | 바爸 버波 보寶 부夫 비比
사撒 서些 소搜 수蘇 시詩 | 자渣 저這 조就 주朱 지知
하哈 허賀 호火 후乎 히嘻 | 라啦 러樂 로囉 루嚕 리里

Example:
Input:
1: 夢を見ていた
2: I love you
3: 君をloveしてる
4: 안녕하세요
5: 사랑해 영원히
6: 행복한 시간

Output:
1: {夢|玉美}{を|喔}{見|咪}{て|貼}{い|衣}{た|她}
2: I love you
3: {君|奇蜜}{を|喔}love{し|詩}{て|貼}{る|嚕}
4: {안|安}{녕|寧}{하|哈}{세|些}{요|喲}
5: {사|撒}{랑|浪}{해|嗨} {영|永}{원|遠}{히|嘻}
6: {행|幸}{복|福}{한|漢} {시|時}{간|間}`;

// AI generation timeout (60 seconds)
const AI_TIMEOUT_MS = 60000;

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
 * Generate soramimi for a chunk of lyrics
 * Returns { segments, success } where success=false means fallback was used (don't cache)
 * 
 * English lines are kept intact without any Chinese phonetic readings.
 */
export async function generateSoramimiForChunk(
  lines: LyricLine[],
  requestId: string
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

  logInfo(requestId, `Soramimi processing`, { 
    totalLines: lines.length, 
    englishLines: englishCount, 
    nonEnglishLines: nonEnglishLines.length 
  });

  // If all lines are English, return them as plain text
  if (nonEnglishLines.length === 0) {
    logInfo(requestId, `All lines are English, skipping soramimi AI generation`);
    return { 
      segments: lines.map((line) => [{ text: line.words }]),
      success: true 
    };
  }

  // Use numbered lines to help AI maintain line count (only for non-English lines)
  const textsToProcess = nonEnglishLines.map((info, idx) => `${idx + 1}: ${info.line.words}`).join("\n");

  // Create abort controller with timeout
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), AI_TIMEOUT_MS);

  const startTime = Date.now();
  logInfo(requestId, `Soramimi AI generation starting`, { linesCount: nonEnglishLines.length, timeoutMs: AI_TIMEOUT_MS });

  try {
    const { text: responseText } = await generateText({
      model: google("gemini-2.5-flash"),
      messages: [
        { role: "system", content: SORAMIMI_SYSTEM_PROMPT },
        { role: "user", content: textsToProcess },
      ],
      temperature: 0.7,
      abortSignal: abortController.signal,
    });
    
    clearTimeout(timeoutId);
    const durationMs = Date.now() - startTime;
    logInfo(requestId, `Soramimi AI generation completed`, { durationMs, responseLength: responseText.length });

    // Parse the ruby markup response with line number matching
    const responseLines = responseText.trim().split("\n");
    
    // Build a map of line number -> parsed content (for non-English lines only)
    const lineContentMap = new Map<number, FuriganaSegment[]>();
    for (const responseLine of responseLines) {
      const trimmed = responseLine.trim();
      if (!trimmed) continue;
      
      // Try to extract line number prefix (e.g., "1: content" or "1. content")
      const lineNumMatch = trimmed.match(/^(\d+)[:.\s]\s*(.*)$/);
      if (lineNumMatch) {
        const lineNum = parseInt(lineNumMatch[1], 10);
        const content = lineNumMatch[2];
        lineContentMap.set(lineNum, parseRubyMarkup(content));
      } else {
        // No line number - try to use sequential position
        // This handles cases where AI doesn't include line numbers
        const nextExpectedLine = lineContentMap.size + 1;
        lineContentMap.set(nextExpectedLine, parseRubyMarkup(trimmed));
      }
    }

    const matchedCount = Math.min(lineContentMap.size, nonEnglishLines.length);
    if (matchedCount < nonEnglishLines.length) {
      logInfo(requestId, `Warning: Soramimi response line mismatch - expected ${nonEnglishLines.length}, matched ${matchedCount}`, { 
        expectedLines: nonEnglishLines.length, 
        responseLines: responseLines.length,
        matchedLines: matchedCount,
        willUseFallbackForMissing: true 
      });
    }

    // Build a map from non-English line index (1-based) to parsed segments
    const nonEnglishResultMap = new Map<number, FuriganaSegment[]>();
    for (let i = 0; i < nonEnglishLines.length; i++) {
      const lineNum = i + 1;
      const info = nonEnglishLines[i];
      const rawSegments = lineContentMap.get(lineNum) || [{ text: info.line.words }];
      const original = info.line.words;
      
      // Align segments to original text (handles spacing mismatches)
      nonEnglishResultMap.set(info.originalIndex, alignSegmentsToOriginal(rawSegments, original));
    }

    // Build final result, inserting English lines as plain text
    const segments = lineInfo.map((info) => {
      if (info.isEnglish) {
        // English line: return as plain text without readings
        return [{ text: info.line.words }];
      } else {
        // Non-English line: use the parsed soramimi result
        return nonEnglishResultMap.get(info.originalIndex) || [{ text: info.line.words }];
      }
    });

    return { segments, success: true };
  } catch (error) {
    clearTimeout(timeoutId);
    const durationMs = Date.now() - startTime;
    const isTimeout = error instanceof Error && error.name === "AbortError";
    logError(requestId, `Soramimi chunk failed${isTimeout ? " (timeout)" : ""}, returning plain text segments as fallback`, { error, durationMs, isTimeout });
    return { 
      segments: lines.map((line) => [{ text: line.words }]),
      success: false 
    };
  }
}
