/**
 * Soramimi Generation Functions (空耳 - Chinese Misheard Lyrics)
 * 
 * Handles generating Chinese phonetic readings for non-Chinese lyrics.
 */

import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { AiSoramimiResponseSchema } from "./_constants.js";
import { logInfo, logError, type LyricLine } from "./_utils.js";
import type { FuriganaSegment } from "../_utils/song-service.js";

// =============================================================================
// Soramimi Generation
// =============================================================================

const SORAMIMI_SYSTEM_PROMPT = `You are an expert in phonetic transcription to Chinese characters (空耳/soramimi).

Given lyric lines (one per line), create Chinese character readings that phonetically mimic the original sounds when read aloud in Mandarin Chinese.

Famous examples:
- "sorry sorry" → "搜哩搜哩"
- "리듬에 온몸을" → "紅燈沒？綠燈沒？"

Rules:
1. Focus on phonetic similarity - the Chinese should SOUND like the original
2. Use common Chinese characters that flow naturally
3. OK to mix English/numbers if they fit the sound
4. Be creative and playful
5. Match syllable count where possible
6. Use Traditional Chinese characters (繁體字)

For each line, return an array of segments with "text" (original word) and "reading" (Chinese soramimi).
Split by words so each gets its own reading. Concatenated "text" fields must equal original line.

Example input:
Sorry, sorry
I'm so sorry

Example output:
{"annotatedLines":[[{"text":"So","reading":"搜"},{"text":"rry, ","reading":"哩"},{"text":"so","reading":"搜"},{"text":"rry","reading":"哩"}],[{"text":"I'm ","reading":"愛"},{"text":"so ","reading":"搜"},{"text":"so","reading":"搜"},{"text":"rry","reading":"哩"}]]}`;

// AI generation timeout (30 seconds)
const AI_TIMEOUT_MS = 30000;

/**
 * Generate soramimi for a chunk of lyrics
 */
export async function generateSoramimiForChunk(
  lines: LyricLine[],
  requestId: string
): Promise<FuriganaSegment[][]> {
  if (lines.length === 0) {
    return [];
  }

  // Use plain text (newline-separated) instead of JSON for efficiency
  const textsToProcess = lines.map((line) => line.words).join("\n");

  // Create abort controller with timeout
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), AI_TIMEOUT_MS);

  try {
    const { object: aiResponse } = await generateObject({
      model: google("gemini-2.5-flash"),
      schema: AiSoramimiResponseSchema,
      messages: [
        { role: "system", content: SORAMIMI_SYSTEM_PROMPT },
        { role: "user", content: textsToProcess },
      ],
      temperature: 0.7,
      abortSignal: abortController.signal,
    });
    
    clearTimeout(timeoutId);

    if (aiResponse.annotatedLines.length !== lines.length) {
      logInfo(requestId, `Warning: Soramimi response length mismatch - expected ${lines.length}, got ${aiResponse.annotatedLines.length}`);
    }

    return lines.map((line, index) => {
      return aiResponse.annotatedLines[index] || [{ text: line.words }];
    });
  } catch (error) {
    clearTimeout(timeoutId);
    const isTimeout = error instanceof Error && error.name === "AbortError";
    logError(requestId, `Soramimi chunk failed${isTimeout ? " (timeout)" : ""}, returning plain text segments as fallback`, error);
    return lines.map((line) => [{ text: line.words }]);
  }
}
