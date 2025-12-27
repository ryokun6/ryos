/**
 * Soramimi Generation Functions (空耳 - Chinese Misheard Lyrics)
 * 
 * Handles generating Chinese phonetic readings for non-Chinese lyrics.
 */

import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { logInfo, logError, type LyricLine } from "./_utils.js";
import type { FuriganaSegment, WordTiming } from "../_utils/song-service.js";

/** Extended lyric line with optional word timing */
export interface LyricLineWithTiming extends LyricLine {
  wordTimings?: WordTiming[];
}

// =============================================================================
// Soramimi Generation
// =============================================================================

const SORAMIMI_SYSTEM_PROMPT = `Create Chinese 空耳 (soramimi) phonetic readings. Use Traditional Chinese (繁體字).

CRITICAL RULE: You MUST wrap EVERY Japanese/Korean character in {original|chinese} format. No exceptions. Never leave any Japanese kana, kanji, or Korean hangul unwrapped.

COVERAGE RULES BY LANGUAGE:
- Japanese kana: EACH kana = 1 Chinese char: {な|那}{に|你}{げ|給}
- Japanese kanji: BY SYLLABLE COUNT of the reading, NOT by kanji count:
  - 何(なに/nani) = 2 syllables → {何|那你}
  - 人(ひと/hito) = 2 syllables → {人|嘻頭}
  - 愛(あい/ai) = 2 syllables → {愛|啊一}
  - 心(こころ/kokoro) = 3 syllables → {心|可可囉}
  - 意(い/i) = 1 syllable → {意|一}
- Japanese っ (small tsu) or — (long dash): Use ～ for the pause: {っ|～} or {—|～}
- English: KEEP INTACT - do NOT add Chinese readings to English words. Leave as plain text.
- Korean: EACH syllable block = 1 Chinese char: {안|安}{녕|寧}{하|哈}{세|些}{요|唷}

Format: {original|chinese} - Chinese must SOUND like original

LINE RULES:
- Input: "1: text" → Output: "1: {x|讀}..."
- Keep exact same line numbers
- English words: Leave as plain text without {|} markup
- ALL Japanese/Korean characters MUST be wrapped - check your output!

WORD TIMING FORMAT (when input uses [w1][w2]... markers):
- Input uses [w1], [w2], etc. to mark word/syllable boundaries from karaoke timing
- You MUST preserve these markers in your output at the EXACT same positions
- Process each [wN] segment independently - the markers define timing boundaries
- Example input:  "1: [w1]何[w2]が[w3]あっ[w4]て[w5]も"
- Example output: "1: [w1]{何|那你}[w2]{が|嘎}[w3]{あ|啊}{っ|～}[w4]{て|貼}[w5]{も|摸}"

Japanese kana reference:
あ啊 い一 う嗚 え欸 お喔 | か卡 き奇 く酷 け給 こ可
さ撒 し西 す素 せ些 そ搜 | た他 ち吃 つ此 て貼 と頭
な那 に你 ぬ奴 ね內 の諾 | は哈 ひ嘻 ふ夫 へ嘿 ほ火
ま媽 み咪 む木 め沒 も摸 | ら啦 り里 る嚕 れ咧 ろ囉
わ哇 を喔 ん嗯 っ～ —～

Example:
Input:
1: 何があっても
2: sunset town
3: 愛してる forever
4: 안녕하세요

Output:
1: {何|那你}{が|嘎}{あ|啊}{っ|～}{て|貼}{も|摸}
2: sunset town
3: {愛|啊一}{し|西}{て|貼}{る|嚕} forever
4: {안|安}{녕|寧}{하|哈}{세|些}{요|唷}`;

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
 * Check if a character is Japanese (kana or kanji) or Korean (hangul)
 * These are the characters that need soramimi (Chinese phonetic) annotations
 */
function isCJKCharacter(char: string): boolean {
  // Japanese hiragana, katakana, kanji, and Korean hangul
  return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/.test(char);
}

/**
 * Check if a character is a Chinese character (used for soramimi readings)
 */
function isChineseCharacter(char: string): boolean {
  return /[\u4E00-\u9FFF\u3400-\u4DBF]/.test(char);
}

/**
 * Extract all Chinese reading characters from segments into a flat array
 * This handles cases where AI groups multiple chars (e.g., {안녕|安寧})
 */
function extractReadingChars(segments: FuriganaSegment[]): string[] {
  const chars: string[] = [];
  for (const seg of segments) {
    if (seg.reading) {
      // Extract individual Chinese characters from the reading
      for (const char of seg.reading) {
        if (isChineseCharacter(char) || char === '～') {
          chars.push(char);
        }
      }
    }
  }
  return chars;
}

/**
 * Count CJK characters in text that need readings
 */
function countCJKChars(text: string): number {
  let count = 0;
  for (const char of text) {
    if (isCJKCharacter(char)) {
      count++;
    }
  }
  return count;
}

/**
 * Build segments by distributing reading characters across CJK characters
 * This is the primary alignment strategy that ensures every CJK char gets a reading
 */
function alignSegmentsToOriginal(segments: FuriganaSegment[], original: string): FuriganaSegment[] {
  // Extract all Chinese reading characters from AI output
  const readingChars = extractReadingChars(segments);
  const cjkCount = countCJKChars(original);
  
  // If we have no readings or no CJK chars, return simple segments
  if (readingChars.length === 0 || cjkCount === 0) {
    return buildSimpleSegments(segments, original);
  }
  
  const result: FuriganaSegment[] = [];
  let readingIdx = 0;
  let i = 0;
  
  while (i < original.length) {
    const char = original[i];
    
    if (/\s/.test(char)) {
      // Whitespace - add space segment
      if (result.length === 0 || result[result.length - 1].text !== ' ') {
        result.push({ text: ' ' });
      }
      i++;
      continue;
    }
    
    if (isCJKCharacter(char)) {
      // CJK character - assign a reading
      if (readingIdx < readingChars.length) {
        result.push({ text: char, reading: readingChars[readingIdx] });
        readingIdx++;
      } else {
        // Ran out of readings - cycle back to reuse readings
        // This ensures every CJK char has SOME reading
        const cycledIdx = readingIdx % readingChars.length;
        result.push({ text: char, reading: readingChars[cycledIdx] });
        readingIdx++;
      }
      i++;
    } else {
      // Non-CJK character - group consecutive non-CJK, non-space characters
      let plainText = char;
      let j = i + 1;
      while (j < original.length && !isCJKCharacter(original[j]) && !/\s/.test(original[j])) {
        plainText += original[j];
        j++;
      }
      result.push({ text: plainText });
      i = j;
    }
  }
  
  return result;
}

/**
 * Build simple segments without reading distribution
 * Used when there are no readings or no CJK characters
 */
function buildSimpleSegments(segments: FuriganaSegment[], original: string): FuriganaSegment[] {
  // Try to match segments directly to original
  const contentSegments = segments.filter(s => s.text.trim());
  
  if (contentSegments.length === 0) {
    return [{ text: original }];
  }
  
  // Build a map of text -> reading for direct lookups
  const readingMap = new Map<string, string>();
  for (const seg of contentSegments) {
    if (seg.reading && seg.text.trim()) {
      readingMap.set(seg.text, seg.reading);
    }
  }
  
  const result: FuriganaSegment[] = [];
  let i = 0;
  
  while (i < original.length) {
    const char = original[i];
    
    if (/\s/.test(char)) {
      if (result.length === 0 || result[result.length - 1].text !== ' ') {
        result.push({ text: ' ' });
      }
      i++;
      continue;
    }
    
    // Try to match multi-character segments
    let matched = false;
    for (const [text, reading] of readingMap) {
      if (original.slice(i).startsWith(text)) {
        result.push({ text, reading });
        i += text.length;
        matched = true;
        break;
      }
    }
    
    if (!matched) {
      // No match - group non-CJK chars or add single CJK char
      if (isCJKCharacter(char)) {
        result.push({ text: char });
        i++;
      } else {
        let plainText = char;
        let j = i + 1;
        while (j < original.length && !isCJKCharacter(original[j]) && !/\s/.test(original[j])) {
          plainText += original[j];
          j++;
        }
        result.push({ text: plainText });
        i = j;
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
 * Format a line with word timing markers for AI input
 * Returns the formatted string and whether markers were used
 */
function formatLineWithTimingMarkers(line: LyricLineWithTiming): { text: string; hasMarkers: boolean } {
  if (!line.wordTimings || line.wordTimings.length === 0) {
    return { text: line.words, hasMarkers: false };
  }
  
  // Add [w1], [w2], etc. markers before each word
  const parts = line.wordTimings.map((wt, idx) => `[w${idx + 1}]${wt.text}`);
  return { text: parts.join(''), hasMarkers: true };
}

/**
 * Parse AI output that may contain word timing markers
 * Returns segments grouped by word marker, or flat segments if no markers
 */
function parseOutputWithTimingMarkers(
  content: string, 
  wordCount: number
): FuriganaSegment[][] | null {
  // Check if output contains word markers
  if (!content.includes('[w1]')) {
    return null; // No markers, use regular parsing
  }
  
  // Split by word markers and parse each segment
  const wordSegments: FuriganaSegment[][] = [];
  
  for (let i = 1; i <= wordCount; i++) {
    const markerStart = `[w${i}]`;
    const markerEnd = `[w${i + 1}]`;
    
    const startIdx = content.indexOf(markerStart);
    if (startIdx === -1) {
      // Marker not found - add empty segment
      wordSegments.push([]);
      continue;
    }
    
    const contentStart = startIdx + markerStart.length;
    let contentEnd: number;
    
    if (i < wordCount) {
      const endIdx = content.indexOf(markerEnd, contentStart);
      contentEnd = endIdx !== -1 ? endIdx : content.length;
    } else {
      contentEnd = content.length;
    }
    
    const wordContent = content.slice(contentStart, contentEnd);
    const segments = parseRubyMarkup(wordContent);
    wordSegments.push(segments);
  }
  
  return wordSegments;
}

/**
 * Flatten word-grouped segments back to a single segment array
 * Preserves the word boundary structure for proper timing alignment
 */
function flattenWordSegments(wordSegments: FuriganaSegment[][]): FuriganaSegment[] {
  const result: FuriganaSegment[] = [];
  for (const segments of wordSegments) {
    result.push(...segments);
  }
  return result;
}

/**
 * Generate soramimi for a chunk of lyrics
 * Returns { segments, success } where success=false means fallback was used (don't cache)
 */
export async function generateSoramimiForChunk(
  lines: LyricLineWithTiming[],
  requestId: string
): Promise<SoramimiResult> {
  if (lines.length === 0) {
    return { segments: [], success: true };
  }

  // Format lines with word timing markers if available
  const formattedLines = lines.map((line, idx) => {
    const { text } = formatLineWithTimingMarkers(line);
    return `${idx + 1}: ${text}`;
  });
  const textsToProcess = formattedLines.join("\n");
  
  // Track which lines have word timings for parsing
  const lineWordCounts = lines.map(line => line.wordTimings?.length || 0);
  const hasAnyTimings = lineWordCounts.some(count => count > 0);
  
  if (hasAnyTimings) {
    logInfo(requestId, `Using word timing markers for soramimi`, { 
      linesWithTimings: lineWordCounts.filter(c => c > 0).length,
      totalWords: lineWordCounts.reduce((a, b) => a + b, 0)
    });
  }

  // Create abort controller with timeout
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), AI_TIMEOUT_MS);

  const startTime = Date.now();
  logInfo(requestId, `Soramimi AI generation starting`, { linesCount: lines.length, timeoutMs: AI_TIMEOUT_MS });

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
    
    // Build a map of line number -> raw content (before parsing)
    const lineRawContentMap = new Map<number, string>();
    for (const responseLine of responseLines) {
      const trimmed = responseLine.trim();
      if (!trimmed) continue;
      
      // Try to extract line number prefix (e.g., "1: content" or "1. content")
      const lineNumMatch = trimmed.match(/^(\d+)[:.\s]\s*(.*)$/);
      if (lineNumMatch) {
        const lineNum = parseInt(lineNumMatch[1], 10);
        const content = lineNumMatch[2];
        lineRawContentMap.set(lineNum, content);
      } else {
        // No line number - try to use sequential position
        const nextExpectedLine = lineRawContentMap.size + 1;
        lineRawContentMap.set(nextExpectedLine, trimmed);
      }
    }

    const matchedCount = Math.min(lineRawContentMap.size, lines.length);
    if (matchedCount < lines.length) {
      logInfo(requestId, `Warning: Soramimi response line mismatch - expected ${lines.length}, matched ${matchedCount}`, { 
        expectedLines: lines.length, 
        responseLines: responseLines.length,
        matchedLines: matchedCount,
        willUseFallbackForMissing: true 
      });
    }

    // Build result with alignment to ensure segments match original text
    const segments = lines.map((line, index) => {
      const lineNum = index + 1;
      const rawContent = lineRawContentMap.get(lineNum);
      
      if (!rawContent) {
        return [{ text: line.words }];
      }
      
      const wordCount = lineWordCounts[index];
      
      // Try to parse with word timing markers if this line had them
      if (wordCount > 0) {
        const wordSegments = parseOutputWithTimingMarkers(rawContent, wordCount);
        if (wordSegments) {
          // Successfully parsed with markers - flatten and return
          const flatSegments = flattenWordSegments(wordSegments);
          if (flatSegments.length > 0) {
            return alignSegmentsToOriginal(flatSegments, line.words);
          }
        }
      }
      
      // Fall back to regular parsing (no markers or markers not preserved)
      const rawSegments = parseRubyMarkup(rawContent);
      return alignSegmentsToOriginal(rawSegments, line.words);
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
