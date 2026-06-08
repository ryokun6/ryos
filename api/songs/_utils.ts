/**
 * Song API Utility Functions
 */

import pako from "pako";
import { Converter } from "opencc-js";
import {
  APPLE_MUSIC_ID_REGEX,
  KRC_DECRYPTION_KEY,
  YOUTUBE_VIDEO_ID_REGEX,
} from "./_constants.js";
export {
  isValidParsedResult,
  parseYouTubeTitleSimple,
  parseYouTubeTitleWithAI,
  sanitizeInput,
  type ParsedYouTubeTitle,
} from "../_utils/parse-youtube-title.js";

/** Traditional → Simplified for cross-strait lyric metadata matching (KuGou is Simplified) */
const traditionalToSimplified = Converter({ from: "tw", to: "cn" });

const HIRAGANA_REGEX = /[\u3040-\u309F]/;
const KATAKANA_REGEX = /[\u30A0-\u30FF]/;
const CJK_UNIFIED_REGEX = /[\u4E00-\u9FFF]/;

function hasKana(text: string): boolean {
  return HIRAGANA_REGEX.test(text) || KATAKANA_REGEX.test(text);
}

function hasCjkIdeographs(text: string): boolean {
  return CJK_UNIFIED_REGEX.test(text);
}

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

/**
 * Validate that a string is a valid Apple Music namespaced song ID
 * (`am:<catalogId or libraryId>`).
 */
export function isValidAppleMusicSongId(id: string): boolean {
  return APPLE_MUSIC_ID_REGEX.test(id);
}

/**
 * Validate that a string is a valid song ID for any backed source.
 * Currently supports YouTube video IDs and Apple Music namespaced IDs.
 */
export function isValidSongId(id: string): boolean {
  return isValidYouTubeVideoId(id) || isValidAppleMusicSongId(id);
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

/**
 * Remove parenthetical / bracketed segments (ASCII and common CJK wrappers) for cleaner matching.
 */
export function stripParentheses(str: string): string {
  if (!str) return str;
  let s = str;
  const bracketPatterns = [
    /\s*\([^)]*\)\s*/g,
    /\s*（[^）]*）\s*/g,
    /\s*【[^】]*】\s*/g,
    /\s*「[^」]*」\s*/g,
    /\s*『[^』]*』\s*/g,
  ];
  for (const re of bracketPatterns) {
    s = s.replace(re, " ");
  }
  return s.replace(/\s+/g, " ").trim();
}

// =============================================================================
// Similarity & Matching
// =============================================================================

/**
 * Normalize for fuzzy comparison: Unicode letters/numbers preserved (not ASCII-only \\w).
 */
export function normalizeForComparison(str: string): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bigramJaccard(a: string, b: string): number {
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = (s: string): Set<string> => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) {
      set.add(s.slice(i, i + 2));
    }
    return set;
  };
  const A = bigrams(a);
  const B = bigrams(b);
  let inter = 0;
  for (const x of A) {
    if (B.has(x)) inter++;
  }
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * When both sides may be Chinese (Han) and neither has Japanese Kana, map to Simplified so
 * Traditional metadata matches KuGou's Simplified strings.
 */
function harmonizeChineseScriptForMatch(a: string, b: string): [string, string] {
  if (hasKana(a) || hasKana(b)) {
    return [a, b];
  }
  if (!hasCjkIdeographs(a) && !hasCjkIdeographs(b)) {
    return [a, b];
  }
  return [traditionalToSimplified(a), traditionalToSimplified(b)];
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
    } else if (word.length > 3 || hasCjkIdeographs(word)) {
      for (const targetWord of Array.from(targetWords)) {
        if (targetWord.includes(word) || word.includes(targetWord)) {
          matchingWords += 0.5;
          break;
        }
      }
    }
  }
  let score = (matchingWords / queryWords.size) * 0.8;
  if (score < 0.75) {
    const compactQ = normQuery.replace(/\s/g, "");
    const compactT = normTarget.replace(/\s/g, "");
    if (compactQ.length >= 2 && compactT.length >= 2) {
      const j = bigramJaccard(compactQ, compactT);
      if (j > 0) {
        score = Math.max(score, j * 0.75);
      }
    }
  }
  return score;
}

export function scoreSongMatch(
  song: { songname: string; singername: string },
  requestedTitle: string,
  requestedArtist: string
): number {
  const titleA = stripParentheses(requestedTitle);
  const titleB = stripParentheses(song.songname);
  const artistA = stripParentheses(requestedArtist);
  const artistB = stripParentheses(song.singername);

  const [t1, t2] = harmonizeChineseScriptForMatch(titleA, titleB);
  const [a1, a2] = harmonizeChineseScriptForMatch(artistA, artistB);

  const titleScore = calculateSimilarity(t1, t2);
  const artistScore = calculateSimilarity(a1, a2);
  const combinedScore = titleScore * 0.55 + artistScore * 0.45;
  if (titleScore >= 0.7 && artistScore >= 0.7) {
    return combinedScore + 0.1;
  }
  return combinedScore;
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
