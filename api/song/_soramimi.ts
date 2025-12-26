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

const SORAMIMI_SYSTEM_PROMPT = `Create Chinese phonetic readings (空耳/soramimi) for lyrics.

STRICT FORMAT: {originalText|chineseReading}
- originalText = exact syllable from input (keep original spelling)
- chineseReading = Traditional Chinese (繁體字) that sounds similar
- Use space between words
- NEVER output bare {reading} without the original text
- One line output per input line

Example:
Input:
Sorry sorry
I'm so sorry

Output:
{Sor|搜}{ry|哩} {sor|搜}{ry|哩}
{I'm|愛} {so|搜} {sor|搜}{ry|哩}`;

// AI generation timeout (30 seconds)
const AI_TIMEOUT_MS = 30000;

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

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/f0156624-08c2-4062-9750-1fcc7ac4b867',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'_soramimi.ts:generateSoramimiForChunk:entry',message:'Starting soramimi generation',data:{inputLineCount:lines.length,inputPreview:lines.slice(0,3).map(l=>l.words.slice(0,50)),textLength:textsToProcess.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1'})}).catch(()=>{});
  // #endregion

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

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/f0156624-08c2-4062-9750-1fcc7ac4b867',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'_soramimi.ts:generateSoramimiForChunk:aiResponse',message:'AI response received',data:{responseLength:responseText.length,responsePreview:responseText.slice(0,200),responseLineCount:responseText.trim().split('\n').length,expectedLineCount:lines.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1,H5'})}).catch(()=>{});
    // #endregion

    // Parse the ruby markup response
    const annotatedLines = responseText.trim().split("\n").map(line => parseRubyMarkup(line.trim()));

    if (annotatedLines.length !== lines.length) {
      logInfo(requestId, `Warning: Soramimi response length mismatch - expected ${lines.length}, got ${annotatedLines.length}`);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/f0156624-08c2-4062-9750-1fcc7ac4b867',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'_soramimi.ts:generateSoramimiForChunk:MISMATCH',message:'LINE COUNT MISMATCH DETECTED',data:{expected:lines.length,got:annotatedLines.length,diff:lines.length-annotatedLines.length,inputLines:lines.map(l=>l.words),outputLines:responseText.trim().split('\n')},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1'})}).catch(()=>{});
      // #endregion
    }

    // Build result with alignment to ensure segments match original text
    const result = lines.map((line, index) => {
      const rawSegments = annotatedLines[index] || [{ text: line.words }];
      const original = line.words;
      
      // Align segments to original text (handles spacing mismatches)
      const segments = alignSegmentsToOriginal(rawSegments, original);
      
      // #region agent log
      const reconstructed = segments.map(s => s.text).join('');
      if (reconstructed !== original && index < 5) {
        fetch('http://127.0.0.1:7242/ingest/f0156624-08c2-4062-9750-1fcc7ac4b867',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'_soramimi.ts:generateSoramimiForChunk:segmentMismatch',message:'Segment text mismatch after alignment',data:{lineIndex:index,original:original,reconstructed:reconstructed,rawSegments:rawSegments.map(s=>({t:s.text,r:s.reading})),alignedSegments:segments.map(s=>({t:s.text,r:s.reading}))},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H2'})}).catch(()=>{});
      }
      // #endregion
      
      return segments;
    });

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/f0156624-08c2-4062-9750-1fcc7ac4b867',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'_soramimi.ts:generateSoramimiForChunk:exit',message:'Soramimi generation complete',data:{resultLineCount:result.length,inputLineCount:lines.length,sampleSegments:result.slice(0,2).map(segs=>segs.map(s=>({t:s.text,r:s.reading})))},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1,H2'})}).catch(()=>{});
    // #endregion

    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    const isTimeout = error instanceof Error && error.name === "AbortError";
    logError(requestId, `Soramimi chunk failed${isTimeout ? " (timeout)" : ""}, returning plain text segments as fallback`, error);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/f0156624-08c2-4062-9750-1fcc7ac4b867',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'_soramimi.ts:generateSoramimiForChunk:error',message:'Soramimi generation failed',data:{error:error instanceof Error ? error.message : String(error),isTimeout,inputLineCount:lines.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H5'})}).catch(()=>{});
    // #endregion
    return lines.map((line) => [{ text: line.words }]);
  }
}
