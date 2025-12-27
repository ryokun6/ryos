/**
 * Soramimi Generation (空耳 - Chinese Misheard Lyrics)
 * 
 * Generates Chinese phonetic readings for Japanese/Korean lyrics.
 * Strategy: Extract Chinese chars from AI response, distribute 1:1 to CJK chars.
 */

import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { logInfo, logError, type LyricLine } from "./_utils.js";
import type { FuriganaSegment } from "../_utils/song-service.js";

// =============================================================================
// AI Prompt
// =============================================================================

const SORAMIMI_PROMPT = `Create Chinese 空耳 (soramimi) for Japanese/Korean lyrics. Use Traditional Chinese (繁體字).

Rules:
- Wrap EVERY Japanese/Korean character: {original|chinese}
- Japanese kana: 1 char = 1 Chinese char: {な|那}{に|你}
- Japanese kanji: by syllable count: {何|那你} (何=なに=2 syllables)
- Korean: 1 syllable = 1 Chinese char: {안|安}{녕|寧}
- Small っ or —: use {っ|～}
- English: keep as plain text, no {|} markup

Format: numbered lines matching input
Input: "1: 何があっても" → Output: "1: {何|那你}{が|嘎}{あ|啊}{っ|～}{て|貼}{も|摸}"

Kana reference:
あ啊 い一 う嗚 え欸 お喔 | か卡 き奇 く酷 け給 こ可
さ撒 し西 す素 せ些 そ搜 | た他 ち吃 つ此 て貼 と頭
な那 に你 ぬ奴 ね內 の諾 | は哈 ひ嘻 ふ夫 へ嘿 ほ火
ま媽 み咪 む木 め沒 も摸 | ら啦 り里 る嚕 れ咧 ろ囉
わ哇 を喔 ん嗯 っ～`;

const AI_TIMEOUT_MS = 60000;

// =============================================================================
// Character Detection
// =============================================================================

/** Japanese (kana/kanji) or Korean (hangul) - needs Chinese reading */
function needsReading(char: string): boolean {
  return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/.test(char);
}

/** Chinese character or ～ pause marker - valid reading char */
function isReadingChar(char: string): boolean {
  return /[\u4E00-\u9FFF\u3400-\u4DBF]/.test(char) || char === '～';
}

// =============================================================================
// Parsing
// =============================================================================

/** Extract all Chinese reading characters from AI response */
function extractReadings(text: string): string[] {
  const readings: string[] = [];
  // Match {anything|reading} and extract reading part
  const matches = text.matchAll(/\{[^|}]+\|([^}]+)\}/g);
  for (const match of matches) {
    for (const char of match[1]) {
      if (isReadingChar(char)) {
        readings.push(char);
      }
    }
  }
  return readings;
}

/** 
 * Build segments by distributing readings to CJK characters.
 * Each CJK char gets one reading. Kanji with multi-syllable readings
 * (like 何→那你) get the combined reading as one annotation.
 */
function buildSegments(original: string, readings: string[]): FuriganaSegment[] {
  if (readings.length === 0) {
    // No readings - return original as plain segments
    return [{ text: original }];
  }

  // Count CJK chars to distribute readings
  let cjkCount = 0;
  for (const char of original) {
    if (needsReading(char)) cjkCount++;
  }

  if (cjkCount === 0) {
    return [{ text: original }];
  }

  // Distribute readings across CJK chars
  // If more readings than chars, group extras with earlier chars (handles kanji)
  const readingsPerChar: string[] = [];
  const baseCount = Math.floor(readings.length / cjkCount);
  const extras = readings.length % cjkCount;
  
  let readingIdx = 0;
  for (let c = 0; c < cjkCount; c++) {
    const count = baseCount + (c < extras ? 1 : 0);
    readingsPerChar.push(readings.slice(readingIdx, readingIdx + count).join(''));
    readingIdx += count;
  }

  // Build result segments
  const result: FuriganaSegment[] = [];
  let charIdx = 0;
  let i = 0;

  while (i < original.length) {
    const char = original[i];

    // Whitespace
    if (/\s/.test(char)) {
      if (result.length === 0 || result[result.length - 1].text !== ' ') {
        result.push({ text: ' ' });
      }
      i++;
      continue;
    }

    // CJK character - assign distributed reading
    if (needsReading(char)) {
      const reading = readingsPerChar[charIdx++] || undefined;
      result.push({ text: char, reading });
      i++;
      continue;
    }

    // Non-CJK (English, punctuation) - group together
    let text = char;
    let j = i + 1;
    while (j < original.length && !needsReading(original[j]) && !/\s/.test(original[j])) {
      text += original[j];
      j++;
    }
    result.push({ text });
    i = j;
  }

  return result.length > 0 ? result : [{ text: original }];
}

// =============================================================================
// Main Export
// =============================================================================

export interface SoramimiResult {
  segments: FuriganaSegment[][];
  success: boolean;
}

export async function generateSoramimiForChunk(
  lines: LyricLine[],
  requestId: string
): Promise<SoramimiResult> {
  if (lines.length === 0) {
    return { segments: [], success: true };
  }

  // Simple numbered format
  const input = lines.map((line, i) => `${i + 1}: ${line.words}`).join("\n");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  logInfo(requestId, `Soramimi starting`, { lines: lines.length });

  try {
    const { text: response } = await generateText({
      model: google("gemini-2.5-flash"),
      messages: [
        { role: "system", content: SORAMIMI_PROMPT },
        { role: "user", content: input },
      ],
      temperature: 0.7,
      abortSignal: controller.signal,
    });

    clearTimeout(timeout);
    logInfo(requestId, `Soramimi completed`, { responseLength: response.length });

    // Parse response lines
    const responseMap = new Map<number, string>();
    for (const line of response.trim().split("\n")) {
      const match = line.trim().match(/^(\d+)[:.\s]\s*(.*)$/);
      if (match) {
        responseMap.set(parseInt(match[1], 10), match[2]);
      }
    }

    // Build segments for each line
    const segments = lines.map((line, i) => {
      const aiOutput = responseMap.get(i + 1) || "";
      const readings = extractReadings(aiOutput);
      return buildSegments(line.words, readings);
    });

    return { segments, success: true };
  } catch (error) {
    clearTimeout(timeout);
    logError(requestId, `Soramimi failed`, error);
    return {
      segments: lines.map(line => [{ text: line.words }]),
      success: false,
    };
  }
}
