/**
 * Furigana Generation Functions
 * 
 * Handles generating furigana (reading annotations) for Japanese lyrics.
 */

import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { logInfo, logError, type LyricLine } from "./_utils.js";
import type { FuriganaSegment } from "../_utils/song-service.js";

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
 * This checks the overall character composition of lyrics, not just kanji-containing lines.
 * Korean songs with Chinese credits should NOT be flagged as mostly Chinese.
 */
export function lyricsAreMostlyChinese(lines: { words: string }[]): boolean {
  if (!lines || lines.length === 0) return false;
  
  // Count characters by script type across all lines
  let hangulChars = 0;
  let kanaChars = 0;
  let kanjiChars = 0;
  let totalCjkChars = 0;
  
  for (const line of lines) {
    const text = line.words;
    for (const char of text) {
      if (/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/.test(char)) {
        hangulChars++;
        totalCjkChars++;
      } else if (/[\u3040-\u309F\u30A0-\u30FF]/.test(char)) {
        kanaChars++;
        totalCjkChars++;
      } else if (/[\u4E00-\u9FFF]/.test(char)) {
        kanjiChars++;
        totalCjkChars++;
      }
    }
  }
  
  // No CJK characters at all - not Chinese
  if (totalCjkChars === 0) return false;
  
  // If there's significant Korean content (>20% of CJK chars are Hangul), 
  // don't classify as Chinese - it's likely a Korean song with Chinese credits
  if (hangulChars / totalCjkChars > 0.2) return false;
  
  // If there's significant Japanese content (any kana), don't classify as Chinese
  if (kanaChars > 0) return false;
  
  // If kanji makes up >80% of CJK characters and there's no kana/hangul,
  // it's likely Chinese
  return kanjiChars / totalCjkChars > 0.8;
}

// =============================================================================
// Furigana Generation
// =============================================================================

const FURIGANA_SYSTEM_PROMPT = `Add furigana to kanji using ruby markup format: {text|reading}

Format: {漢字|ふりがな} - text first, then reading after pipe
- Plain text without reading stays as-is
- Separate okurigana: {走|はし}る (NOT {走る|はしる})

One line output per input line.

Example:
Input:
夜空の星
私は走る

Output:
{夜空|よぞら}の{星|ほし}
{私|わたし}は{走|はし}る`;

// AI generation timeout (30 seconds)
const AI_TIMEOUT_MS = 30000;

/**
 * Parse ruby markup format (e.g., "{夜空|よぞら}の{星|ほし}") into FuriganaSegment array
 */
function parseRubyMarkup(line: string): FuriganaSegment[] {
  const segments: FuriganaSegment[] = [];
  
  // Match {text|reading} patterns and plain text between them
  const regex = /\{([^|}]+)\|([^}]+)\}/g;
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
 * Generate furigana for a chunk of lyrics
 */
export async function generateFuriganaForChunk(
  lines: LyricLine[],
  requestId: string
): Promise<FuriganaSegment[][]> {
  const linesNeedingFurigana = lines.filter((line) => containsKanji(line.words));
  
  if (linesNeedingFurigana.length === 0) {
    return lines.map((line) => [{ text: line.words }]);
  }

  // Use plain text (newline-separated) for efficiency
  const textsToProcess = linesNeedingFurigana.map((line) => line.words).join("\n");

  // Create abort controller with timeout
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), AI_TIMEOUT_MS);

  try {
    const { text: responseText } = await generateText({
      model: google("gemini-2.5-flash"),
      messages: [
        { role: "system", content: FURIGANA_SYSTEM_PROMPT },
        { role: "user", content: textsToProcess },
      ],
      temperature: 0.1,
      abortSignal: abortController.signal,
    });
    
    clearTimeout(timeoutId);

    // Parse the ruby markup response
    const annotatedLines = responseText.trim().split("\n").map(line => parseRubyMarkup(line.trim()));

    if (annotatedLines.length !== linesNeedingFurigana.length) {
      logInfo(requestId, `Warning: Furigana response length mismatch - expected ${linesNeedingFurigana.length}, got ${annotatedLines.length}`);
    }

    let furiganaIndex = 0;
    return lines.map((line) => {
      if (containsKanji(line.words)) {
        return annotatedLines[furiganaIndex++] || [{ text: line.words }];
      }
      return [{ text: line.words }];
    });
  } catch (error) {
    clearTimeout(timeoutId);
    const isTimeout = error instanceof Error && error.name === "AbortError";
    logError(requestId, `Furigana chunk failed${isTimeout ? " (timeout)" : ""}, returning plain text segments as fallback`, error);
    return lines.map((line) => [{ text: line.words }]);
  }
}
