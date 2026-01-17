/**
 * Lyrics Parsing and Translation Functions
 * 
 * Handles parsing LRC/KRC formats and translating lyrics via AI.
 */

import { openai } from "@ai-sdk/openai";
import { Converter } from "opencc-js";
import { SKIP_PREFIXES } from "./_constants.js";
import { logInfo, logError, type LyricLine } from "./_utils.js";
import type { LyricsContent, ParsedLyricLine, WordTiming } from "../_utils/_song-service.js";

// Chinese character converters
const simplifiedToTraditional = Converter({ from: "cn", to: "tw" });
const traditionalToSimplified = Converter({ from: "tw", to: "cn" });

// Unicode ranges for script detection
const HIRAGANA_REGEX = /[\u3040-\u309F]/;
const KATAKANA_REGEX = /[\u30A0-\u30FF]/;
const CJK_UNIFIED_REGEX = /[\u4E00-\u9FFF]/;

/**
 * Check if text contains Japanese Kana (Hiragana or Katakana)
 */
function hasKanaText(text: string): boolean {
  return HIRAGANA_REGEX.test(text) || KATAKANA_REGEX.test(text);
}

/**
 * Check if text contains CJK ideographs (Kanji/Hanzi)
 */
function hasKanjiText(text: string): boolean {
  return CJK_UNIFIED_REGEX.test(text);
}

/**
 * Check if lyrics are Japanese (have both Kanji and Kana somewhere in the text)
 * This distinguishes Japanese from Chinese (which has Hanzi but no Kana)
 */
function lyricsAreJapanese(lines: Array<{ words: string }>): boolean {
  const allText = lines.map(l => l.words).join("");
  return hasKanjiText(allText) && hasKanaText(allText);
}

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
    // Also create simplified Chinese versions for matching lyrics with different character variants
    const titleArtistSimplified = traditionalToSimplified(titleArtist);
    const artistTitleSimplified = traditionalToSimplified(artistTitle);
    
    if (trimmed === titleArtist || trimmed === artistTitle || 
        trimmed.startsWith(titleArtist) || trimmed.startsWith(artistTitle) ||
        trimmed === titleArtistSimplified || trimmed === artistTitleSimplified ||
        trimmed.startsWith(titleArtistSimplified) || trimmed.startsWith(artistTitleSimplified)) {
      return true;
    }
  }
  
  // Also match artist alone (for metadata lines that only show the artist name)
  // Use minimum length to avoid false positives with short names
  const MIN_LENGTH = 3;
  
  if (artist && artist.length >= MIN_LENGTH) {
    const artistSimplified = traditionalToSimplified(artist);
    if (trimmed === artist || trimmed === artistSimplified) {
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
 * Converts Chinese lyrics to Traditional Chinese (Kugou uses Simplified)
 */
export function parseLyricsContent(
  lyrics: { lrc?: string; krc?: string },
  title?: string,
  artist?: string
): ParsedLyricLine[] {
  let lines: ParsedLyricLine[] = [];
  
  if (lyrics.krc && isKrcFormat(lyrics.krc)) {
    const parsed = parseKrcToLines(lyrics.krc, title, artist);
    if (parsed.length > 0) {
      lines = parsed;
    }
  }
  
  if (lines.length === 0 && lyrics.lrc) {
    const lrcLines = parseLrcToLines(lyrics.lrc, title, artist);
    lines = lrcLines.map(line => ({
      startTimeMs: line.startTimeMs,
      words: line.words,
    }));
  }
  
  // Convert Chinese lyrics from Simplified to Traditional Chinese
  // Kugou lyrics are in Simplified Chinese - convert to Traditional for display
  // IMPORTANT: Skip this for Japanese lyrics to avoid corrupting Japanese Kanji
  // (e.g., Japanese 気→氣, 国→國 would be wrong)
  if (lyricsAreJapanese(lines)) {
    // Japanese lyrics - return as-is without Chinese conversion
    return lines;
  }

  // Chinese lyrics - convert from Simplified to Traditional
  return lines.map(line => ({
    ...line,
    words: simplifiedToTraditional(line.words),
    // Also convert wordTimings text if present
    ...(line.wordTimings && {
      wordTimings: line.wordTimings.map(wt => ({
        ...wt,
        text: simplifiedToTraditional(wt.text),
      })),
    }),
  }));
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
    // Always convert to Traditional Chinese - both the translation and the fallback (original lyrics)
    // since KRC files from Kugou are in Simplified Chinese
    const textToUse = simplifiedToTraditional(chineseIsMetadata ? rawLine.words : chineseLine);

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

import { streamText } from "ai";

// AI generation timeout (90 seconds for full song streaming)
const AI_TIMEOUT_MS = 90000;

/**
 * Map language codes to readable language names for the AI prompt.
 * This ensures the AI understands the target language correctly.
 */
const LANGUAGE_NAMES: Record<string, string> = {
  "en": "English",
  "ja": "Japanese (日本語)",
  "ko": "Korean (한국어)",
  "zh-TW": "Traditional Chinese (繁體中文)",
  "zh-CN": "Simplified Chinese (简体中文)",
  "zh": "Chinese (中文)",
  "es": "Spanish (Español)",
  "fr": "French (Français)",
  "de": "German (Deutsch)",
  "pt": "Portuguese (Português)",
  "it": "Italian (Italiano)",
  "ru": "Russian (Русский)",
};

/**
 * Get readable language name from language code.
 * Falls back to the original code if not found in mapping.
 */
function getLanguageName(languageCode: string): string {
  return LANGUAGE_NAMES[languageCode] || languageCode;
}

/** Generate the translation system prompt for a target language */
export function getTranslationSystemPrompt(targetLanguage: string): string {
  const languageName = getLanguageName(targetLanguage);
  return `Translate ALL lyrics to ${languageName} (one line per input line).

IMPORTANT: Translate from ANY source language (Korean, Japanese, Chinese, English, etc.) to ${languageName}.
- Korean (한국어) lyrics → translate to ${languageName}
- Japanese (日本語) lyrics → translate to ${languageName}
- Chinese (中文) lyrics → translate to ${languageName}
- English lyrics → translate to ${languageName}
- If a line is ALREADY in ${languageName}, keep it as-is.

Output format: Number each line like "1: translation", "2: translation", etc.
For instrumental lines (e.g., "---"), return original.
Preserve artistic intent and rhythm. Don't add punctuation at end of lines.

Example output format:
1: First translated line
2: Second translated line
3: Third translated line`;
}

/**
 * Stream translation for all lyrics line-by-line using streamText
 * Emits each line as it's completed via onLine callback
 * 
 * @param lines - All lyrics lines to translate
 * @param targetLanguage - Target language (e.g., "English", "繁體中文")
 * @param requestId - Request ID for logging
 * @param onLine - Callback called for each completed line (lineIndex, translation)
 * @returns Promise that resolves when streaming is complete
 */
export async function streamTranslation(
  lines: LyricLine[],
  targetLanguage: string,
  requestId: string,
  onLine: (lineIndex: number, translation: string) => void
): Promise<{ translations: string[]; success: boolean }> {
  if (lines.length === 0) {
    return { translations: [], success: true };
  }

  // Use the shared prompt generator for consistency
  const systemPrompt = getTranslationSystemPrompt(targetLanguage);

  // Use numbered lines for reliable parsing during streaming
  const textsToProcess = lines.map((line, i) => `${i + 1}: ${line.words}`).join("\n");
  
  const results: string[] = new Array(lines.length).fill("");
  let currentLineBuffer = "";
  let completedCount = 0;

  // Create abort controller with timeout
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), AI_TIMEOUT_MS);

  const startTime = Date.now();
  logInfo(requestId, `Starting translation stream`, { totalLines: lines.length, targetLanguage, timeoutMs: AI_TIMEOUT_MS });

  try {
    const result = streamText({
      model: openai("gpt-5.2"),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: textsToProcess },
      ],
      temperature: 0.3,
      abortSignal: abortController.signal,
    });

    // Process streaming text
    for await (const chunk of result.textStream) {
      currentLineBuffer += chunk;
      
      // Process complete lines (ending with newline)
      let newlineIdx;
      while ((newlineIdx = currentLineBuffer.indexOf("\n")) !== -1) {
        const completeLine = currentLineBuffer.slice(0, newlineIdx).trim();
        currentLineBuffer = currentLineBuffer.slice(newlineIdx + 1);
        
        if (!completeLine) continue;
        
        // Parse line number format: "1: translation text"
        const match = completeLine.match(/^(\d+):\s*(.*)$/);
        if (match) {
          const lineIndex = parseInt(match[1], 10) - 1; // 1-based to 0-based
          const translation = match[2].trim();
          
          if (lineIndex >= 0 && lineIndex < lines.length && translation) {
            results[lineIndex] = translation;
            completedCount++;
            onLine(lineIndex, translation);
          }
        }
      }
    }
    
    // Handle any remaining content (last line might not end with newline)
    if (currentLineBuffer.trim()) {
      const match = currentLineBuffer.trim().match(/^(\d+):\s*(.*)$/);
      if (match) {
        const lineIndex = parseInt(match[1], 10) - 1;
        const translation = match[2].trim();
        
        if (lineIndex >= 0 && lineIndex < lines.length && translation) {
          results[lineIndex] = translation;
          completedCount++;
          onLine(lineIndex, translation);
        }
      }
    }
    
    clearTimeout(timeoutId);
    const durationMs = Date.now() - startTime;
    
    // Fill in any missing translations with original text
    for (let i = 0; i < lines.length; i++) {
      if (!results[i]) {
        results[i] = lines[i].words;
      }
    }
    
    logInfo(requestId, `Translation stream completed`, { 
      durationMs, 
      completedCount, 
      totalLines: lines.length,
      missedLines: lines.length - completedCount
    });
    
    return { translations: results, success: true };
  } catch (error) {
    clearTimeout(timeoutId);
    const durationMs = Date.now() - startTime;
    const isTimeout = error instanceof Error && error.name === "AbortError";
    
    logError(requestId, `Translation stream failed${isTimeout ? " (timeout)" : ""}`, { error, durationMs, completedCount });
    
    // Fill in remaining with original text as fallback
    for (let i = 0; i < lines.length; i++) {
      if (!results[i]) {
        results[i] = lines[i].words;
        onLine(i, lines[i].words); // Emit fallback
      }
    }
    
    return { translations: results, success: false };
  }
}
