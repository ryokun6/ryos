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
 */
function isCJKCharacter(char: string): boolean {
  // Japanese hiragana, katakana, kanji, and Korean hangul
  return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/.test(char);
}

/**
 * Align parsed segments to match the original text by word boundaries
 * Ensures all CJK characters retain their readings even when alignment isn't perfect
 */
function alignSegmentsToOriginal(segments: FuriganaSegment[], original: string): FuriganaSegment[] {
  // Filter out space-only segments (we'll reconstruct spaces from original)
  const contentSegments = segments.filter(s => s.text.trim());
  
  if (contentSegments.length === 0) {
    return [{ text: original }];
  }
  
  // Build a queue of readings for CJK characters
  const readingsQueue: { text: string; reading?: string }[] = [];
  for (const seg of contentSegments) {
    readingsQueue.push({ text: seg.text, reading: seg.reading });
  }
  
  const result: FuriganaSegment[] = [];
  let originalIdx = 0;
  let segmentIdx = 0;
  
  while (originalIdx < original.length) {
    const char = original[originalIdx];
    
    // Handle spaces - add them directly
    if (char === ' ') {
      if (result.length > 0 && result[result.length - 1].text !== ' ') {
        result.push({ text: ' ' });
      }
      originalIdx++;
      continue;
    }
    
    // Try to match segment at current position
    if (segmentIdx < contentSegments.length) {
      const segment = contentSegments[segmentIdx];
      const segmentText = segment.text;
      const remainingOriginal = original.slice(originalIdx);
      
      // Check for exact match at current position
      if (remainingOriginal.startsWith(segmentText)) {
        result.push({ text: segmentText, reading: segment.reading });
        originalIdx += segmentText.length;
        segmentIdx++;
        continue;
      }
      
      // Check for case-insensitive match
      if (remainingOriginal.toLowerCase().startsWith(segmentText.toLowerCase())) {
        const matchedText = original.slice(originalIdx, originalIdx + segmentText.length);
        result.push({ text: matchedText, reading: segment.reading });
        originalIdx += segmentText.length;
        segmentIdx++;
        continue;
      }
    }
    
    // No segment match - handle the character
    if (isCJKCharacter(char)) {
      // CJK character without direct match - try to find a reading
      if (segmentIdx < contentSegments.length) {
        // Use next available reading for this CJK char
        const seg = contentSegments[segmentIdx];
        result.push({ text: char, reading: seg.reading });
        segmentIdx++;
      } else {
        // No more readings - add without
        result.push({ text: char });
      }
      originalIdx++;
    } else {
      // Non-CJK character - group consecutive non-CJK, non-space characters
      let plainText = char;
      let j = originalIdx + 1;
      while (j < original.length && !isCJKCharacter(original[j]) && original[j] !== ' ') {
        plainText += original[j];
        j++;
      }
      result.push({ text: plainText });
      originalIdx = j;
    }
  }
  
  // Verify reconstruction
  const reconstructed = result.map(s => s.text).join('');
  if (reconstructed !== original) {
    // Alignment failed - use fallback
    return buildFallbackSegments(segments, original);
  }
  
  return result;
}

/**
 * Fallback: Build segments by matching readings character by character
 * Ensures all CJK characters get their readings preserved
 */
function buildFallbackSegments(segments: FuriganaSegment[], original: string): FuriganaSegment[] {
  // Build a sequential list of readings from segments (for CJK chars only)
  const readingsQueue: string[] = [];
  for (const seg of segments) {
    if (seg.reading && seg.text.trim()) {
      // For multi-char segments, we'll use the whole reading for the first char
      // This handles cases like {何|那你} where 何 gets the full reading
      readingsQueue.push(seg.reading);
    }
  }
  
  // Also build a map for exact matches
  const readingMap = new Map<string, string>();
  for (const seg of segments) {
    if (seg.reading && seg.text.trim()) {
      readingMap.set(seg.text, seg.reading);
    }
  }
  
  const result: FuriganaSegment[] = [];
  let readingIdx = 0;
  let i = 0;
  
  while (i < original.length) {
    const char = original[i];
    
    if (/\s/.test(char)) {
      // Whitespace - add as-is
      if (result.length === 0 || result[result.length - 1].text !== ' ') {
        result.push({ text: ' ' });
      }
      i++;
      continue;
    }
    
    // Try to match multi-character segments first
    let matched = false;
    for (const [text, reading] of readingMap) {
      if (original.slice(i).startsWith(text)) {
        result.push({ text, reading });
        i += text.length;
        matched = true;
        // Consume a reading from queue if available
        if (readingIdx < readingsQueue.length) readingIdx++;
        break;
      }
    }
    
    if (!matched) {
      if (isCJKCharacter(char)) {
        // CJK character - try to assign a reading from the queue
        if (readingIdx < readingsQueue.length) {
          result.push({ text: char, reading: readingsQueue[readingIdx] });
          readingIdx++;
        } else {
          // No more readings available - add without reading
          result.push({ text: char });
        }
      } else {
        // Non-CJK character (English, punctuation, etc.) - add as plain text
        // Group consecutive non-CJK, non-space characters together
        let plainText = char;
        let j = i + 1;
        while (j < original.length && !isCJKCharacter(original[j]) && !/\s/.test(original[j])) {
          plainText += original[j];
          j++;
        }
        result.push({ text: plainText });
        i = j;
        continue;
      }
      i++;
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
 */
export async function generateSoramimiForChunk(
  lines: LyricLine[],
  requestId: string
): Promise<SoramimiResult> {
  if (lines.length === 0) {
    return { segments: [], success: true };
  }

  // Use numbered lines to help AI maintain line count
  const textsToProcess = lines.map((line, idx) => `${idx + 1}: ${line.words}`).join("\n");

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
    
    // Build a map of line number -> parsed content
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

    const matchedCount = Math.min(lineContentMap.size, lines.length);
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
      const rawSegments = lineContentMap.get(lineNum) || [{ text: line.words }];
      const original = line.words;
      
      // Align segments to original text (handles spacing mismatches)
      return alignSegmentsToOriginal(rawSegments, original);
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
