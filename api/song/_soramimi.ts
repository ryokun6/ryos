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

Given lyric lines in any language, create Chinese character readings that phonetically mimic the original sounds when read aloud in Mandarin Chinese. This is known as "空耳" (soramimi/mondegreen) - misheard lyrics.

Famous examples:
- "sorry sorry" → "搜哩搜哩" (sōu lǐ sōu lǐ) - 4 syllables → 4 syllables
- "리듬에 온몸을" → "紅燈沒？綠燈沒？" (hóng dēng méi? lǜ dēng méi?) - Korean: 6 syllables → 6 syllables
- "맡기고 소리쳐 oh" → "parking 個休旅車 oh" (parking gè xiū lǚ chē oh)

Rules:
1. Focus on phonetic similarity - the Chinese should SOUND like the original when spoken
2. Use common Chinese characters/words that flow naturally
3. It's OK to mix in English words or numbers if they fit the sound
4. Be creative and playful - soramimi is meant to be funny and memorable
5. Strictly adhere to the original number of syllables - each syllable in the original must correspond to one syllable in the Chinese reading
6. Use Traditional Chinese characters (繁體字)

IMPORTANT: Split each line into INDIVIDUAL WORD segments, not the entire line!
For each line, return an array of segments where:
- Each segment has "text" (a single word or small phrase from the original) and "reading" (its Chinese soramimi)
- Split by spaces/words so each word gets its own reading
- The concatenation of all "text" fields should equal the original line
- Include spaces, avoid adding extra punctuation in the text segments to preserve the original

Example input: ["Sorry, sorry", "I'm so sorry"]
Example output:
{
  "annotatedLines": [
    [{"text": "So", "reading": "搜"}, {"text": "rry, ", "reading": "哩"}, {"text": "so", "reading": "搜"}, {"text": "rry", "reading": "哩"}],
    [{"text": "I'm ", "reading": "愛"}, {"text": "so ", "reading": "搜"}, {"text": "so", "reading": "搜"}, {"text": "rry", "reading": "哩"}]
  ]
}`;

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

  const textsToProcess = lines.map((line) => line.words);

  try {
    const { object: aiResponse } = await generateObject({
      model: google("gemini-2.5-flash"),
      schema: AiSoramimiResponseSchema,
      messages: [
        { role: "system", content: SORAMIMI_SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(textsToProcess) },
      ],
      temperature: 0.7,
    });

    if (aiResponse.annotatedLines.length !== lines.length) {
      logInfo(requestId, `Warning: Soramimi response length mismatch - expected ${lines.length}, got ${aiResponse.annotatedLines.length}`);
    }

    return lines.map((line, index) => {
      return aiResponse.annotatedLines[index] || [{ text: line.words }];
    });
  } catch (error) {
    logError(requestId, `Soramimi chunk failed, returning plain text segments as fallback`, error);
    return lines.map((line) => [{ text: line.words }]);
  }
}
