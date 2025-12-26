/**
 * Furigana Generation Functions
 * 
 * Handles generating furigana (reading annotations) for Japanese lyrics.
 */

import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { AiFuriganaResponseSchema } from "./_constants.js";
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

export function isChineseText(text: string): boolean {
  return containsKanji(text) && !containsKana(text);
}

/**
 * Check if lyrics are mostly Chinese text
 * Used to skip soramimi generation for Chinese lyrics
 */
export function lyricsAreMostlyChinese(lines: { words: string }[]): boolean {
  if (!lines || lines.length === 0) return false;
  
  let chineseLineCount = 0;
  let cjkLineCount = 0;
  
  for (const line of lines) {
    const text = line.words;
    if (!containsKanji(text)) continue;
    
    cjkLineCount++;
    if (isChineseText(text)) {
      chineseLineCount++;
    }
  }
  
  if (cjkLineCount === 0) return false;
  return chineseLineCount / cjkLineCount > 0.7;
}

// =============================================================================
// Furigana Generation
// =============================================================================

const FURIGANA_SYSTEM_PROMPT = `Add furigana (reading annotations) to kanji in Japanese lyrics (one line per input line).

For each line, return segments with "text" (original portion) and optional "reading" (hiragana for kanji only).

CRITICAL: Separate kanji from trailing hiragana (okurigana)
- "text" with "reading" must contain ONLY kanji
- Okurigana goes in separate segment WITHOUT reading

Example input:
夜空の星
私は走る

Example output:
{"annotatedLines":[[{"text":"夜空","reading":"よぞら"},{"text":"の"},{"text":"星","reading":"ほし"}],[{"text":"私","reading":"わたし"},{"text":"は"},{"text":"走","reading":"はし"},{"text":"る"}]]}

Rules: Only add readings to kanji. Use standard hiragana readings.`;

// AI generation timeout (30 seconds)
const AI_TIMEOUT_MS = 30000;

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

  // Use plain text (newline-separated) instead of JSON for efficiency
  const textsToProcess = linesNeedingFurigana.map((line) => line.words).join("\n");

  // Create abort controller with timeout
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), AI_TIMEOUT_MS);

  try {
    const { object: aiResponse } = await generateObject({
      model: google("gemini-2.5-flash"),
      schema: AiFuriganaResponseSchema,
      messages: [
        { role: "system", content: FURIGANA_SYSTEM_PROMPT },
        { role: "user", content: textsToProcess },
      ],
      temperature: 0.1,
      abortSignal: abortController.signal,
    });
    
    clearTimeout(timeoutId);

    if (aiResponse.annotatedLines.length !== linesNeedingFurigana.length) {
      logInfo(requestId, `Warning: Furigana response length mismatch - expected ${linesNeedingFurigana.length}, got ${aiResponse.annotatedLines.length}`);
    }

    let furiganaIndex = 0;
    return lines.map((line) => {
      if (containsKanji(line.words)) {
        return aiResponse.annotatedLines[furiganaIndex++] || [{ text: line.words }];
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
