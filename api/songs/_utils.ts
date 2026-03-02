/**
 * Song API Utility Functions
 */

import { z } from "zod";
import pako from "pako";
import { google } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { KRC_DECRYPTION_KEY, YOUTUBE_VIDEO_ID_REGEX } from "./_constants.js";

// =============================================================================
// Types
// =============================================================================

export interface WordTiming {
  text: string;
  startTimeMs: number;
  durationMs: number;
}

export interface LyricLine {
  words: string;
  startTimeMs: string;
  wordTimings?: WordTiming[];
}

// =============================================================================
// Logging
// =============================================================================

export function generateRequestId(): string {
  return Math.random().toString(36).substring(2, 10);
}

export function logInfo(id: string, message: string, data?: unknown) {
  console.log(`[${id}] INFO: ${message}`, data ?? "");
}

export function logError(id: string, message: string, error: unknown) {
  console.error(`[${id}] ERROR: ${message}`, error);
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Validate that a string is a valid YouTube video ID format
 */
export function isValidYouTubeVideoId(id: string): boolean {
  return YOUTUBE_VIDEO_ID_REGEX.test(id);
}

// =============================================================================
// Network
// =============================================================================

/**
 * Fetch with timeout using AbortController
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 10000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

// =============================================================================
// String Utilities
// =============================================================================

export function randomString(length: number, chars: string): string {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function base64ToUtf8(base64: string): string {
  const binaryString = atob(base64);
  const bytes = Uint8Array.from(binaryString, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function decodeKRC(krcBase64: string): string {
  const binaryString = atob(krcBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const encrypted = bytes.slice(4);
  for (let i = 0; i < encrypted.length; i++) {
    encrypted[i] ^= KRC_DECRYPTION_KEY[i % 16];
  }
  const decompressed = pako.inflate(encrypted);
  return new TextDecoder("utf-8").decode(decompressed);
}

export function stripParentheses(str: string): string {
  if (!str) return str;
  return str.replace(/\s*\([^)]*\)\s*/g, " ").trim();
}

/**
 * Sanitize input string by removing invisible/zero-width characters
 * These can break AI parsing and JSON output
 */
export function sanitizeInput(str: string): string {
  if (!str) return str;
  // Remove zero-width and invisible characters
  // eslint-disable-next-line no-misleading-character-class -- intentionally matching zero-width and invisible Unicode characters
  return str.replace(/[\u200B\u200C\u200D\uFEFF\u2060\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B\u180C\u180D\u180E\u2000-\u200F\u202A-\u202E\u2061-\u2064\u206A-\u206F]/g, "").trim();
}

// =============================================================================
// Similarity & Matching
// =============================================================================

export function normalizeForComparison(str: string): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function calculateSimilarity(query: string, target: string): number {
  const normQuery = normalizeForComparison(query);
  const normTarget = normalizeForComparison(target);
  if (!normQuery || !normTarget) return 0;
  if (normQuery === normTarget) return 1.0;
  if (normTarget.includes(normQuery)) return 0.9;
  if (normQuery.includes(normTarget)) return 0.85;

  const queryWords = new Set(normQuery.split(" ").filter(Boolean));
  const targetWords = new Set(normTarget.split(" ").filter(Boolean));
  if (queryWords.size === 0) return 0;

  let matchingWords = 0;
  for (const word of Array.from(queryWords)) {
    if (targetWords.has(word)) {
      matchingWords++;
    } else if (word.length > 3) {
      for (const targetWord of Array.from(targetWords)) {
        if (targetWord.includes(word) || word.includes(targetWord)) {
          matchingWords += 0.5;
          break;
        }
      }
    }
  }
  return (matchingWords / queryWords.size) * 0.8;
}

export function scoreSongMatch(
  song: { songname: string; singername: string },
  requestedTitle: string,
  requestedArtist: string
): number {
  const titleScore = calculateSimilarity(
    stripParentheses(requestedTitle),
    stripParentheses(song.songname)
  );
  const artistScore = calculateSimilarity(
    stripParentheses(requestedArtist),
    stripParentheses(song.singername)
  );
  const combinedScore = titleScore * 0.55 + artistScore * 0.45;
  if (titleScore >= 0.7 && artistScore >= 0.7) {
    return combinedScore + 0.1;
  }
  return combinedScore;
}

// =============================================================================
// Title Parsing
// =============================================================================

/**
 * Check if a parsed result looks valid (not malformed AI output)
 */
function isValidParsedResult(result: { title: string; artist: string }, rawTitle: string): boolean {
  const jsonPattern = /[{}":].*[{}":]|"artist"|"title"/i;
  if (jsonPattern.test(result.title) || jsonPattern.test(result.artist)) {
    return false;
  }
  if (result.title.length > rawTitle.length * 2) {
    return false;
  }
  return true;
}

/**
 * Simple regex-based title parser as fallback.
 */
export function parseYouTubeTitleSimple(rawTitle: string, channelName?: string): { title: string; artist: string } {
  if (!rawTitle) {
    return { title: "", artist: "" };
  }

  let cleaned = rawTitle
    .replace(/\s*[[(【「『]?\s*(official\s*)?(music\s*)?(video|mv|m\/v|audio|lyric|lyrics|visualizer|live)\s*[\])】」』]?\s*/gi, " ")
    .replace(/\s*【[^】]*】\s*/g, " ")
    .replace(/\s*\[[^\]]*\]\s*/g, " ")
    .trim();

  cleaned = stripParentheses(cleaned);

  const delimiterMatch = cleaned.match(/^(.+?)\s*[-–—|]\s*(.+)$/);
  if (delimiterMatch) {
    return {
      title: delimiterMatch[2].trim(),
      artist: delimiterMatch[1].trim(),
    };
  }

  const quotedMatch = cleaned.match(/^(.+?)\s*[「'"]([^」'"]+)[」'"]/);
  if (quotedMatch) {
    return {
      title: quotedMatch[2].trim(),
      artist: quotedMatch[1].trim(),
    };
  }

  let artist = "";
  if (channelName) {
    const genericPatterns = /vevo|topic|official|music|records|entertainment|labels/i;
    if (!genericPatterns.test(channelName)) {
      artist = channelName.replace(/\s*-\s*Topic$/i, "").replace(/VEVO$/i, "").trim();
    }
  }

  return { title: cleaned, artist };
}

// Timeout for AI title parsing (8 seconds - should be less than fetch timeout)
const AI_TITLE_PARSE_TIMEOUT_MS = 8000;

/**
 * Use AI to parse a YouTube title into song title and artist.
 * Has a timeout to prevent hanging the request if AI is slow.
 */
export async function parseYouTubeTitleWithAI(
  rawTitle: string,
  channelName?: string,
  requestId?: string
): Promise<{ title: string; artist: string }> {
  const cleanTitle = sanitizeInput(rawTitle);
  const cleanChannel = channelName ? sanitizeInput(channelName) : undefined;
  
  if (!cleanTitle) {
    if (requestId) {
      logInfo(requestId, "Title empty after sanitization, using fallback", { raw: rawTitle });
    }
    return parseYouTubeTitleSimple(rawTitle, channelName);
  }
  
  // Create abort controller with timeout for AI call
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), AI_TITLE_PARSE_TIMEOUT_MS);
  
  try {
    const { output: parsedData } = await generateText({
      model: google("gemini-2.0-flash"),
      output: Output.object({
        schema: z.object({
          title: z.string().nullable(),
          artist: z.string().nullable(),
        }),
        name: "parsed_song_metadata",
      }),
      messages: [
        {
          role: "system",
          content: `You are an expert music metadata parser. Given a raw YouTube video title and optionally the channel name, extract the song title and artist.

Rules:
- Return ONLY the clean song title and artist name as simple strings
- Prefer original language names (e.g., "周杰倫" over "Jay Chou", "뉴진스" over "NewJeans")
- Remove video markers like "Official MV", "Lyric Video", "[MV]", etc. from the title
- The artist is usually before the delimiter (-, |, etc.) or in the channel name
- Channel names ending in "VEVO", "- Topic", or containing "Official" often indicate the artist
- If you cannot determine a field, return null

Examples:
- "Jay Chou - Sunny Day (周杰倫 - 晴天)" → title: "晴天", artist: "周杰倫"
- "NewJeans (뉴진스) 'How Sweet' Official MV" → title: "How Sweet", artist: "뉴진스"
- "Kenshi Yonezu - KICK BACK" with channel "Kenshi Yonezu" → title: "KICK BACK", artist: "米津玄師"
- "Lofi Hip Hop Radio" with channel "ChillHop Music" → title: "Lofi Hip Hop Radio", artist: null`,
        },
        {
          role: "user",
          content: `Title: ${cleanTitle}${cleanChannel ? `\nChannel: ${cleanChannel}` : ""}`,
        },
      ],
      temperature: 0.1,
      abortSignal: abortController.signal,
    });

    clearTimeout(timeoutId);

    const result = {
      title: parsedData.title ?? cleanTitle,
      artist: parsedData.artist ?? "",
    };
    
    if (!isValidParsedResult(result, cleanTitle)) {
      if (requestId) {
        logInfo(requestId, "AI returned malformed result, using fallback", { raw: rawTitle, malformed: result });
      }
      return parseYouTubeTitleSimple(rawTitle, channelName);
    }
    
    if (requestId) {
      logInfo(requestId, "AI parsed title", { raw: rawTitle, parsed: result });
    }
    
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    const isTimeout = error instanceof Error && error.name === "AbortError";
    if (requestId) {
      logError(requestId, `AI title parsing failed${isTimeout ? " (timeout)" : ""}, using fallback`, error);
    }
    return parseYouTubeTitleSimple(rawTitle, channelName);
  }
}

// =============================================================================
// LRC Time Formatting
// =============================================================================

export function msToLrcTime(msStr: string): string {
  const ms = parseInt(msStr, 10);
  if (isNaN(ms)) return "[00:00.00]";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const centiseconds = Math.floor((ms % 1000) / 10);
  return `[${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}]`;
}
