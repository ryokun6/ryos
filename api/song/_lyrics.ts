/**
 * Lyrics Parsing and Translation Functions
 * 
 * Handles parsing LRC/KRC formats and translating lyrics via AI.
 */

import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { Converter } from "opencc-js";
import { SKIP_PREFIXES, AiTranslatedTextsSchema } from "./_constants.js";
import { logInfo, logError, type LyricLine } from "./_utils.js";
import type { LyricsContent, ParsedLyricLine, WordTiming } from "../_utils/song-service.js";

// Simplified Chinese to Traditional Chinese converter
const simplifiedToTraditional = Converter({ from: "cn", to: "tw" });

// =============================================================================
// Types
// =============================================================================

/**
 * KRC language field structure (base64-encoded JSON)
 */
interface KrcLanguageContent {
  content: Array<{
    lyricContent: string[][];
    type: number; // 0 = romaji/pinyin, 1 = Chinese translation
    language: number;
  }>;
  version: number;
}

// Re-export LyricLine type
export type { LyricLine };

// =============================================================================
// KRC Chinese Extraction
// =============================================================================

/**
 * Check if a language code represents Chinese (Traditional)
 */
export function isChineseTraditional(language: string): boolean {
  const lower = language.toLowerCase();
  return (
    lower === "zh-tw" ||
    lower === "zh-hant" ||
    lower === "chinese traditional" ||
    lower === "traditional chinese" ||
    lower === "繁體中文"
  );
}

/**
 * Extract Chinese translation from KRC language field
 */
export function extractChineseFromKrcLanguage(krc: string): string[] | null {
  const languageMatch = krc.match(/^\[language:([^\]]+)\]/m);
  if (!languageMatch) return null;

  try {
    const decoded = atob(languageMatch[1]);
    const langData: KrcLanguageContent = JSON.parse(decoded);
    const chineseContent = langData.content.find((c) => c.type === 1);
    if (!chineseContent?.lyricContent) return null;
    return chineseContent.lyricContent.map((segments) => segments.join("").trim());
  } catch {
    return null;
  }
}

// =============================================================================
// Line Filtering
// =============================================================================

/**
 * Check if a line should be skipped (credits, metadata, etc.)
 */
export function shouldSkipLine(text: string, title?: string, artist?: string): boolean {
  const trimmed = text.trim();
  
  if (SKIP_PREFIXES.some((prefix) => trimmed.startsWith(prefix))) {
    return true;
  }
  
  if (
    (trimmed.startsWith("(") && trimmed.endsWith(")")) ||
    (trimmed.startsWith("（") && trimmed.endsWith("）"))
  ) {
    return true;
  }
  
  if (title && artist) {
    const titleArtist = `${title} - ${artist}`;
    const artistTitle = `${artist} - ${title}`;
    if (trimmed === titleArtist || trimmed === artistTitle || 
        trimmed.startsWith(titleArtist) || trimmed.startsWith(artistTitle)) {
      return true;
    }
  }
  
  return false;
}

// =============================================================================
// Lyrics Parsing
// =============================================================================

/**
 * Parse LRC format to lines
 */
export function parseLrcToLines(lrc: string, title?: string, artist?: string): LyricLine[] {
  const lines: LyricLine[] = [];
  const lineRegex = /^\[(\d{1,2}):(\d{1,2})\.(\d{2,3})\](.+)$/;

  for (const line of lrc.split("\n")) {
    const match = line.trim().match(lineRegex);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const ms = match[3].length === 2 ? parseInt(match[3], 10) * 10 : parseInt(match[3], 10);
      const startTimeMs = String(minutes * 60 * 1000 + seconds * 1000 + ms);
      const words = match[4].trim();
      if (words && !shouldSkipLine(words, title, artist)) {
        lines.push({ words, startTimeMs });
      }
    }
  }

  return lines;
}

/**
 * Parse KRC format with word-level timing
 */
export function parseKrcToLines(krc: string, title?: string, artist?: string): ParsedLyricLine[] {
  const lines: ParsedLyricLine[] = [];
  const lineHeaderRegex = /^\[(\d+),(\d+)\](.*)$/;
  const wordTimingRegex = /<(\d+),(\d+),\d+>((?:[^<]|<(?!\d))*)/g;

  const normalizedText = krc.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (const line of normalizedText.split("\n")) {
    const lineMatch = line.match(lineHeaderRegex);
    if (!lineMatch) continue;

    const [, startMs, , content] = lineMatch;
    const wordTimings: WordTiming[] = [];
    let fullText = "";

    wordTimingRegex.lastIndex = 0;
    let match;

    while ((match = wordTimingRegex.exec(content)) !== null) {
      const [, offsetMs, durationMs, text] = match;
      
      if (text) {
        wordTimings.push({
          text,
          startTimeMs: parseInt(offsetMs, 10),
          durationMs: parseInt(durationMs, 10),
        });
        fullText += text;
      }
    }

    if (wordTimings.length === 0) {
      const plainText = content.replace(/<\d+,\d+,\d+>/g, "").trim();
      if (plainText) {
        fullText = plainText;
      }
    }

    const trimmedText = fullText.trim();

    if (shouldSkipLine(trimmedText, title, artist)) {
      continue;
    }

    if (!trimmedText) {
      continue;
    }

    const lyricLine: ParsedLyricLine = {
      startTimeMs: startMs,
      words: trimmedText,
    };
    
    if (wordTimings.length > 0) {
      lyricLine.wordTimings = wordTimings;
    }
    
    lines.push(lyricLine);
  }

  return lines;
}

/**
 * Check if text appears to be KRC format
 */
export function isKrcFormat(text: string): boolean {
  const krcWordTimingPattern = /<\d+,\d+,\d+>/;
  const krcLinePattern = /^\[\d+,\d+\]/m;
  return krcWordTimingPattern.test(text) || krcLinePattern.test(text);
}

/**
 * Unified parsing function - parses KRC or LRC with consistent filtering
 */
export function parseLyricsContent(
  lyrics: { lrc?: string; krc?: string },
  title?: string,
  artist?: string
): ParsedLyricLine[] {
  if (lyrics.krc && isKrcFormat(lyrics.krc)) {
    const parsed = parseKrcToLines(lyrics.krc, title, artist);
    if (parsed.length > 0) {
      return parsed;
    }
  }
  
  if (lyrics.lrc) {
    const lrcLines = parseLrcToLines(lyrics.lrc, title, artist);
    return lrcLines.map(line => ({
      startTimeMs: line.startTimeMs,
      words: line.words,
    }));
  }
  
  return [];
}

// =============================================================================
// KRC Chinese Translation Building
// =============================================================================

interface RawKrcLine {
  rawIndex: number;
  startTimeMs: string;
  words: string;
  shouldSkip: boolean;
}

/**
 * Parse raw KRC lines with metadata about which are skipped
 */
function parseRawKrcLines(krc: string, title?: string, artist?: string): RawKrcLine[] {
  const lines: RawKrcLine[] = [];
  const lineHeaderRegex = /^\[(\d+),(\d+)\](.*)$/;
  const wordTimingRegex = /<(\d+),(\d+),\d+>((?:[^<]|<(?!\d))*)/g;

  const normalizedText = krc.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  let rawIndex = 0;

  for (const line of normalizedText.split("\n")) {
    const lineMatch = line.match(lineHeaderRegex);
    if (!lineMatch) continue;

    const [, startMs, , content] = lineMatch;
    const wordTimings: { text: string }[] = [];
    let fullText = "";

    wordTimingRegex.lastIndex = 0;
    let match;

    while ((match = wordTimingRegex.exec(content)) !== null) {
      const [, , , text] = match;
      if (text) {
        wordTimings.push({ text });
        fullText += text;
      }
    }

    if (wordTimings.length === 0) {
      const plainText = content.replace(/<\d+,\d+,\d+>/g, "").trim();
      if (plainText) {
        fullText = plainText;
      }
    }

    const trimmedText = fullText.trim();
    const skip = shouldSkipLine(trimmedText, title, artist) || !trimmedText;

    lines.push({
      rawIndex,
      startTimeMs: startMs,
      words: trimmedText,
      shouldSkip: skip,
    });

    rawIndex++;
  }

  return lines;
}

/**
 * Build a Traditional Chinese LRC from KRC embedded translation
 */
export function buildChineseTranslationFromKrc(
  lyrics: LyricsContent,
  title?: string,
  artist?: string
): string | null {
  if (!lyrics.krc) return null;

  const embeddedChinese = extractChineseFromKrcLanguage(lyrics.krc);
  if (!embeddedChinese || embeddedChinese.length === 0) return null;

  const rawLines = parseRawKrcLines(lyrics.krc, title, artist);
  if (rawLines.length === 0) return null;

  const resultLines: string[] = [];

  for (const rawLine of rawLines) {
    if (rawLine.shouldSkip) continue;

    const chineseLine = embeddedChinese[rawLine.rawIndex] || "";
    const chineseIsMetadata = !chineseLine || shouldSkipLine(chineseLine, title, artist);
    const textToUse = chineseIsMetadata ? rawLine.words : simplifiedToTraditional(chineseLine);

    resultLines.push(`${msToLrcTimeInternal(rawLine.startTimeMs)}${textToUse}`);
  }

  return resultLines.join("\n");
}

function msToLrcTimeInternal(msStr: string): string {
  const ms = parseInt(msStr, 10);
  if (isNaN(ms)) return "[00:00.00]";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const centiseconds = Math.floor((ms % 1000) / 10);
  return `[${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}]`;
}

// =============================================================================
// Translation
// =============================================================================

/**
 * Translate a chunk of lyrics using AI
 */
export async function translateChunk(
  chunk: LyricLine[],
  targetLanguage: string,
  requestId: string
): Promise<string[]> {
  const systemPrompt = `You are an expert lyrics translator. You will be given a JSON array of lyric line objects, where each object has a "words" field (the text to translate) and a "startTimeMs" field (a timestamp).
Your task is to translate the "words" for each line into ${targetLanguage}.
Respond ONLY with a valid JSON object containing a single key "translatedTexts". The value of "translatedTexts" MUST be an array of strings.
This array should contain only the translated versions of the "words" from the input, in the exact same order as they appeared in the input array.
If the lyrics are already in ${targetLanguage}, return the original "words" text exactly as-is without any modifications.
If a line is purely instrumental or cannot be translated (e.g., "---"), return its original "words" text.
Do not include timestamps or any other formatting in your output strings; just the raw translated text for each line. Do not use , . ! ? : ; punctuation at the end of lines. Preserve the artistic intent and natural rhythm of the lyrics.`;

  try {
    const { object: aiResponse } = await generateObject({
      model: google("gemini-2.5-flash"),
      schema: AiTranslatedTextsSchema,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(chunk.map((line) => ({ words: line.words }))) },
      ],
      temperature: 0.3,
    });

    if (aiResponse.translatedTexts.length !== chunk.length) {
      logInfo(requestId, `Warning: Translation response length mismatch - expected ${chunk.length}, got ${aiResponse.translatedTexts.length}`);
    }

    return chunk.map((line, index) => aiResponse.translatedTexts[index] || line.words);
  } catch (error) {
    logError(requestId, `Translation chunk failed, returning original text as fallback`, error);
    return chunk.map((line) => line.words);
  }
}
