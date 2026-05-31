import type { LyricWord } from "@/types/lyrics";
import type { FuriganaSegment } from "@/utils/romanization";
import type { FuriganaMappingResult } from "./types";

export function getTrailingWhitespace(text: string): string {
  const match = text.match(/\s+$/u);
  return match?.[0] ?? "";
}

function stripTrailingWhitespace(text: string): string {
  return text.replace(/\s+$/u, "");
}

/**
 * Maps word timings to furigana segments using character-position alignment.
 * Handles cases where AI-generated segment boundaries don't match word timing boundaries.
 * 
 * When a furigana segment spans multiple word timings (e.g., {馬鹿|ばか} but words are "馬" and "鹿"),
 * they are combined into a single render unit so the reading displays correctly over both characters.
 */
export function mapWordTimingsToFurigana(
  wordTimings: LyricWord[],
  furiganaSegments: FuriganaSegment[]
): FuriganaMappingResult {
  const renderItems: FuriganaMappingResult["renderItems"] = [];
  const skipIndices = new Set<number>();
  
  if (furiganaSegments.length === 0 || wordTimings.length === 0) {
    return { renderItems: [], skipIndices };
  }
  
  // Build character-to-segment mapping from furigana
  interface CharInfo {
    char: string;
    segmentIdx: number;
  }
  
  const furiganaChars: CharInfo[] = [];
  for (let segIdx = 0; segIdx < furiganaSegments.length; segIdx++) {
    const seg = furiganaSegments[segIdx];
    for (const char of seg.text) {
      furiganaChars.push({ char, segmentIdx: segIdx });
    }
  }
  
  // Build word character list with positions
  interface WordCharInfo {
    char: string;
    wordIdx: number;
    charIdxInWord: number;
  }
  const wordChars: WordCharInfo[] = [];
  for (let wordIdx = 0; wordIdx < wordTimings.length; wordIdx++) {
    const trimmed = wordTimings[wordIdx].text.trim();
    let charIdx = 0;
    for (const char of trimmed) {
      wordChars.push({ char, wordIdx, charIdxInWord: charIdx++ });
    }
  }
  
  // Align characters and track which segment each word-char belongs to
  const wordCharToSegment: number[] = new Array(wordChars.length).fill(-1);
  
  let furiPos = 0;
  let wordPos = 0;
  
  while (furiPos < furiganaChars.length && wordPos < wordChars.length) {
    const furiChar = furiganaChars[furiPos];
    const wordChar = wordChars[wordPos];
    
    if (furiChar.char === wordChar.char) {
      wordCharToSegment[wordPos] = furiChar.segmentIdx;
      furiPos++;
      wordPos++;
    } else {
      // Mismatch - try to recover
      if (/\s/.test(furiChar.char)) {
        furiPos++;
      } else if (/\s/.test(wordChar.char)) {
        wordPos++;
      } else {
        furiPos++;
        wordPos++;
      }
    }
  }
  
  // Group consecutive word timings that belong to the same segment with a reading
  // Track: for each word, which segment(s) it belongs to
  const wordToSegments = new Map<number, Set<number>>();
  let charOffset = 0;
  for (let wordIdx = 0; wordIdx < wordTimings.length; wordIdx++) {
    const trimmed = wordTimings[wordIdx].text.trim();
    const wordLen = [...trimmed].length;
    const segs = new Set<number>();
    for (let i = 0; i < wordLen; i++) {
      const seg = wordCharToSegment[charOffset + i];
      if (seg >= 0) segs.add(seg);
    }
    wordToSegments.set(wordIdx, segs);
    charOffset += wordLen;
  }
  
  // Find which segments span multiple words and need combining
  const segmentToWords = new Map<number, number[]>();
  for (const [wordIdx, segs] of wordToSegments) {
    for (const segIdx of segs) {
      if (!segmentToWords.has(segIdx)) {
        segmentToWords.set(segIdx, []);
      }
      segmentToWords.get(segIdx)!.push(wordIdx);
    }
  }
  
  // Build render items, combining words that share a reading segment
  const processedWords = new Set<number>();
  
  for (let wordIdx = 0; wordIdx < wordTimings.length; wordIdx++) {
    if (processedWords.has(wordIdx)) continue;
    
    const segs = wordToSegments.get(wordIdx) || new Set();
    
    // Check if any segment with a reading spans this and other words
    let combinedWords = [wordIdx];
    let combinedReading = "";
    
    for (const segIdx of segs) {
      const seg = furiganaSegments[segIdx];
      if (!seg.reading) continue;
      
      const wordsInSeg = segmentToWords.get(segIdx) || [];
      if (wordsInSeg.length > 1) {
        // Only merge no-space segments (typically Japanese). If the source segment contains
        // whitespace, keeping each timed word separate preserves karaoke timing fidelity for
        // long Korean phrases and short grouped words like "to" / "the".
        if (/\s/u.test(seg.text)) {
          continue;
        }
        // This segment spans multiple words - combine them
        // Only combine consecutive words
        const sortedWords = [...wordsInSeg].sort((a, b) => a - b);
        if (sortedWords[0] === wordIdx) {
          // This is the first word of a multi-word segment
          // Check they're consecutive
          let allConsecutive = true;
          for (let i = 1; i < sortedWords.length; i++) {
            if (sortedWords[i] !== sortedWords[i - 1] + 1) {
              allConsecutive = false;
              break;
            }
          }
          if (allConsecutive) {
            combinedWords = sortedWords;
            combinedReading = seg.reading;
          }
        }
      } else if (wordsInSeg.length === 1) {
        // Single word owns this segment
        combinedReading += seg.reading;
      }
    }
    
    // Mark all combined words as processed
    for (const idx of combinedWords) {
      processedWords.add(idx);
      if (idx !== wordIdx) {
        skipIndices.add(idx);
      }
    }
    
    // Build combined text and extra duration. Preserve authored whitespace between timed words,
    // but keep trailing whitespace outside the ruby span so layout matches single-word rendering.
    let combinedText = "";
    let extraDurationMs = 0;
    for (let i = 0; i < combinedWords.length; i++) {
      const w = wordTimings[combinedWords[i]];
      if (i > 0) {
        extraDurationMs += w.durationMs;
      }
      combinedText += w.text;
    }
    combinedText = stripTrailingWhitespace(combinedText);
    
    renderItems.push({
      wordIdx,
      text: combinedText,
      reading: combinedReading || undefined,
      extraDurationMs,
      combinedWordIndices: combinedWords,
    });
  }
  
  return { renderItems, skipIndices };
}
