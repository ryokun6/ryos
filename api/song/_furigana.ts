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

const FURIGANA_SYSTEM_PROMPT = `You are an expert in Japanese language. You will be given a JSON array of Japanese text strings (song lyrics).
Your task is to add furigana (reading annotations) to kanji characters in each line.

For each line, return an array of segments where:
- Each segment has a "text" field containing the original text portion
- Segments with kanji should have a "reading" field with the hiragana reading
- Segments without kanji (hiragana, katakana, punctuation, spaces) should NOT have a reading field

CRITICAL: Separate kanji from trailing hiragana (okurigana)
- The "text" field with a "reading" must contain ONLY kanji characters
- Trailing hiragana (okurigana) must be in a SEPARATE segment WITHOUT a reading
- The reading should cover ONLY the kanji, not include the okurigana

Example input: ["夜空の星", "私は走る"]
Example output:
{
  "annotatedLines": [
    [{"text": "夜空", "reading": "よぞら"}, {"text": "の"}, {"text": "星", "reading": "ほし"}],
    [{"text": "私", "reading": "わたし"}, {"text": "は"}, {"text": "走", "reading": "はし"}, {"text": "る"}]
  ]
}

Important rules:
- Only add readings to kanji characters
- ALWAYS separate trailing hiragana (okurigana) into their own segments without readings
- Keep the original text exactly as provided
- Use standard hiragana readings
- For song lyrics, use common/natural readings`;

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

  const textsToProcess = linesNeedingFurigana.map((line) => line.words);

  try {
    const { object: aiResponse } = await generateObject({
      model: google("gemini-2.5-flash"),
      schema: AiFuriganaResponseSchema,
      messages: [
        { role: "system", content: FURIGANA_SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(textsToProcess) },
      ],
      temperature: 0.1,
    });

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
    logError(requestId, `Furigana chunk failed, returning plain text segments as fallback`, error);
    return lines.map((line) => [{ text: line.words }]);
  }
}
