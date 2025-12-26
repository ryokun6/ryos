/**
 * Unified Song API Endpoint
 *
 * GET /api/song/{id} - Retrieve song data
 * POST /api/song/{id} - Update song metadata
 * DELETE /api/song/{id} - Delete song (admin only)
 *
 * Query params for GET:
 * - include: Comma-separated list of: metadata,lyrics,translations,furigana
 * - translateTo: Language code to fetch/generate translation
 * - withFurigana: Boolean to fetch/generate furigana
 * - force: Boolean to bypass cache
 *
 * Sub-routes (handled via action param):
 * - POST with action=fetch-lyrics: Fetch lyrics from Kugou
 * - POST with action=translate: Generate translation
 * - POST with action=furigana: Generate furigana
 * - POST with action=search-lyrics: Search for lyrics matches
 */

import { Redis } from "@upstash/redis";
import { z } from "zod";
import pako from "pako";
import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { Converter } from "opencc-js";
import {
  getEffectiveOrigin,
  isAllowedOrigin,
  preflightIfNeeded,
} from "../_utils/cors.js";
import { validateAuthToken } from "../_utils/auth-validate.js";
import {
  getSong,
  saveSong,
  deleteSong,
  saveLyrics,
  saveTranslation,
  saveFurigana,
  saveSoramimi,
  canModifySong,
  type LyricsSource,
  type LyricsContent,
  type FuriganaSegment,
  type ParsedLyricLine,
  type WordTiming,
} from "../_utils/song-service.js";

// Vercel Edge Function configuration
export const config = {
  runtime: "edge",
};

// Simplified Chinese to Traditional Chinese converter for Kugou metadata and lyrics
const simplifiedToTraditional = Converter({ from: "cn", to: "tw" });

/**
 * Check if a language code represents Chinese (Traditional)
 * This is used to determine if we can use KRC source directly instead of AI translation
 */
function isChineseTraditional(language: string): boolean {
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

/**
 * Extract Chinese translation from KRC language field
 * The KRC format embeds translations in a base64-encoded JSON in the [language:...] tag
 * type=1 is the Chinese (Simplified) translation
 */
function extractChineseFromKrcLanguage(krc: string): string[] | null {
  // Find the [language:...] line
  const languageMatch = krc.match(/^\[language:([^\]]+)\]/m);
  if (!languageMatch) return null;

  try {
    // Decode base64
    const decoded = atob(languageMatch[1]);
    const langData: KrcLanguageContent = JSON.parse(decoded);

    // Find the Chinese translation (type=1)
    const chineseContent = langData.content.find((c) => c.type === 1);
    if (!chineseContent?.lyricContent) return null;

    // Each line is an array of word segments, join them
    return chineseContent.lyricContent.map((segments) => segments.join("").trim());
  } catch {
    return null;
  }
}

/**
 * Parse raw KRC lines WITHOUT filtering to get indices that match embedded translation
 * Returns array of { rawIndex, startTimeMs, words, shouldSkip }
 */
function parseKrcRawLines(krc: string, title?: string, artist?: string): Array<{
  rawIndex: number;
  startTimeMs: string;
  words: string;
  shouldSkip: boolean;
}> {
  const lines: Array<{ rawIndex: number; startTimeMs: string; words: string; shouldSkip: boolean }> = [];
  const lineHeaderRegex = /^\[(\d+),(\d+)\](.*)$/;
  const wordTimingRegex = /<(\d+),(\d+),\d+>((?:[^<]|<(?!\d))*)/g;

  // Normalize line endings
  const normalizedText = krc.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  let rawIndex = 0;

  for (const line of normalizedText.split("\n")) {
    const lineMatch = line.match(lineHeaderRegex);
    if (!lineMatch) continue;

    const [, startMs, , content] = lineMatch;
    
    // Extract text from word timings
    let fullText = "";
    let match;
    wordTimingRegex.lastIndex = 0;

    while ((match = wordTimingRegex.exec(content)) !== null) {
      const [, , , text] = match;
      if (text) fullText += text;
    }

    // If no word timings found, try plain text
    if (!fullText) {
      fullText = content.replace(/<\d+,\d+,\d+>/g, "").trim();
    }

    const trimmedText = fullText.trim();
    const shouldSkip = !trimmedText || shouldSkipLine(trimmedText, title, artist);

    lines.push({
      rawIndex,
      startTimeMs: startMs,
      words: trimmedText,
      shouldSkip,
    });
    rawIndex++;
  }

  return lines;
}

/**
 * Build a Traditional Chinese LRC from KRC embedded translation
 * Returns null if KRC doesn't have embedded Chinese translation
 */
function buildChineseTranslationFromKrc(
  lyrics: LyricsContent,
  title?: string,
  artist?: string
): string | null {
  if (!lyrics.krc) return null;

  // Try to extract Chinese from the embedded language field
  const embeddedChinese = extractChineseFromKrcLanguage(lyrics.krc);
  if (!embeddedChinese || embeddedChinese.length === 0) return null;

  // Parse raw KRC lines to get the mapping between raw indices and filtered lines
  const rawLines = parseKrcRawLines(lyrics.krc, title, artist);
  if (rawLines.length === 0) return null;

  // Build LRC with Traditional Chinese for non-skipped lines only
  const resultLines: string[] = [];
  
  for (const rawLine of rawLines) {
    if (rawLine.shouldSkip) continue;

    // Get Chinese translation at the same raw index
    const chineseLine = embeddedChinese[rawLine.rawIndex] || "";
    
    // If Chinese line is metadata (empty or matches skip prefixes), use original lyrics
    const chineseIsMetadata = !chineseLine || shouldSkipLine(chineseLine, title, artist);
    const textToUse = chineseIsMetadata ? rawLine.words : simplifiedToTraditional(chineseLine);
    
    resultLines.push(`${msToLrcTime(rawLine.startTimeMs)}${textToUse}`);
  }

  return resultLines.length > 0 ? resultLines.join("\n") : null;
}

// Extended timeout for AI processing
export const maxDuration = 120;

// =============================================================================
// Constants & Schemas
// =============================================================================

const CHUNK_SIZE = 15;

const kugouHeaders: HeadersInit = {
  "User-Agent":
    '{"percent": 21.4, "useragent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36", "system": "Chrome 116.0 Win10", "browser": "chrome", "version": 116.0, "os": "win10"}',
};

// KRC decryption key
const KRC_DECRYPTION_KEY = [64, 71, 97, 119, 94, 50, 116, 71, 81, 54, 49, 45, 206, 210, 110, 105];

// YouTube video ID format: 11 characters, alphanumeric with - and _
const YOUTUBE_VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

/**
 * Validate that a string is a valid YouTube video ID format
 * @param id - The string to validate
 * @returns true if valid YouTube video ID format, false otherwise
 */
function isValidYouTubeVideoId(id: string): boolean {
  return YOUTUBE_VIDEO_ID_REGEX.test(id);
}

const LyricsSourceSchema = z.object({
  hash: z.string(),
  albumId: z.union([z.string(), z.number()]),
  title: z.string().max(500),
  artist: z.string().max(500),
  album: z.string().max(500).optional(),
});

const UpdateSongSchema = z.object({
  title: z.string().max(500).optional(),
  artist: z.string().max(500).optional(),
  album: z.string().max(500).optional(),
  lyricOffset: z.number().min(-60000).max(60000).optional(),
  lyricsSource: LyricsSourceSchema.optional(),
  // Options to clear cached data when lyrics source changes
  clearTranslations: z.boolean().optional(),
  clearFurigana: z.boolean().optional(),
  clearLyrics: z.boolean().optional(),
  // Flag to indicate this is a share action (sets createdBy)
  isShare: z.boolean().optional(),
});

const FetchLyricsSchema = z.object({
  action: z.literal("fetch-lyrics"),
  lyricsSource: LyricsSourceSchema.optional(),
  force: z.boolean().optional(),
  // Allow client to pass title/artist for auto-search when song not in Redis yet
  title: z.string().max(500).optional(),
  artist: z.string().max(500).optional(),
  // Optional: include translation/furigana/soramimi info in same request to reduce round-trips
  translateTo: z.string().max(10).optional(),
  includeFurigana: z.boolean().optional(),
  includeSoramimi: z.boolean().optional(),
});

const SearchLyricsSchema = z.object({
  action: z.literal("search-lyrics"),
  query: z.string().max(500).optional(),
});

// Chunked processing schemas - for avoiding edge function timeouts
const TranslateChunkSchema = z.object({
  action: z.literal("translate-chunk"),
  language: z.string().max(10),
  chunkIndex: z.number().int().min(0).max(1000),
  totalChunks: z.number().int().min(0).max(1000).optional(), // Optional, will be computed if not provided
  force: z.boolean().optional(),
});

const FuriganaChunkSchema = z.object({
  action: z.literal("furigana-chunk"),
  chunkIndex: z.number().int().min(0).max(1000),
  totalChunks: z.number().int().min(0).max(1000).optional(),
  force: z.boolean().optional(),
});

const SoramimiChunkSchema = z.object({
  action: z.literal("soramimi-chunk"),
  chunkIndex: z.number().int().min(0).max(1000),
  totalChunks: z.number().int().min(0).max(1000).optional(),
  force: z.boolean().optional(),
});

// Schema for getting chunk info (how many chunks total)
const GetChunkInfoSchema = z.object({
  action: z.literal("get-chunk-info"),
  operation: z.enum(["translate", "furigana", "soramimi"]),
  language: z.string().max(10).optional(), // Required for translate
  force: z.boolean().optional(), // Skip consolidated cache if true
});

// Schema for saving consolidated translation after chunked processing
const SaveTranslationSchema = z.object({
  action: z.literal("save-translation"),
  language: z.string().max(10),
  translations: z.array(z.string()).max(500),
});

// Schema for saving consolidated furigana after chunked processing
const SaveFuriganaSchema = z.object({
  action: z.literal("save-furigana"),
  furigana: z.array(z.array(z.object({
    text: z.string(),
    reading: z.string().optional(),
  }))).max(500),
});

// Schema for saving consolidated soramimi after chunked processing
const SaveSoramimiSchema = z.object({
  action: z.literal("save-soramimi"),
  soramimi: z.array(z.array(z.object({
    text: z.string(),
    reading: z.string().optional(),
  }))).max(500),
});

// Schema for clearing cached translations and furigana
const ClearCachedDataSchema = z.object({
  action: z.literal("clear-cached-data"),
  clearTranslations: z.boolean().optional(),
  clearFurigana: z.boolean().optional(),
});

// Schema for unsharing a song (clearing createdBy)
const UnshareSongSchema = z.object({
  action: z.literal("unshare"),
});

// AI response schemas
const AiTranslatedTextsSchema = z.object({
  translatedTexts: z.array(z.string()),
});

const FuriganaSegmentSchema = z.object({
  text: z.string(),
  reading: z.string().optional(),
});

const AiFuriganaResponseSchema = z.object({
  annotatedLines: z.array(z.array(FuriganaSegmentSchema)),
});

// Soramimi schema (Chinese misheard lyrics)
const SoramimiSegmentSchema = z.object({
  text: z.string(),
  reading: z.string().optional(), // The Chinese characters that sound like the original
});

const AiSoramimiResponseSchema = z.object({
  annotatedLines: z.array(z.array(SoramimiSegmentSchema)),
});

// =============================================================================
// Utility Functions
// =============================================================================

function generateRequestId(): string {
  return Math.random().toString(36).substring(2, 10);
}

/**
 * Fetch with timeout using AbortController
 * @param url - The URL to fetch
 * @param options - Fetch options
 * @param timeoutMs - Timeout in milliseconds (default 10000)
 */
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

function logInfo(id: string, message: string, data?: unknown) {
  console.log(`[${id}] INFO: ${message}`, data ?? "");
}

function logError(id: string, message: string, error: unknown) {
  console.error(`[${id}] ERROR: ${message}`, error);
}

function randomString(length: number, chars: string): string {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function base64ToUtf8(base64: string): string {
  const binaryString = atob(base64);
  const bytes = Uint8Array.from(binaryString, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function decodeKRC(krcBase64: string): string {
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

function stripParentheses(str: string): string {
  if (!str) return str;
  return str.replace(/\s*\([^)]*\)\s*/g, " ").trim();
}

/**
 * Sanitize input string by removing invisible/zero-width characters
 * These can break AI parsing and JSON output
 */
function sanitizeInput(str: string): string {
  if (!str) return str;
  // Remove zero-width and invisible characters
  // \u200B-\u200D: zero-width spaces
  // \uFEFF: byte order mark
  // \u2060: word joiner
  // \u00AD: soft hyphen
  // \u034F: combining grapheme joiner
  // \u061C: arabic letter mark
  // \u115F-\u1160: hangul fillers
  // \u17B4-\u17B5: khmer vowel inherent
  // \u180B-\u180D: mongolian free variation selectors
  // \u180E: mongolian vowel separator
  // \u2000-\u200F: general punctuation spaces and marks
  // \u202A-\u202E: bidirectional text controls
  // \u2061-\u2064: invisible operators
  // \u206A-\u206F: deprecated formatting characters
  // eslint-disable-next-line no-misleading-character-class -- intentionally matching zero-width and invisible Unicode characters
  return str.replace(/[\u200B\u200C\u200D\uFEFF\u2060\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B\u180C\u180D\u180E\u2000-\u200F\u202A-\u202E\u2061-\u2064\u206A-\u206F]/g, "").trim();
}

/**
 * Check if a parsed result looks valid (not malformed AI output)
 */
function isValidParsedResult(result: { title: string; artist: string }, rawTitle: string): boolean {
  // Check for JSON syntax embedded in the values (malformed AI response)
  const jsonPattern = /[{}":].*[{}":]|"artist"|"title"/i;
  if (jsonPattern.test(result.title) || jsonPattern.test(result.artist)) {
    return false;
  }
  // Check if result is suspiciously different from input (possible hallucination)
  // Title should not be dramatically longer than the original
  if (result.title.length > rawTitle.length * 2) {
    return false;
  }
  return true;
}

/**
 * Use AI to parse a YouTube title into song title and artist.
 * Falls back to simple parsing if AI fails.
 */
async function parseYouTubeTitleWithAI(
  rawTitle: string,
  channelName?: string,
  requestId?: string
): Promise<{ title: string; artist: string }> {
  // Sanitize inputs to remove invisible characters that can break AI/JSON
  const cleanTitle = sanitizeInput(rawTitle);
  const cleanChannel = channelName ? sanitizeInput(channelName) : undefined;
  
  // If sanitization results in empty title, use fallback
  if (!cleanTitle) {
    if (requestId) {
      logInfo(requestId, "Title empty after sanitization, using fallback", { raw: rawTitle });
    }
    return parseYouTubeTitleSimple(rawTitle, channelName);
  }
  
  try {
    const { object: parsedData } = await generateObject({
      model: google("gemini-2.0-flash"),
      schema: z.object({
        title: z.string().optional().nullable(),
        artist: z.string().optional().nullable(),
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
    });

    const result = {
      title: parsedData.title || cleanTitle,
      artist: parsedData.artist || "",
    };
    
    // Validate the result doesn't contain malformed data
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
    if (requestId) {
      logError(requestId, "AI title parsing failed, using fallback", error);
    }
    // Fallback to simple parsing
    return parseYouTubeTitleSimple(rawTitle, channelName);
  }
}

/**
 * Simple regex-based title parser as fallback.
 * Handles common patterns like "Artist - Song", "Song | Artist", etc.
 */
function parseYouTubeTitleSimple(rawTitle: string, channelName?: string): { title: string; artist: string } {
  if (!rawTitle) {
    return { title: "", artist: "" };
  }

  // Clean common video markers
  let cleaned = rawTitle
    .replace(/\s*[[(【「『]?\s*(official\s*)?(music\s*)?(video|mv|m\/v|audio|lyric|lyrics|visualizer|live)\s*[\])】」』]?\s*/gi, " ")
    .replace(/\s*【[^】]*】\s*/g, " ")
    .replace(/\s*\[[^\]]*\]\s*/g, " ")
    .trim();

  // Remove parentheses content
  cleaned = stripParentheses(cleaned);

  // Try common delimiters
  const delimiterMatch = cleaned.match(/^(.+?)\s*[-–—|]\s*(.+)$/);
  if (delimiterMatch) {
    return {
      title: delimiterMatch[2].trim(),
      artist: delimiterMatch[1].trim(),
    };
  }

  // Try quoted patterns (K-pop style)
  const quotedMatch = cleaned.match(/^(.+?)\s*[「'"]([^」'"]+)[」'"]/);
  if (quotedMatch) {
    return {
      title: quotedMatch[2].trim(),
      artist: quotedMatch[1].trim(),
    };
  }

  // Use channel name as artist if available and not generic
  let artist = "";
  if (channelName) {
    const genericPatterns = /vevo|topic|official|music|records|entertainment|labels/i;
    if (!genericPatterns.test(channelName)) {
      artist = channelName.replace(/\s*-\s*Topic$/i, "").replace(/VEVO$/i, "").trim();
    }
  }

  return { title: cleaned, artist };
}

function normalizeForComparison(str: string): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function calculateSimilarity(query: string, target: string): number {
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

function scoreSongMatch(
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
// Kugou API Functions
// =============================================================================

async function getCover(hash: string, albumId: string | number): Promise<string> {
  try {
    const url = new URL("https://wwwapi.kugou.com/yy/index.php");
    url.searchParams.set("r", "play/getdata");
    url.searchParams.set("hash", hash);
    url.searchParams.set("dfid", randomString(23, "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"));
    url.searchParams.set("mid", randomString(23, "abcdefghijklmnopqrstuvwxyz0123456789"));
    url.searchParams.set("album_id", String(albumId));
    url.searchParams.set("_", String(Date.now()));

    const res = await fetchWithTimeout(url.toString(), { headers: kugouHeaders });
    if (!res.ok) return "";
    const json = (await res.json()) as { data?: { img?: string } };
    return json?.data?.img ?? "";
  } catch {
    // Return empty string on any error (network, timeout, parse, etc.)
    return "";
  }
}

type KugouSongInfo = {
  hash: string;
  album_id: string | number;
  songname: string;
  singername: string;
  album_name?: string;
};

type KugouSearchResponse = {
  data?: {
    info?: KugouSongInfo[];
  };
};

type LyricsCandidate = {
  id: number | string;
  accesskey: string;
};

type CandidateResponse = {
  candidates?: LyricsCandidate[];
};

type LyricsDownloadResponse = {
  content?: string;
};

async function searchKugou(
  query: string,
  title: string,
  artist: string
): Promise<Array<{ title: string; artist: string; album?: string; hash: string; albumId: string | number; score: number }>> {
  const keyword = encodeURIComponent(query);
  const searchUrl = `http://mobilecdn.kugou.com/api/v3/search/song?format=json&keyword=${keyword}&page=1&pagesize=20&showtype=1`;

  let searchRes: Response;
  try {
    searchRes = await fetchWithTimeout(searchUrl, { headers: kugouHeaders });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Kugou search timed out after 10 seconds");
    }
    throw new Error(`Kugou search network error: ${error instanceof Error ? error.message : "Unknown error"}`);
  }

  if (!searchRes.ok) {
    throw new Error(`Kugou search failed with status ${searchRes.status}`);
  }

  const searchJson = (await searchRes.json()) as unknown as KugouSearchResponse;
  const infoList: KugouSongInfo[] = searchJson?.data?.info ?? [];

  // Convert Kugou metadata from Simplified to Traditional Chinese
  const scoredResults = infoList.map((song) => ({
    title: simplifiedToTraditional(song.songname),
    artist: simplifiedToTraditional(song.singername),
    album: song.album_name ? simplifiedToTraditional(song.album_name) : undefined,
    hash: song.hash,
    albumId: song.album_id,
    score: Math.round(scoreSongMatch(song, title, artist) * 1000) / 1000,
  }));

  scoredResults.sort((a, b) => b.score - a.score);
  return scoredResults;
}

async function fetchLyricsFromKugou(
  source: LyricsSource,
  requestId: string
): Promise<LyricsContent | null> {
  const { hash, albumId } = source;

  // Get lyrics candidate
  const candidateUrl = `https://krcs.kugou.com/search?ver=1&man=yes&client=mobi&keyword=&duration=&hash=${hash}&album_audio_id=`;
  let candidateRes: Response;
  try {
    candidateRes = await fetchWithTimeout(candidateUrl, { headers: kugouHeaders });
  } catch (err) {
    logError(requestId, "Failed to fetch lyrics candidate (network/timeout)", err);
    return null;
  }

  if (!candidateRes.ok) {
    logError(requestId, "Failed to get lyrics candidate", candidateRes.status);
    return null;
  }

  let candidateJson: CandidateResponse;
  try {
    candidateJson = (await candidateRes.json()) as unknown as CandidateResponse;
  } catch (err) {
    logError(requestId, "Failed to parse lyrics candidate response", err);
    return null;
  }

  const candidate = candidateJson?.candidates?.[0];
  if (!candidate) {
    logError(requestId, "No lyrics candidate found", null);
    return null;
  }

  const lyricsId = candidate.id;
  const lyricsKey = candidate.accesskey;

  // Try KRC format first
  let lrc: string | undefined;
  let krc: string | undefined;

  const krcUrl = `http://lyrics.kugou.com/download?ver=1&client=pc&id=${lyricsId}&accesskey=${lyricsKey}&fmt=krc&charset=utf8`;
  try {
    const krcRes = await fetchWithTimeout(krcUrl, { headers: kugouHeaders });
    if (krcRes.ok) {
      const krcJson = (await krcRes.json()) as unknown as LyricsDownloadResponse;
      if (krcJson?.content) {
        try {
          krc = decodeKRC(krcJson.content);
          logInfo(requestId, "Successfully decoded KRC lyrics");
        } catch (decodeErr) {
          logInfo(requestId, "KRC decode failed", decodeErr);
        }
      }
    }
  } catch (err) {
    logInfo(requestId, "KRC fetch failed, trying LRC", err);
  }

  // Fetch LRC format
  const lrcUrl = `http://lyrics.kugou.com/download?ver=1&client=pc&id=${lyricsId}&accesskey=${lyricsKey}&fmt=lrc&charset=utf8`;
  try {
    const lrcRes = await fetchWithTimeout(lrcUrl, { headers: kugouHeaders });
    if (lrcRes.ok) {
      const lrcJson = (await lrcRes.json()) as unknown as LyricsDownloadResponse;
      if (lrcJson?.content) {
        try {
          lrc = base64ToUtf8(lrcJson.content);
        } catch (decodeErr) {
          logInfo(requestId, "LRC base64 decode failed", decodeErr);
        }
      }
    }
  } catch (err) {
    logInfo(requestId, "LRC fetch failed", err);
  }

  if (!lrc && !krc) {
    return null;
  }

  // Fetch cover image
  const cover = await getCover(hash, albumId);

  return {
    lrc: lrc || krc || "",
    krc,
    cover,
  };
}

// =============================================================================
// Translation Functions
// =============================================================================

interface LyricLine {
  words: string;
  startTimeMs: string;
}

/**
 * Prefixes to skip when parsing lyrics (credits, production info, etc.)
 * Must match client-side parser (krcParser.ts) for consistent line counts
 */
const SKIP_PREFIXES = [
  "作词", "作曲", "编曲", "制作", "发行", "出品", "监制", "策划", "统筹",
  "录音", "混音", "母带", "和声", "合声", "合声编写", "版权", "吉他", "贝斯", "鼓", "键盘",
  "企划", "词：", "詞：", "词曲：", "詞曲：", "曲", "男：", "女：", "合：", "OP", "SP", "TME享有",
  "Produced", "Composed", "Arranged", "Mixed", "Lyrics", "Keyboard",
  "Guitar", "Bass", "Drum", "Vocal", "Original Publisher", "Sub-publisher",
  "Electric Piano", "Synth by", "Recorded by", "Mixed by", "Mastered by",
  "Produced by", "Composed by", "Digital Editing by", "Mix Assisted by",
  "Mix by", "Mix Engineer", "Background vocals", "Background vocals by",
  "Chorus by", "Percussion by", "String by", "Harp by", "Piano by",
  "Piano Arranged by", "Written by", "Additional Production by",
  "Synthesizer", "Programming", "Background Vocals", "Recording Engineer",
  "Digital Editing",
] as const;

/**
 * Check if a line should be skipped (credits, metadata, etc.)
 * @param title - Song title (optional, used to skip "title - artist" lines)
 * @param artist - Song artist (optional, used to skip "title - artist" lines)
 */
function shouldSkipLine(text: string, title?: string, artist?: string): boolean {
  const trimmed = text.trim();
  
  // Skip lines matching any skip prefix
  if (SKIP_PREFIXES.some((prefix) => trimmed.startsWith(prefix))) {
    return true;
  }
  
  // Skip lines entirely wrapped in parentheses (e.g., "(instrumental)")
  if (
    (trimmed.startsWith("(") && trimmed.endsWith(")")) ||
    (trimmed.startsWith("（") && trimmed.endsWith("）"))
  ) {
    return true;
  }
  
  // Skip title-artist lines (must match client-side krcParser.ts behavior)
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

function parseLrcToLines(lrc: string, title?: string, artist?: string): LyricLine[] {
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
      // Skip empty lines and metadata/credits
      if (words && !shouldSkipLine(words, title, artist)) {
        lines.push({ words, startTimeMs });
      }
    }
  }

  return lines;
}

/**
 * Parse KRC format with word-level timing
 * Returns ParsedLyricLine[] with wordTimings populated
 */
function parseKrcToLines(krc: string, title?: string, artist?: string): ParsedLyricLine[] {
  const lines: ParsedLyricLine[] = [];
  const lineHeaderRegex = /^\[(\d+),(\d+)\](.*)$/;
  const wordTimingRegex = /<(\d+),(\d+),\d+>((?:[^<]|<(?!\d))*)/g;

  // Normalize line endings
  const normalizedText = krc.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (const line of normalizedText.split("\n")) {
    const lineMatch = line.match(lineHeaderRegex);
    if (!lineMatch) continue;

    const [, startMs, , content] = lineMatch;
    
    // Extract word timings
    const wordTimings: WordTiming[] = [];
    let fullText = "";
    let match;

    // Reset regex lastIndex
    wordTimingRegex.lastIndex = 0;

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

    // If no word timings found, try plain text
    if (wordTimings.length === 0) {
      const plainText = content.replace(/<\d+,\d+,\d+>/g, "").trim();
      if (plainText) {
        fullText = plainText;
      }
    }

    const trimmedText = fullText.trim();

    // Skip lines based on filtering rules
    if (shouldSkipLine(trimmedText, title, artist)) {
      continue;
    }

    // Skip empty lines
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
function isKrcFormat(text: string): boolean {
  // KRC word timing pattern: <number,number,number>text
  const krcWordTimingPattern = /<\d+,\d+,\d+>/;
  // KRC line format: [startMs,durationMs]
  const krcLinePattern = /^\[\d+,\d+\]/m;
  
  return krcWordTimingPattern.test(text) || krcLinePattern.test(text);
}

/**
 * Unified parsing function - parses KRC or LRC with consistent filtering
 * This is the single source of truth for lyrics parsing on the server
 */
function parseLyricsContent(
  lyrics: { lrc?: string; krc?: string },
  title?: string,
  artist?: string
): ParsedLyricLine[] {
  // Prefer KRC for word-level timing
  if (lyrics.krc && isKrcFormat(lyrics.krc)) {
    const parsed = parseKrcToLines(lyrics.krc, title, artist);
    if (parsed.length > 0) {
      return parsed;
    }
  }
  
  // Fallback to LRC
  if (lyrics.lrc) {
    const lrcLines = parseLrcToLines(lyrics.lrc, title, artist);
    // Convert LyricLine to ParsedLyricLine (no word timings)
    return lrcLines.map(line => ({
      startTimeMs: line.startTimeMs,
      words: line.words,
    }));
  }
  
  return [];
}

function msToLrcTime(msStr: string): string {
  const ms = parseInt(msStr, 10);
  if (isNaN(ms)) return "[00:00.00]";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const centiseconds = Math.floor((ms % 1000) / 10);
  return `[${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}]`;
}

async function translateChunk(
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

    // Validate array length matches
    if (aiResponse.translatedTexts.length !== chunk.length) {
      logInfo(requestId, `Warning: Translation response length mismatch - expected ${chunk.length}, got ${aiResponse.translatedTexts.length}`);
    }

    return chunk.map((line, index) => aiResponse.translatedTexts[index] || line.words);
  } catch (error) {
    logError(requestId, `Translation chunk failed, returning original text as fallback`, error);
    // Return original text for each line as fallback
    return chunk.map((line) => line.words);
  }
}

// =============================================================================
// Soramimi Functions (Chinese Misheard Lyrics / 空耳)
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
- Include spaces/punctuation in the text segments to preserve the original

Example input: ["Sorry, sorry", "I'm so sorry"]
Example output:
{
  "annotatedLines": [
    [{"text": "So", "reading": "搜"}, {"text": "rry, ", "reading": "哩"}, {"text": "so", "reading": "搜"}, {"text": "rry", "reading": "哩"}],
    [{"text": "I'm ", "reading": "愛"}, {"text": "so ", "reading": "搜"}, {"text": "so", "reading": "搜"}, {"text": "rry", "reading": "哩"}]
  ]
}`;

async function generateSoramimiForChunk(
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
      temperature: 0.7, // Higher temperature for more creative results
    });

    // Validate array length matches
    if (aiResponse.annotatedLines.length !== lines.length) {
      logInfo(requestId, `Warning: Soramimi response length mismatch - expected ${lines.length}, got ${aiResponse.annotatedLines.length}`);
    }

    // Map results back to all lines
    return lines.map((line, index) => {
      return aiResponse.annotatedLines[index] || [{ text: line.words }];
    });
  } catch (error) {
    logError(requestId, `Soramimi chunk failed, returning plain text segments as fallback`, error);
    // Return plain text segments without readings as fallback
    return lines.map((line) => [{ text: line.words }]);
  }
}

// =============================================================================
// Furigana Functions
// =============================================================================

function containsKanji(text: string): boolean {
  return /[\u4E00-\u9FFF]/.test(text);
}

/**
 * Check if text contains Japanese kana (Hiragana or Katakana)
 */
function containsKana(text: string): boolean {
  return /[\u3040-\u309F\u30A0-\u30FF]/.test(text);
}

/**
 * Check if text is Chinese (has CJK ideographs but no Japanese kana)
 * This distinguishes Chinese from Japanese (which has both Kanji and Kana)
 */
function isChineseText(text: string): boolean {
  return containsKanji(text) && !containsKana(text);
}

/**
 * Check if lyrics are mostly Chinese text
 * Returns true if majority of lines with CJK characters are Chinese (not Japanese)
 * Used to skip soramimi generation for Chinese lyrics (空耳 doesn't make sense for Chinese)
 */
function lyricsAreMostlyChinese(lines: { words: string }[]): boolean {
  if (!lines || lines.length === 0) return false;
  
  // Count lines with CJK that are Chinese vs Japanese
  let chineseLineCount = 0;
  let cjkLineCount = 0;
  
  for (const line of lines) {
    const text = line.words;
    if (!containsKanji(text)) continue; // Skip lines without CJK
    
    cjkLineCount++;
    if (isChineseText(text)) {
      chineseLineCount++;
    }
  }
  
  // If no CJK lines at all, not Chinese
  if (cjkLineCount === 0) return false;
  
  // Consider "mostly Chinese" if >70% of CJK lines are Chinese
  return chineseLineCount / cjkLineCount > 0.7;
}

const FURIGANA_SYSTEM_PROMPT = `You are an expert in Japanese language. You will be given a JSON array of Japanese text strings (song lyrics).
Your task is to add furigana (reading annotations) to kanji characters in each line.

For each line, return an array of segments where:
- Each segment has a "text" field containing the original text portion
- Segments with kanji should have a "reading" field with the hiragana reading
- Segments without kanji (hiragana, katakana, punctuation, spaces) should NOT have a reading field

CRITICAL: Separate kanji from trailing hiragana (okurigana)
- The "text" field with a "reading" must contain ONLY kanji characters
- Trailing hiragana (okurigana) must be in a SEPARATE segment WITHOUT a reading
- The reading should cover ONLY the kanji, not include the okurigana

Example input: ["夜空の星", "私は走る"]
Example output:
{
  "annotatedLines": [
    [{"text": "夜空", "reading": "よぞら"}, {"text": "の"}, {"text": "星", "reading": "ほし"}],
    [{"text": "私", "reading": "わたし"}, {"text": "は"}, {"text": "走", "reading": "はし"}, {"text": "る"}]
  ]
}

Important rules:
- Only add readings to kanji characters
- ALWAYS separate trailing hiragana (okurigana) into their own segments without readings
- Keep the original text exactly as provided
- Use standard hiragana readings
- For song lyrics, use common/natural readings`;

async function generateFuriganaForChunk(
  lines: LyricLine[],
  requestId: string
): Promise<FuriganaSegment[][]> {
  // Filter lines that need furigana
  const linesNeedingFurigana = lines.filter((line) => containsKanji(line.words));
  
  if (linesNeedingFurigana.length === 0) {
    return lines.map((line) => [{ text: line.words }]);
  }

  const textsToProcess = linesNeedingFurigana.map((line) => line.words);

  try {
    const { object: aiResponse } = await generateObject({
      model: google("gemini-2.5-flash"),
      schema: AiFuriganaResponseSchema,
      messages: [
        { role: "system", content: FURIGANA_SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(textsToProcess) },
      ],
      temperature: 0.1,
    });

    // Validate array length matches
    if (aiResponse.annotatedLines.length !== linesNeedingFurigana.length) {
      logInfo(requestId, `Warning: Furigana response length mismatch - expected ${linesNeedingFurigana.length}, got ${aiResponse.annotatedLines.length}`);
    }

    // Map results back to all lines
    let furiganaIndex = 0;
    return lines.map((line) => {
      if (containsKanji(line.words)) {
        return aiResponse.annotatedLines[furiganaIndex++] || [{ text: line.words }];
      }
      return [{ text: line.words }];
    });
  } catch (error) {
    logError(requestId, `Furigana chunk failed, returning plain text segments as fallback`, error);
    // Return plain text segments without readings as fallback
    return lines.map((line) => [{ text: line.words }]);
  }
}

// =============================================================================
// Main Handler
// =============================================================================

export default async function handler(req: Request) {
  const requestId = generateRequestId();
  const startTime = Date.now();

  // Extract song ID from URL
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/");
  const songId = pathParts[pathParts.length - 1];

  console.log(`[${requestId}] ${req.method} /api/song/${songId}`);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    const effectiveOrigin = getEffectiveOrigin(req);
    const resp = preflightIfNeeded(req, ["GET", "POST", "DELETE", "OPTIONS"], effectiveOrigin);
    if (resp) return resp;
  }

  // Validate origin
  const effectiveOrigin = getEffectiveOrigin(req);

  // Helper for JSON responses (defined early for use in origin validation)
  const jsonResponse = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(data), {
      status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": effectiveOrigin!,
        ...headers,
      },
    });

  const errorResponse = (message: string, status = 400) => {
    logInfo(requestId, `Response: ${status} - ${message}`);
    return jsonResponse({ error: message }, status);
  };

  if (!isAllowedOrigin(effectiveOrigin)) {
    return errorResponse("Unauthorized", 403);
  }

  // Create Redis client
  const redis = new Redis({
    url: process.env.REDIS_KV_REST_API_URL as string,
    token: process.env.REDIS_KV_REST_API_TOKEN as string,
  });

  if (!songId || songId === "[id]") {
    return errorResponse("Song ID is required", 400);
  }

  // Validate YouTube video ID format
  if (!isValidYouTubeVideoId(songId)) {
    return errorResponse("Invalid song ID format. Expected YouTube video ID (11 characters, alphanumeric with - and _)", 400);
  }

  try {
    // =========================================================================
    // GET: Retrieve song data
    // =========================================================================
    if (req.method === "GET") {
      const includeParam = url.searchParams.get("include") || "metadata";
      const includes = includeParam.split(",").map((s) => s.trim());

      logInfo(requestId, "GET song", { songId, includes });

      // Fetch song with requested includes
      const song = await getSong(redis, songId, {
        includeMetadata: includes.includes("metadata"),
        includeLyrics: includes.includes("lyrics"),
        includeTranslations: includes.includes("translations"),
        includeFurigana: includes.includes("furigana"),
      });

      if (!song) {
        return errorResponse("Song not found", 404);
      }

      // Ensure parsedLines exist (generate for legacy data)
      if (song.lyrics && !song.lyrics.parsedLines) {
        logInfo(requestId, "Generating parsedLines for legacy data");
        song.lyrics.parsedLines = parseLyricsContent(
          { lrc: song.lyrics.lrc, krc: song.lyrics.krc },
          song.title,
          song.artist
        );
        // Save updated lyrics with parsedLines
        await saveLyrics(redis, songId, song.lyrics, song.lyricsSource);
      }

      logInfo(requestId, `Response: 200 OK`, { 
        hasLyrics: !!song.lyrics,
        hasTranslations: !!song.translations,
        hasFurigana: !!song.furigana,
        duration: `${Date.now() - startTime}ms` 
      });
      return jsonResponse(song);
    }

    // =========================================================================
    // POST: Update song or perform action
    // =========================================================================
    if (req.method === "POST") {
      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch (parseError) {
        logError(requestId, "Failed to parse request body", parseError);
        return errorResponse("Invalid JSON body", 400);
      }
      const action = body.action;
      logInfo(requestId, `POST action=${action || "update-metadata"}`, {
        hasLyricsSource: !!body.lyricsSource,
        language: body.language,
        force: body.force,
        query: body.query,
      });

      // Extract auth credentials
      const authHeader = req.headers.get("Authorization");
      const usernameHeader = req.headers.get("X-Username");
      const authToken = authHeader?.replace("Bearer ", "") || null;
      const username = usernameHeader || null;

      // Handle search-lyrics action (no auth required)
      if (action === "search-lyrics") {
        const parsed = SearchLyricsSchema.safeParse(body);
        if (!parsed.success) {
          return errorResponse("Invalid request body");
        }

        // Get song for title/artist context
        const song = await getSong(redis, songId, { includeMetadata: true });
        const rawTitle = song?.title || "";
        const rawArtist = song?.artist || "";
        
        let query = parsed.data.query;
        let searchTitle = rawTitle;
        let searchArtist = rawArtist;
        
        // If no custom query provided, build search query
        if (!query && rawTitle) {
          // Only use AI parsing if we don't have a proper artist (new video without metadata)
          // If artist exists, title/artist are already clean metadata - use them directly
          if (!rawArtist) {
            const aiParsed = await parseYouTubeTitleWithAI(rawTitle, rawArtist, requestId);
            searchTitle = aiParsed.title || rawTitle;
            searchArtist = aiParsed.artist || rawArtist;
            logInfo(requestId, "AI-parsed search query (no artist)", { original: rawTitle, parsed: { title: searchTitle, artist: searchArtist } });
          }
          query = `${stripParentheses(searchTitle)} ${stripParentheses(searchArtist)}`.trim();
        } else if (!query) {
          query = `${stripParentheses(rawTitle)} ${stripParentheses(rawArtist)}`.trim();
        }

        if (!query) {
          return errorResponse("Search query is required");
        }

        logInfo(requestId, "Searching lyrics", { query });
        const results = await searchKugou(query, searchTitle, searchArtist);
        logInfo(requestId, `Response: 200 OK - Found ${results.length} results`);
        return jsonResponse({ results });
      }

      // Handle fetch-lyrics action (no auth required)
      if (action === "fetch-lyrics") {
        const parsed = FetchLyricsSchema.safeParse(body);
        if (!parsed.success) {
          return errorResponse("Invalid request body");
        }

        const force = parsed.data.force || false;
        let lyricsSource: LyricsSource | undefined = parsed.data.lyricsSource as LyricsSource | undefined;
        
        // Client can pass title/artist directly (useful when song not in Redis yet)
        const clientTitle = parsed.data.title;
        const clientArtist = parsed.data.artist;
        
        // Optional: include translation/furigana/soramimi info to reduce round-trips
        const translateTo = parsed.data.translateTo;
        const includeFurigana = parsed.data.includeFurigana;
        const includeSoramimi = parsed.data.includeSoramimi;

        // Get existing song (include translations/furigana/soramimi if requested)
        const song = await getSong(redis, songId, {
          includeMetadata: true,
          includeLyrics: true,
          includeTranslations: translateTo ? [translateTo] : undefined,
          includeFurigana: includeFurigana,
          includeSoramimi: includeSoramimi,
        });

        // Use provided source or existing source
        if (!lyricsSource && song?.lyricsSource) {
          lyricsSource = song.lyricsSource;
        }

        // If we have cached lyrics and not forcing, return them
        if (!force && song?.lyrics?.lrc) {
          logInfo(requestId, `Response: 200 OK - Returning cached lyrics`, {
            parsedLinesCount: song.lyrics.parsedLines?.length ?? 0,
          });
          
          // Build response with optional translation/furigana info
          const response: Record<string, unknown> = {
            lyrics: { parsedLines: song.lyrics.parsedLines },
            cached: true,
          };
          
          // Include translation info if requested
          if (translateTo && song.lyrics.parsedLines) {
            const totalLines = song.lyrics.parsedLines.length;
            const totalChunks = Math.ceil(totalLines / CHUNK_SIZE);
            let hasTranslation = !!(song.translations?.[translateTo]);
            let translationLrc = hasTranslation ? song.translations![translateTo] : undefined;
            
            // For Chinese Traditional: use KRC source directly if available (skip AI)
            if (!hasTranslation && isChineseTraditional(translateTo) && song.lyrics.krc) {
              const krcDerivedLrc = buildChineseTranslationFromKrc(
                song.lyrics,
                song.lyricsSource?.title || song.title,
                song.lyricsSource?.artist || song.artist
              );
              if (krcDerivedLrc) {
                hasTranslation = true;
                translationLrc = krcDerivedLrc;
                logInfo(requestId, "Using KRC-derived Traditional Chinese translation (skipping AI)");
                // Save this translation for future requests
                await saveTranslation(redis, songId, translateTo, krcDerivedLrc);
              }
            }
            
            response.translation = {
              totalLines,
              totalChunks,
              chunkSize: CHUNK_SIZE,
              cached: hasTranslation,
              ...(translationLrc ? { lrc: translationLrc } : {}),
            };
          }
          
          // Include furigana info if requested
          if (includeFurigana && song.lyrics.parsedLines) {
            const totalLines = song.lyrics.parsedLines.length;
            const totalChunks = Math.ceil(totalLines / CHUNK_SIZE);
            const hasFurigana = !!(song.furigana && song.furigana.length > 0);
            response.furigana = {
              totalLines,
              totalChunks,
              chunkSize: CHUNK_SIZE,
              cached: hasFurigana,
              ...(hasFurigana ? { data: song.furigana } : {}),
            };
          }
          
          // Include soramimi info if requested
          if (includeSoramimi && song.lyrics.parsedLines) {
            const totalLines = song.lyrics.parsedLines.length;
            const totalChunks = Math.ceil(totalLines / CHUNK_SIZE);
            const hasSoramimi = !!(song.soramimi && song.soramimi.length > 0);
            response.soramimi = {
              totalLines,
              totalChunks,
              chunkSize: CHUNK_SIZE,
              cached: hasSoramimi,
              ...(hasSoramimi ? { data: song.soramimi } : {}),
            };
          }
          
          return jsonResponse(response);
        }

        // Determine title/artist for auto-search
        // Priority: song from Redis > client-provided > empty
        const rawTitle = song?.title || clientTitle || "";
        const rawArtist = song?.artist || clientArtist || "";

        // If no source, try auto-search
        if (!lyricsSource && rawTitle) {
          let searchTitle = rawTitle;
          let searchArtist = rawArtist;
          
          // Only use AI parsing if we don't have a proper artist (new video without metadata)
          // If artist exists, title/artist are already clean metadata - use them directly
          if (!rawArtist) {
            const aiParsed = await parseYouTubeTitleWithAI(rawTitle, rawArtist, requestId);
            searchTitle = aiParsed.title || rawTitle;
            searchArtist = aiParsed.artist || rawArtist;
            logInfo(requestId, "Auto-searching lyrics with AI-parsed title (no artist)", { 
              original: { title: rawTitle, artist: rawArtist },
              parsed: { title: searchTitle, artist: searchArtist }
            });
          } else {
            logInfo(requestId, "Auto-searching lyrics with existing metadata", { 
              title: searchTitle, artist: searchArtist
            });
          }
          
          const query = `${stripParentheses(searchTitle)} ${stripParentheses(searchArtist)}`.trim();
          const results = await searchKugou(query, searchTitle, searchArtist);
          if (results.length > 0) {
            lyricsSource = {
              hash: results[0].hash,
              albumId: results[0].albumId,
              title: results[0].title,
              artist: results[0].artist,
              album: results[0].album,
            };
          }
        }

        if (!lyricsSource) {
          return errorResponse("No lyrics source available");
        }

        logInfo(requestId, "Fetching lyrics from Kugou", { source: lyricsSource });
        const rawLyrics = await fetchLyricsFromKugou(lyricsSource, requestId);

        if (!rawLyrics) {
          return errorResponse("Failed to fetch lyrics", 404);
        }

        // Parse lyrics with consistent filtering (single source of truth)
        const parsedLines = parseLyricsContent(
          { lrc: rawLyrics.lrc, krc: rawLyrics.krc },
          lyricsSource.title,
          lyricsSource.artist
        );

        // Include parsedLines in the lyrics content
        const lyrics: LyricsContent = {
          ...rawLyrics,
          parsedLines,
        };

        // Save to song document (full lyrics with lrc/krc for internal use)
        const savedSong = await saveLyrics(redis, songId, lyrics, lyricsSource);
        logInfo(requestId, `Lyrics saved to song document`, { 
          songId,
          hasLyricsStored: !!savedSong.lyrics,
          parsedLinesCount: parsedLines.length,
        });

        logInfo(requestId, `Response: 200 OK - Lyrics fetched`, { parsedLinesCount: parsedLines.length });
        
        // Build response with optional translation/furigana chunk info
        const response: Record<string, unknown> = {
          lyrics: { parsedLines },
          cached: false,
        };
        
        // Include translation chunk info if requested
        if (translateTo) {
          const totalLines = parsedLines.length;
          const totalChunks = Math.ceil(totalLines / CHUNK_SIZE);
          let hasTranslation = false;
          let translationLrc: string | undefined;
          
          // For Chinese Traditional: use KRC source directly if available (skip AI)
          if (isChineseTraditional(translateTo) && lyrics.krc) {
            const krcDerivedLrc = buildChineseTranslationFromKrc(
              lyrics,
              lyricsSource.title,
              lyricsSource.artist
            );
            if (krcDerivedLrc) {
              hasTranslation = true;
              translationLrc = krcDerivedLrc;
              logInfo(requestId, "Using KRC-derived Traditional Chinese translation for fresh lyrics (skipping AI)");
              // Save this translation for future requests
              await saveTranslation(redis, songId, translateTo, krcDerivedLrc);
            }
          }
          
          response.translation = {
            totalLines,
            totalChunks,
            chunkSize: CHUNK_SIZE,
            cached: hasTranslation,
            ...(translationLrc ? { lrc: translationLrc } : {}),
          };
        }
        
        // Include furigana chunk info if requested (not cached since lyrics are fresh)
        if (includeFurigana) {
          const totalLines = parsedLines.length;
          const totalChunks = Math.ceil(totalLines / CHUNK_SIZE);
          response.furigana = {
            totalLines,
            totalChunks,
            chunkSize: CHUNK_SIZE,
            cached: false,
          };
        }
        
        // Include soramimi chunk info if requested (not cached since lyrics are fresh)
        if (includeSoramimi) {
          const totalLines = parsedLines.length;
          const totalChunks = Math.ceil(totalLines / CHUNK_SIZE);
          response.soramimi = {
            totalLines,
            totalChunks,
            chunkSize: CHUNK_SIZE,
            cached: false,
          };
        }
        
        return jsonResponse(response);
      }

      // =======================================================================
      // Handle get-chunk-info action - returns chunk metadata for client
      // =======================================================================
      if (action === "get-chunk-info") {
        const parsed = GetChunkInfoSchema.safeParse(body);
        if (!parsed.success) {
          return errorResponse("Invalid request body");
        }

        const { operation, language, force } = parsed.data;

        // Get song with lyrics
        const song = await getSong(redis, songId, {
          includeMetadata: true,
          includeLyrics: true,
          includeTranslations: language ? [language] : undefined,
          includeFurigana: operation === "furigana",
          includeSoramimi: operation === "soramimi",
        });

        if (!song?.lyrics?.lrc) {
          return errorResponse("Song has no lyrics", 404);
        }

        // Ensure parsedLines exist
        if (!song.lyrics.parsedLines || song.lyrics.parsedLines.length === 0) {
          song.lyrics.parsedLines = parseLyricsContent(
            { lrc: song.lyrics.lrc, krc: song.lyrics.krc },
            song.title,
            song.artist
          );
          await saveLyrics(redis, songId, song.lyrics, song.lyricsSource);
        }

        const totalLines = song.lyrics.parsedLines.length;
        const totalChunks = Math.ceil(totalLines / CHUNK_SIZE);

        // For soramimi: skip if lyrics are mostly Chinese (空耳 doesn't make sense for Chinese lyrics)
        if (operation === "soramimi" && lyricsAreMostlyChinese(song.lyrics.parsedLines)) {
          logInfo(requestId, "Skipping soramimi generation - lyrics are mostly Chinese");
          return jsonResponse({
            totalLines,
            totalChunks: 0,
            chunkSize: CHUNK_SIZE,
            cached: false,
            skipped: true,
            skipReason: "chinese_lyrics",
          });
        }

        // Check if already cached (must have actual data, not just empty arrays/objects)
        // Skip cache check if force=true (user wants to regenerate)
        let cached = false;
        let krcDerivedTranslation: string | undefined;
        
        if (!force) {
          if (operation === "translate" && language && song.translations?.[language]) {
            cached = true;
          } else if (operation === "furigana" && song.furigana && song.furigana.length > 0) {
            cached = true;
          } else if (operation === "soramimi" && song.soramimi && song.soramimi.length > 0) {
            cached = true;
          }
        }
        
        // For Chinese Traditional: use KRC source directly if available (skip AI)
        if (!cached && operation === "translate" && language && isChineseTraditional(language) && song.lyrics?.krc) {
          const krcDerivedLrc = buildChineseTranslationFromKrc(
            song.lyrics,
            song.lyricsSource?.title || song.title,
            song.lyricsSource?.artist || song.artist
          );
          if (krcDerivedLrc) {
            cached = true;
            krcDerivedTranslation = krcDerivedLrc;
            logInfo(requestId, "Using KRC-derived Traditional Chinese translation in chunk-info (skipping AI)");
            // Save this translation for future requests
            await saveTranslation(redis, songId, language, krcDerivedLrc);
          }
        }

        // If not cached and has chunks, process chunk 0 inline to eliminate one round-trip
        let initialChunk: {
          chunkIndex: number;
          startIndex: number;
          translations?: string[];
          furigana?: FuriganaSegment[][];
          soramimi?: FuriganaSegment[][];
          cached: boolean;
        } | undefined;

        if (!cached && totalChunks > 0) {
          const startIndex = 0;
          const endIndex = Math.min(CHUNK_SIZE, totalLines);
          const chunkLines = song.lyrics!.parsedLines!.slice(startIndex, endIndex);

          if (operation === "translate" && language) {
            // Convert to LyricLine format and translate
            const lines: LyricLine[] = chunkLines.map(line => ({ words: line.words, startTimeMs: line.startTimeMs }));
            const translations = await translateChunk(lines, language, requestId);

            // Cache chunk 0
            const lyricsHash = song.lyricsSource?.hash;
            const chunkCacheKey = lyricsHash
              ? `song:${songId}:translate:${language}:chunk:0:${lyricsHash}`
              : `song:${songId}:translate:${language}:chunk:0`;
            await redis.set(chunkCacheKey, translations, { ex: 60 * 60 * 24 * 30 });

            initialChunk = { chunkIndex: 0, startIndex: 0, translations, cached: false };
            logInfo(requestId, `Chunk info: ${operation} - processed chunk 0 inline`, { totalLines, totalChunks });
          } else if (operation === "furigana") {
            const lines: LyricLine[] = chunkLines.map(line => ({ words: line.words, startTimeMs: line.startTimeMs }));
            const furigana = await generateFuriganaForChunk(lines, requestId);

            const lyricsHash = song.lyricsSource?.hash;
            const chunkCacheKey = lyricsHash
              ? `song:${songId}:furigana:chunk:0:${lyricsHash}`
              : `song:${songId}:furigana:chunk:0`;
            await redis.set(chunkCacheKey, furigana, { ex: 60 * 60 * 24 * 30 });

            initialChunk = { chunkIndex: 0, startIndex: 0, furigana, cached: false };
            logInfo(requestId, `Chunk info: ${operation} - processed chunk 0 inline`, { totalLines, totalChunks });
          } else if (operation === "soramimi") {
            const lines: LyricLine[] = chunkLines.map(line => ({ words: line.words, startTimeMs: line.startTimeMs }));
            const soramimi = await generateSoramimiForChunk(lines, requestId);

            const lyricsHash = song.lyricsSource?.hash;
            const chunkCacheKey = lyricsHash
              ? `song:${songId}:soramimi:chunk:0:${lyricsHash}`
              : `song:${songId}:soramimi:chunk:0`;
            await redis.set(chunkCacheKey, soramimi, { ex: 60 * 60 * 24 * 30 });

            initialChunk = { chunkIndex: 0, startIndex: 0, soramimi, cached: false };
            logInfo(requestId, `Chunk info: ${operation} - processed chunk 0 inline`, { totalLines, totalChunks });
          }
        } else {
          logInfo(requestId, `Chunk info: ${operation}`, { totalLines, totalChunks, cached });
        }

        return jsonResponse({
          totalLines,
          totalChunks,
          chunkSize: CHUNK_SIZE,
          cached,
          // If cached, return the full result
          ...(cached && operation === "translate" && language && (krcDerivedTranslation || song.translations?.[language])
            ? { translation: krcDerivedTranslation || song.translations![language] }
            : {}),
          ...(cached && operation === "furigana" && song.furigana && song.furigana.length > 0 
            ? { furigana: song.furigana } 
            : {}),
          ...(cached && operation === "soramimi" && song.soramimi && song.soramimi.length > 0 
            ? { soramimi: song.soramimi } 
            : {}),
          // Include first chunk if not cached (eliminates one round-trip)
          ...(initialChunk ? { initialChunk } : {}),
        });
      }

      // =======================================================================
      // Handle translate-chunk action - processes a single chunk
      // =======================================================================
      if (action === "translate-chunk") {
        const parsed = TranslateChunkSchema.safeParse(body);
        if (!parsed.success) {
          return errorResponse("Invalid request body");
        }

        const { language, chunkIndex, force } = parsed.data;

        // Get song with lyrics
        const song = await getSong(redis, songId, {
          includeMetadata: true,
          includeLyrics: true,
        });

        if (!song?.lyrics?.lrc) {
          return errorResponse("Song has no lyrics to translate", 404);
        }

        // Ensure parsedLines exist
        if (!song.lyrics.parsedLines || song.lyrics.parsedLines.length === 0) {
          song.lyrics.parsedLines = parseLyricsContent(
            { lrc: song.lyrics.lrc, krc: song.lyrics.krc },
            song.title,
            song.artist
          );
          await saveLyrics(redis, songId, song.lyrics, song.lyricsSource);
        }

        const totalLines = song.lyrics.parsedLines.length;
        const totalChunks = Math.ceil(totalLines / CHUNK_SIZE);

        if (chunkIndex < 0 || chunkIndex >= totalChunks) {
          return errorResponse(`Invalid chunk index: ${chunkIndex}. Valid range: 0-${totalChunks - 1}`);
        }

        // Extract chunk
        const startIndex = chunkIndex * CHUNK_SIZE;
        const endIndex = Math.min(startIndex + CHUNK_SIZE, totalLines);
        const chunkLines = song.lyrics.parsedLines.slice(startIndex, endIndex);

        // Check chunk cache (include lyrics hash to invalidate when source changes)
        const lyricsHash = song.lyricsSource?.hash;
        const chunkCacheKey = lyricsHash
          ? `song:${songId}:translate:${language}:chunk:${chunkIndex}:${lyricsHash}`
          : `song:${songId}:translate:${language}:chunk:${chunkIndex}`;
        if (!force) {
          try {
            const cachedChunk = await redis.get(chunkCacheKey) as string[] | null;
            if (cachedChunk) {
              logInfo(requestId, `Translate chunk ${chunkIndex + 1}/${totalChunks} - cache HIT`);
              return jsonResponse({
                chunkIndex,
                totalChunks,
                startIndex,
                translations: cachedChunk,
                cached: true,
              });
            }
          } catch (e) {
            logError(requestId, "Chunk cache lookup failed", e);
          }
        }

        // Convert to LyricLine format
        const lines: LyricLine[] = chunkLines.map(line => ({
          words: line.words,
          startTimeMs: line.startTimeMs,
        }));

        let translations: string[];
        
        // For Chinese Traditional: use KRC source directly if available (skip AI)
        if (isChineseTraditional(language) && song.lyrics?.krc) {
          logInfo(requestId, `Using KRC-derived Traditional Chinese for chunk ${chunkIndex + 1}/${totalChunks} (${lines.length} lines)`);
          // Convert each line's text from Simplified to Traditional Chinese
          translations = lines.map(line => simplifiedToTraditional(line.words));
        } else {
          logInfo(requestId, `Translating chunk ${chunkIndex + 1}/${totalChunks} (${lines.length} lines)`);
          translations = await translateChunk(lines, language, requestId);
        }

        // Cache the chunk result (30 days)
        try {
          await redis.set(chunkCacheKey, translations, { ex: 60 * 60 * 24 * 30 });
        } catch (e) {
          logError(requestId, "Chunk cache write failed", e);
        }

        logInfo(requestId, `Translate chunk ${chunkIndex + 1}/${totalChunks} - completed`);
        return jsonResponse({
          chunkIndex,
          totalChunks,
          startIndex,
          translations,
          cached: false,
        });
      }

      // =======================================================================
      // Handle furigana-chunk action - processes a single chunk
      // =======================================================================
      if (action === "furigana-chunk") {
        const parsed = FuriganaChunkSchema.safeParse(body);
        if (!parsed.success) {
          return errorResponse("Invalid request body");
        }

        const { chunkIndex, force } = parsed.data;

        // Get song with lyrics
        const song = await getSong(redis, songId, {
          includeMetadata: true,
          includeLyrics: true,
        });

        if (!song?.lyrics?.lrc) {
          return errorResponse("Song has no lyrics", 404);
        }

        // Ensure parsedLines exist
        if (!song.lyrics.parsedLines || song.lyrics.parsedLines.length === 0) {
          song.lyrics.parsedLines = parseLyricsContent(
            { lrc: song.lyrics.lrc, krc: song.lyrics.krc },
            song.title,
            song.artist
          );
          await saveLyrics(redis, songId, song.lyrics, song.lyricsSource);
        }

        const totalLines = song.lyrics.parsedLines.length;
        const totalChunks = Math.ceil(totalLines / CHUNK_SIZE);

        if (chunkIndex < 0 || chunkIndex >= totalChunks) {
          return errorResponse(`Invalid chunk index: ${chunkIndex}. Valid range: 0-${totalChunks - 1}`);
        }

        // Extract chunk
        const startIndex = chunkIndex * CHUNK_SIZE;
        const endIndex = Math.min(startIndex + CHUNK_SIZE, totalLines);
        const chunkLines = song.lyrics.parsedLines.slice(startIndex, endIndex);

        // Check chunk cache (include lyrics hash to invalidate when source changes)
        const lyricsHash = song.lyricsSource?.hash;
        const chunkCacheKey = lyricsHash
          ? `song:${songId}:furigana:chunk:${chunkIndex}:${lyricsHash}`
          : `song:${songId}:furigana:chunk:${chunkIndex}`;
        if (!force) {
          try {
            const cachedChunk = await redis.get(chunkCacheKey) as FuriganaSegment[][] | null;
            if (cachedChunk) {
              logInfo(requestId, `Furigana chunk ${chunkIndex + 1}/${totalChunks} - cache HIT`);
              return jsonResponse({
                chunkIndex,
                totalChunks,
                startIndex,
                furigana: cachedChunk,
                cached: true,
              });
            }
          } catch (e) {
            logError(requestId, "Chunk cache lookup failed", e);
          }
        }

        // Convert to LyricLine format and generate furigana
        const lines: LyricLine[] = chunkLines.map(line => ({
          words: line.words,
          startTimeMs: line.startTimeMs,
        }));

        logInfo(requestId, `Generating furigana chunk ${chunkIndex + 1}/${totalChunks} (${lines.length} lines)`);
        const furigana = await generateFuriganaForChunk(lines, requestId);

        // Cache the chunk result (30 days)
        try {
          await redis.set(chunkCacheKey, furigana, { ex: 60 * 60 * 24 * 30 });
        } catch (e) {
          logError(requestId, "Chunk cache write failed", e);
        }

        logInfo(requestId, `Furigana chunk ${chunkIndex + 1}/${totalChunks} - completed`);
        return jsonResponse({
          chunkIndex,
          totalChunks,
          startIndex,
          furigana,
          cached: false,
        });
      }

      // =======================================================================
      // Handle soramimi-chunk action - processes a single chunk of Chinese misheard lyrics
      // =======================================================================
      if (action === "soramimi-chunk") {
        const parsed = SoramimiChunkSchema.safeParse(body);
        if (!parsed.success) {
          return errorResponse("Invalid request body");
        }

        const { chunkIndex, force } = parsed.data;

        // Get song with lyrics
        const song = await getSong(redis, songId, {
          includeMetadata: true,
          includeLyrics: true,
        });

        if (!song?.lyrics?.lrc) {
          return errorResponse("Song has no lyrics", 404);
        }

        // Ensure parsedLines exist
        if (!song.lyrics.parsedLines || song.lyrics.parsedLines.length === 0) {
          song.lyrics.parsedLines = parseLyricsContent(
            { lrc: song.lyrics.lrc, krc: song.lyrics.krc },
            song.title,
            song.artist
          );
          await saveLyrics(redis, songId, song.lyrics, song.lyricsSource);
        }

        // Skip soramimi for Chinese lyrics (空耳 doesn't make sense for Chinese lyrics)
        if (lyricsAreMostlyChinese(song.lyrics.parsedLines)) {
          logInfo(requestId, "Skipping soramimi chunk - lyrics are mostly Chinese");
          return jsonResponse({
            chunkIndex,
            totalChunks: 0,
            startIndex: 0,
            soramimi: [],
            cached: false,
            skipped: true,
            skipReason: "chinese_lyrics",
          });
        }

        const totalLines = song.lyrics.parsedLines.length;
        const totalChunks = Math.ceil(totalLines / CHUNK_SIZE);

        if (chunkIndex < 0 || chunkIndex >= totalChunks) {
          return errorResponse(`Invalid chunk index: ${chunkIndex}. Valid range: 0-${totalChunks - 1}`);
        }

        // Extract chunk
        const startIndex = chunkIndex * CHUNK_SIZE;
        const endIndex = Math.min(startIndex + CHUNK_SIZE, totalLines);
        const chunkLines = song.lyrics.parsedLines.slice(startIndex, endIndex);

        // Check chunk cache (include lyrics hash to invalidate when source changes)
        const lyricsHash = song.lyricsSource?.hash;
        const chunkCacheKey = lyricsHash
          ? `song:${songId}:soramimi:chunk:${chunkIndex}:${lyricsHash}`
          : `song:${songId}:soramimi:chunk:${chunkIndex}`;
        if (!force) {
          try {
            const cachedChunk = await redis.get(chunkCacheKey) as FuriganaSegment[][] | null;
            if (cachedChunk) {
              logInfo(requestId, `Soramimi chunk ${chunkIndex + 1}/${totalChunks} - cache HIT`);
              return jsonResponse({
                chunkIndex,
                totalChunks,
                startIndex,
                soramimi: cachedChunk,
                cached: true,
              });
            }
          } catch (e) {
            logError(requestId, "Chunk cache lookup failed", e);
          }
        }

        // Convert to LyricLine format and generate soramimi
        const lines: LyricLine[] = chunkLines.map(line => ({
          words: line.words,
          startTimeMs: line.startTimeMs,
        }));

        logInfo(requestId, `Generating soramimi chunk ${chunkIndex + 1}/${totalChunks} (${lines.length} lines)`);
        const soramimi = await generateSoramimiForChunk(lines, requestId);

        // Cache the chunk result (30 days)
        try {
          await redis.set(chunkCacheKey, soramimi, { ex: 60 * 60 * 24 * 30 });
        } catch (e) {
          logError(requestId, "Chunk cache write failed", e);
        }

        logInfo(requestId, `Soramimi chunk ${chunkIndex + 1}/${totalChunks} - completed`);
        return jsonResponse({
          chunkIndex,
          totalChunks,
          startIndex,
          soramimi,
          cached: false,
        });
      }

      // =======================================================================
      // Handle save-translation action - saves consolidated translation to song
      // This is called by the client after all chunks have been processed
      // =======================================================================
      if (action === "save-translation") {
        const parsed = SaveTranslationSchema.safeParse(body);
        if (!parsed.success) {
          return errorResponse("Invalid request body");
        }

        const { language, translations } = parsed.data;

        // Get song with lyrics to build the LRC
        const song = await getSong(redis, songId, {
          includeMetadata: true,
          includeLyrics: true,
        });

        if (!song?.lyrics?.parsedLines) {
          return errorResponse("Song has no lyrics", 404);
        }

        // Verify the translations array matches the parsed lines
        if (translations.length !== song.lyrics.parsedLines.length) {
          return errorResponse(`Translation count mismatch: ${translations.length} vs ${song.lyrics.parsedLines.length} lines`);
        }

        // Build translated LRC from the parsed lines and translations
        const translatedLrc = song.lyrics.parsedLines
          .map((line, index) => `${msToLrcTime(line.startTimeMs)}${translations[index] || line.words}`)
          .join("\n");

        // Save to song document
        await saveTranslation(redis, songId, language, translatedLrc);

        logInfo(requestId, `Saved consolidated translation (${language}, ${translations.length} lines)`);
        return jsonResponse({ success: true, language, lineCount: translations.length });
      }

      // =======================================================================
      // Handle save-furigana action - saves consolidated furigana to song
      // This is called by the client after all chunks have been processed
      // =======================================================================
      if (action === "save-furigana") {
        const parsed = SaveFuriganaSchema.safeParse(body);
        if (!parsed.success) {
          return errorResponse("Invalid request body");
        }

        const { furigana } = parsed.data;

        // Get song to verify it exists and has lyrics
        const song = await getSong(redis, songId, {
          includeMetadata: true,
          includeLyrics: true,
        });

        if (!song?.lyrics?.parsedLines) {
          return errorResponse("Song has no lyrics", 404);
        }

        // Verify the furigana array matches the parsed lines
        if (furigana.length !== song.lyrics.parsedLines.length) {
          return errorResponse(`Furigana count mismatch: ${furigana.length} vs ${song.lyrics.parsedLines.length} lines`);
        }

        // Save to song document
        await saveFurigana(redis, songId, furigana as FuriganaSegment[][]);

        logInfo(requestId, `Saved consolidated furigana (${furigana.length} lines)`);
        return jsonResponse({ success: true, lineCount: furigana.length });
      }

      // =======================================================================
      // Handle save-soramimi action - saves consolidated soramimi to song
      // This is called by the client after all chunks have been processed
      // =======================================================================
      if (action === "save-soramimi") {
        const parsed = SaveSoramimiSchema.safeParse(body);
        if (!parsed.success) {
          return errorResponse("Invalid request body");
        }

        const { soramimi } = parsed.data;

        // Get song to verify it exists and has lyrics
        const song = await getSong(redis, songId, {
          includeMetadata: true,
          includeLyrics: true,
        });

        if (!song?.lyrics?.parsedLines) {
          return errorResponse("Song has no lyrics", 404);
        }

        // Verify the soramimi array matches the parsed lines
        if (soramimi.length !== song.lyrics.parsedLines.length) {
          return errorResponse(`Soramimi count mismatch: ${soramimi.length} vs ${song.lyrics.parsedLines.length} lines`);
        }

        // Save to song document
        await saveSoramimi(redis, songId, soramimi as FuriganaSegment[][]);

        logInfo(requestId, `Saved consolidated soramimi (${soramimi.length} lines)`);
        return jsonResponse({ success: true, lineCount: soramimi.length });
      }

      // =======================================================================
      // Handle clear-cached-data action - clears translations and/or furigana
      // =======================================================================
      if (action === "clear-cached-data") {
        const parsed = ClearCachedDataSchema.safeParse(body);
        if (!parsed.success) {
          return errorResponse("Invalid request body");
        }

        const { clearTranslations: shouldClearTranslations, clearFurigana: shouldClearFurigana } = parsed.data;

        // Get song to check what needs clearing
        const song = await getSong(redis, songId, {
          includeMetadata: true,
          includeLyrics: true,
          includeTranslations: true,
          includeFurigana: true,
        });

        if (!song) {
          return errorResponse("Song not found", 404);
        }

        const cleared: string[] = [];
        const lyricsHash = song.lyricsSource?.hash;
        const totalLines = song.lyrics?.parsedLines?.length || 0;
        const totalChunks = Math.ceil(totalLines / CHUNK_SIZE);

        // Clear translations if requested
        if (shouldClearTranslations) {
          // Clear consolidated translations
          if (song.translations && Object.keys(song.translations).length > 0) {
            await saveSong(redis, { id: songId, translations: {} }, { preserveTranslations: false });
          }
          
          // Clear chunk caches for all languages
          // We need to scan for translation chunk keys since we don't know all languages
          try {
            const pattern = lyricsHash
              ? `song:${songId}:translate:*:chunk:*:${lyricsHash}`
              : `song:${songId}:translate:*:chunk:*`;
            const keys = await redis.keys(pattern);
            if (keys.length > 0) {
              await redis.del(...keys);
              logInfo(requestId, `Deleted ${keys.length} translation chunk caches`);
            }
          } catch (e) {
            logError(requestId, "Failed to delete translation chunk caches", e);
          }
          
          cleared.push("translations");
        }

        // Clear furigana if requested
        if (shouldClearFurigana) {
          // Clear consolidated furigana
          if (song.furigana && song.furigana.length > 0) {
            await saveSong(redis, { id: songId, furigana: [] }, { preserveFurigana: false });
          }
          
          // Clear furigana chunk caches
          try {
            for (let i = 0; i < totalChunks; i++) {
              const chunkKey = lyricsHash
                ? `song:${songId}:furigana:chunk:${i}:${lyricsHash}`
                : `song:${songId}:furigana:chunk:${i}`;
              await redis.del(chunkKey);
            }
            if (totalChunks > 0) {
              logInfo(requestId, `Deleted ${totalChunks} furigana chunk caches`);
            }
          } catch (e) {
            logError(requestId, "Failed to delete furigana chunk caches", e);
          }
          
          cleared.push("furigana");
        }

        logInfo(requestId, `Cleared cached data: ${cleared.length > 0 ? cleared.join(", ") : "nothing to clear"}`);
        return jsonResponse({ success: true, cleared });
      }

      // =======================================================================
      // Handle unshare action - clears the createdBy field (admin only)
      // =======================================================================
      if (action === "unshare") {
        const parsed = UnshareSongSchema.safeParse(body);
        if (!parsed.success) {
          return errorResponse("Invalid request body");
        }

        // Validate auth
        const authResult = await validateAuthToken(redis, username, authToken);
        if (!authResult.valid) {
          return errorResponse("Unauthorized - authentication required", 401);
        }

        // Only admin can unshare
        if (username?.toLowerCase() !== "ryo") {
          return errorResponse("Forbidden - admin access required", 403);
        }

        // Get existing song
        const existingSong = await getSong(redis, songId, { includeMetadata: true });
        if (!existingSong) {
          return errorResponse("Song not found", 404);
        }

        // Clear createdBy by explicitly setting to undefined
        const updatedSong = await saveSong(
          redis,
          {
            ...existingSong,
            createdBy: undefined,
          },
          { preserveLyrics: true, preserveTranslations: true, preserveFurigana: true },
          existingSong
        );

        logInfo(requestId, "Song unshared (createdBy cleared)", { duration: `${Date.now() - startTime}ms` });
        return jsonResponse({
          success: true,
          id: updatedSong.id,
          createdBy: updatedSong.createdBy,
        });
      }

      // Default POST: Update song metadata (requires auth)
      const authResult = await validateAuthToken(redis, username, authToken);
      if (!authResult.valid) {
        return errorResponse("Unauthorized - authentication required", 401);
      }

      const parsed = UpdateSongSchema.safeParse(body);
      if (!parsed.success) {
        return errorResponse("Invalid request body");
      }

      // Check permission
      const existingSong = await getSong(redis, songId, { includeMetadata: true });
      const permission = canModifySong(existingSong, username);
      if (!permission.canModify) {
        return errorResponse(permission.reason || "Permission denied", 403);
      }

      // Update song
      const isUpdate = !!existingSong;
      const { lyricsSource, clearTranslations, clearFurigana, clearLyrics, isShare, ...restData } = parsed.data;
      
      // Determine what to preserve vs clear
      // If clearing is requested, don't preserve; otherwise preserve existing data
      const preserveOptions = {
        preserveLyrics: !clearLyrics,
        preserveTranslations: !clearTranslations,
        preserveFurigana: !clearFurigana,
      };

      // Determine createdBy:
      // - Only update createdBy when isShare is true (sharing via share dialog)
      // - Only allow setting createdBy if user is "ryo" OR song has no existing createdBy
      let createdBy = existingSong?.createdBy; // Default: preserve existing
      if (isShare) {
        const canSetCreatedBy = username?.toLowerCase() === "ryo" || !existingSong?.createdBy;
        if (canSetCreatedBy) {
          createdBy = username || undefined;
        }
        // If can't set createdBy, just preserve existing (don't fail the request)
      }

      // Build update data - if clearing, explicitly set to undefined
      const updateData: Parameters<typeof saveSong>[1] = {
        id: songId,
        ...restData,
        lyricsSource: lyricsSource as LyricsSource | undefined,
        createdBy,
      };

      // If clearing translations or furigana, explicitly set them to undefined
      if (clearTranslations) {
        updateData.translations = undefined;
      }
      if (clearFurigana) {
        updateData.furigana = undefined;
      }
      if (clearLyrics) {
        updateData.lyrics = undefined;
      }

      const updatedSong = await saveSong(redis, updateData, preserveOptions);

      logInfo(requestId, isUpdate ? "Song updated" : "Song created", { duration: `${Date.now() - startTime}ms` });
      return jsonResponse({
        success: true,
        id: updatedSong.id,
        isUpdate,
        createdBy: updatedSong.createdBy,
      });
    }

    // =========================================================================
    // DELETE: Delete song (admin only)
    // =========================================================================
    if (req.method === "DELETE") {
      const authHeader = req.headers.get("Authorization");
      const usernameHeader = req.headers.get("X-Username");
      const authToken = authHeader?.replace("Bearer ", "") || null;
      const username = usernameHeader || null;

      const authResult = await validateAuthToken(redis, username, authToken);
      if (!authResult.valid) {
        return errorResponse("Unauthorized - authentication required", 401);
      }

      // Only admin can delete
      if (username?.toLowerCase() !== "ryo") {
        return errorResponse("Forbidden - admin access required", 403);
      }

      const deleted = await deleteSong(redis, songId);
      if (!deleted) {
        return errorResponse("Song not found", 404);
      }

      logInfo(requestId, "Song deleted", { duration: `${Date.now() - startTime}ms` });
      return jsonResponse({ success: true, deleted: true });
    }

    return errorResponse("Method not allowed", 405);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    logError(requestId, "Song API error", error);
    return errorResponse(errorMessage, 500);
  }
}
