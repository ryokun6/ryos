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
// Soramimi Generation
// =============================================================================

const SORAMIMI_SYSTEM_PROMPT = `Create Chinese phonetic readings (空耳/soramimi) using ruby markup format: {text|中文}

Format: {original|讀音} - original text first, then Chinese reading after pipe
- Chinese should SOUND like the original in Mandarin
- Use Traditional Chinese characters (繁體字)
- Split by syllables, each gets reading

One line output per input line.

Example:
Input:
Sorry, sorry
I'm so sorry

Output:
{Sor|搜}{ry,|哩} {sor|搜}{ry|哩}
{I'm|愛} {so|搜} {sor|搜}{ry|哩}`;

// AI generation timeout (30 seconds)
const AI_TIMEOUT_MS = 30000;

/**
 * Parse ruby markup format (e.g., "{Sor|搜}{ry|哩}") into FuriganaSegment array
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
  
  // Handle any remaining text
  if (lastIndex < line.length) {
    const remaining = line.slice(lastIndex);
    if (remaining) {
      segments.push({ text: remaining });
    }
  }
  
  return segments.length > 0 ? segments : [{ text: line }];
}

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

  // Use plain text (newline-separated) for efficiency
  const textsToProcess = lines.map((line) => line.words).join("\n");

  // Create abort controller with timeout
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), AI_TIMEOUT_MS);

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

    // Parse the ruby markup response
    const annotatedLines = responseText.trim().split("\n").map(line => parseRubyMarkup(line.trim()));

    if (annotatedLines.length !== lines.length) {
      logInfo(requestId, `Warning: Soramimi response length mismatch - expected ${lines.length}, got ${annotatedLines.length}`);
    }

    return lines.map((line, index) => {
      return annotatedLines[index] || [{ text: line.words }];
    });
  } catch (error) {
    clearTimeout(timeoutId);
    const isTimeout = error instanceof Error && error.name === "AbortError";
    logError(requestId, `Soramimi chunk failed${isTimeout ? " (timeout)" : ""}, returning plain text segments as fallback`, error);
    return lines.map((line) => [{ text: line.words }]);
  }
}
