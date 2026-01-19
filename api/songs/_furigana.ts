/**
 * Furigana Generation Functions
 * 
 * Handles generating furigana (reading annotations) for Japanese lyrics.
 */

import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { logInfo, logError, type LyricLine } from "./_utils.js";
import type { FuriganaSegment } from "../_utils/_song-service.js";

// =============================================================================
// Language Detection
// =============================================================================

export function containsKanji(text: string): boolean {
  return /[\u4E00-\u9FFF]/.test(text);
}

export function containsKana(text: string): boolean {
  return /[\u3040-\u309F\u30A0-\u30FF]/.test(text);
}

export function containsHangul(text: string): boolean {
  // Korean Hangul syllables (AC00-D7AF) and Jamo (1100-11FF, 3130-318F)
  return /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/.test(text);
}

export function isChineseText(text: string): boolean {
  return containsKanji(text) && !containsKana(text);
}

/**
 * Check if lyrics are mostly Chinese text
 * Used to skip soramimi generation for Chinese lyrics
 * 
 * Logic: Chinese lyrics have Han characters but NO Japanese kana.
 * - If there's kana → Japanese (not Chinese)
 * - If there's significant Hangul → Korean (not Chinese)
 * - If there are Han characters with no kana/hangul → Chinese
 */
export function lyricsAreMostlyChinese(lines: { words: string }[]): boolean {
  if (!lines || lines.length === 0) return false;
  
  // Count characters by script type across all lines
  let hangulChars = 0;
  let kanaChars = 0;
  let hanChars = 0; // Chinese/Japanese kanji
  
  for (const line of lines) {
    const text = line.words;
    for (const char of text) {
      // Skip whitespace and punctuation
      if (/[\s\p{P}]/u.test(char)) continue;
      
      // Korean Hangul
      if (/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/.test(char)) {
        hangulChars++;
      }
      // Japanese Hiragana and Katakana
      else if (/[\u3040-\u309F\u30A0-\u30FF]/.test(char)) {
        kanaChars++;
      }
      // CJK Unified Ideographs (Han characters - shared by Chinese/Japanese)
      else if (/[\u4E00-\u9FFF\u3400-\u4DBF]/.test(char)) {
        hanChars++;
      }
    }
  }
  
  // No Han characters at all - definitely not Chinese
  if (hanChars === 0) return false;
  
  // If there's ANY kana, it's Japanese (kanji + kana = Japanese)
  if (kanaChars > 0) return false;
  
  // If there's significant Korean (more Hangul than Han), it's Korean
  if (hangulChars > hanChars) return false;
  
  // If there's some Hangul mixed with Han, check ratio
  // Korean songs with Chinese loan words have mostly Hangul
  // Chinese songs should have Han >> Hangul
  if (hangulChars > 0 && hangulChars > hanChars * 0.1) return false;
  
  // Han characters with no kana and minimal hangul = Chinese
  return true;
}

// =============================================================================
// Furigana Generation
// =============================================================================

export const FURIGANA_SYSTEM_PROMPT = `Add furigana to kanji using ruby markup format: <text:reading>

Format: <漢字:ふりがな> - text first, then reading after colon
- Plain text without reading stays as-is
- Separate okurigana: <走:はし>る (NOT <走る:はしる>)

One line output per input line.

Example:
Input:
夜空の星
私は走る

Output:
<夜空:よぞら>の<星:ほし>
<私:わたし>は<走:はし>る`;

// AI generation timeout (90 seconds for full song streaming)
const AI_TIMEOUT_MS = 90000;

/**
 * Parse ruby markup format (e.g., "<夜空:よぞら>の<星:ほし>") into FuriganaSegment array
 * 
 * Format: <text:reading> - angle brackets with colon separator
 */
export function parseRubyMarkup(line: string): FuriganaSegment[] {
  const segments: FuriganaSegment[] = [];
  
  // Match <text:reading> patterns
  const regex = /<([^:>]+):([^>]+)>/g;
  let match;
  let lastIndex = 0;
  
  while ((match = regex.exec(line)) !== null) {
    // Add any plain text before this match
    if (match.index > lastIndex) {
      const textBefore = line.slice(lastIndex, match.index);
      if (textBefore) {
        segments.push({ text: textBefore });
      }
    }
    
    const text = match[1];
    const reading = match[2];
    
    if (text) {
      segments.push({ text, reading });
    }
    
    lastIndex = regex.lastIndex;
  }
  
  // Handle any remaining text after the last match
  if (lastIndex < line.length) {
    const remaining = line.slice(lastIndex);
    if (remaining) {
      segments.push({ text: remaining });
    }
  }
  
  return segments.length > 0 ? segments : [{ text: line }];
}

/**
 * Stream furigana generation for all lyrics line-by-line using streamText
 * Emits each line as it's completed via onLine callback
 * 
 * @param lines - All lyrics lines to process
 * @param requestId - Request ID for logging
 * @param onLine - Callback called for each completed line (lineIndex, segments)
 * @returns Promise that resolves when streaming is complete
 */
export async function streamFurigana(
  lines: LyricLine[],
  requestId: string,
  onLine: (lineIndex: number, segments: FuriganaSegment[]) => void
): Promise<{ furigana: FuriganaSegment[][]; success: boolean }> {
  if (lines.length === 0) {
    return { furigana: [], success: true };
  }

  // Build index mapping: track which lines need furigana
  const lineInfo = lines.map((line, originalIndex) => ({
    line,
    originalIndex,
    needsFurigana: containsKanji(line.words),
  }));

  const linesNeedingFurigana = lineInfo.filter((info) => info.needsFurigana);
  
  // Initialize results with fallback for non-kanji lines
  const results: FuriganaSegment[][] = new Array(lines.length);
  for (let i = 0; i < lines.length; i++) {
    results[i] = [{ text: lines[i].words }];
  }

  // Emit non-kanji lines immediately
  for (const info of lineInfo) {
    if (!info.needsFurigana) {
      onLine(info.originalIndex, results[info.originalIndex]);
    }
  }

  if (linesNeedingFurigana.length === 0) {
    logInfo(requestId, `No kanji lines, skipping furigana AI generation`);
    return { furigana: results, success: true };
  }

  // Use numbered lines for reliable parsing during streaming
  const systemPrompt = `Add furigana to kanji using ruby markup format: <text:reading>

Format: <漢字:ふりがな> - text first, then reading after colon
- Plain text without reading stays as-is
- Separate okurigana: <走:はし>る (NOT <走る:はしる>)

Output format: Number each line like "1: annotated line", "2: annotated line", etc.

Example:
Input:
1: 夜空の星
2: 私は走る

Output:
1: <夜空:よぞら>の<星:ほし>
2: <私:わたし>は<走:はし>る`;

  const textsToProcess = linesNeedingFurigana.map((info, i) => `${i + 1}: ${info.line.words}`).join("\n");

  let currentLineBuffer = "";
  let completedCount = 0;

  // Create abort controller with timeout
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), AI_TIMEOUT_MS);

  const startTime = Date.now();
  logInfo(requestId, `Starting furigana stream`, { totalLines: lines.length, kanjiLines: linesNeedingFurigana.length, timeoutMs: AI_TIMEOUT_MS });

  try {
    const result = streamText({
      model: openai("gpt-5.2"),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: textsToProcess },
      ],
      temperature: 0.1,
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
        const match = completeLine.match(/^(\d+):\s*(.*)$/);
        if (match) {
          const kanjiLineIndex = parseInt(match[1], 10) - 1; // 1-based to 0-based in kanji lines
          const content = match[2].trim();
          
          if (kanjiLineIndex >= 0 && kanjiLineIndex < linesNeedingFurigana.length && content) {
            const originalIndex = linesNeedingFurigana[kanjiLineIndex].originalIndex;
            const segments = parseRubyMarkup(content);
            results[originalIndex] = segments;
            completedCount++;
            onLine(originalIndex, segments);
          }
        }
      }
    }
    
    // Handle any remaining content (last line might not end with newline)
    if (currentLineBuffer.trim()) {
      const match = currentLineBuffer.trim().match(/^(\d+):\s*(.*)$/);
      if (match) {
        const kanjiLineIndex = parseInt(match[1], 10) - 1;
        const content = match[2].trim();
        
        if (kanjiLineIndex >= 0 && kanjiLineIndex < linesNeedingFurigana.length && content) {
          const originalIndex = linesNeedingFurigana[kanjiLineIndex].originalIndex;
          const segments = parseRubyMarkup(content);
          results[originalIndex] = segments;
          completedCount++;
          onLine(originalIndex, segments);
        }
      }
    }
    
    clearTimeout(timeoutId);
    const durationMs = Date.now() - startTime;
    
    logInfo(requestId, `Furigana stream completed`, { 
      durationMs, 
      completedKanjiLines: completedCount, 
      totalKanjiLines: linesNeedingFurigana.length,
      totalLines: lines.length
    });
    
    return { furigana: results, success: true };
  } catch (error) {
    clearTimeout(timeoutId);
    const durationMs = Date.now() - startTime;
    const isTimeout = error instanceof Error && error.name === "AbortError";
    
    logError(requestId, `Furigana stream failed${isTimeout ? " (timeout)" : ""}`, { error, durationMs, completedCount });
    
    // Emit fallback for remaining kanji lines
    for (const info of linesNeedingFurigana) {
      if (!results[info.originalIndex] || results[info.originalIndex].length === 1 && results[info.originalIndex][0].text === info.line.words) {
        // Not yet processed or only has fallback, emit fallback
        const fallback = [{ text: info.line.words }];
        results[info.originalIndex] = fallback;
        onLine(info.originalIndex, fallback);
      }
    }
    
    return { furigana: results, success: false };
  }
}
