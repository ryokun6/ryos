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
  canModifySong,
  type SongDocument,
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

// Simplified Chinese to Traditional Chinese converter for Kugou metadata
const simplifiedToTraditional = Converter({ from: "cn", to: "tw" });

// Extended timeout for AI processing
export const maxDuration = 120;

// =============================================================================
// Constants & Schemas
// =============================================================================

const CHUNK_SIZE = 15;
const MAX_PARALLEL_CHUNKS = 3;

const kugouHeaders: HeadersInit = {
  "User-Agent":
    '{"percent": 21.4, "useragent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36", "system": "Chrome 116.0 Win10", "browser": "chrome", "version": 116.0, "os": "win10"}',
};

// KRC decryption key
const KRC_DECRYPTION_KEY = [64, 71, 97, 119, 94, 50, 116, 71, 81, 54, 49, 45, 206, 210, 110, 105];

const LyricsSourceSchema = z.object({
  hash: z.string(),
  albumId: z.union([z.string(), z.number()]),
  title: z.string(),
  artist: z.string(),
  album: z.string().optional(),
});

const UpdateSongSchema = z.object({
  title: z.string().optional(),
  artist: z.string().optional(),
  album: z.string().optional(),
  lyricOffset: z.number().optional(),
  lyricsSource: LyricsSourceSchema.optional(),
  // Options to clear cached data when lyrics source changes
  clearTranslations: z.boolean().optional(),
  clearFurigana: z.boolean().optional(),
  clearLyrics: z.boolean().optional(),
});

const FetchLyricsSchema = z.object({
  action: z.literal("fetch-lyrics"),
  lyricsSource: LyricsSourceSchema.optional(),
  force: z.boolean().optional(),
});

const SearchLyricsSchema = z.object({
  action: z.literal("search-lyrics"),
  query: z.string().optional(),
});

const TranslateSchema = z.object({
  action: z.literal("translate"),
  language: z.string(),
  force: z.boolean().optional(),
});

const FuriganaSchema = z.object({
  action: z.literal("furigana"),
  force: z.boolean().optional(),
});

// Chunked processing schemas - for avoiding edge function timeouts
const TranslateChunkSchema = z.object({
  action: z.literal("translate-chunk"),
  language: z.string(),
  chunkIndex: z.number(),
  totalChunks: z.number().optional(), // Optional, will be computed if not provided
  force: z.boolean().optional(),
});

const FuriganaChunkSchema = z.object({
  action: z.literal("furigana-chunk"),
  chunkIndex: z.number(),
  totalChunks: z.number().optional(),
  force: z.boolean().optional(),
});

// Schema for getting chunk info (how many chunks total)
const GetChunkInfoSchema = z.object({
  action: z.literal("get-chunk-info"),
  operation: z.enum(["translate", "furigana"]),
  language: z.string().optional(), // Required for translate
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

// =============================================================================
// Utility Functions
// =============================================================================

function generateRequestId(): string {
  return Math.random().toString(36).substring(2, 10);
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
 * Use AI to parse a YouTube title into song title and artist.
 * Falls back to simple parsing if AI fails.
 */
async function parseYouTubeTitleWithAI(
  rawTitle: string,
  channelName?: string,
  requestId?: string
): Promise<{ title: string; artist: string }> {
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
          content: `You are an expert music metadata parser. Given a raw YouTube video title and optionally the channel name, extract the song title and artist. Respond ONLY with a valid JSON object. If you cannot determine a field, set it to null.

Rules:
- Prefer original language names (e.g., "周杰倫" over "Jay Chou", "뉴진스" over "NewJeans")
- Remove video markers like "Official MV", "Lyric Video", "[MV]", etc. from the title
- The artist is usually before the delimiter (-, |, etc.) or in the channel name
- Channel names ending in "VEVO", "- Topic", or containing "Official" often indicate the artist

Examples:
- "Jay Chou - Sunny Day (周杰倫 - 晴天)" → {"title": "晴天", "artist": "周杰倫"}
- "NewJeans (뉴진스) 'How Sweet' Official MV" → {"title": "How Sweet", "artist": "뉴진스"}
- "Kenshi Yonezu - KICK BACK" with channel "Kenshi Yonezu" → {"title": "KICK BACK", "artist": "米津玄師"}
- "Lofi Hip Hop Radio" with channel "ChillHop Music" → {"title": "Lofi Hip Hop Radio", "artist": null}`,
        },
        {
          role: "user",
          content: `Title: ${rawTitle}${channelName ? `\nChannel: ${channelName}` : ""}`,
        },
      ],
      temperature: 0.1,
    });

    const result = {
      title: parsedData.title || rawTitle,
      artist: parsedData.artist || "",
    };
    
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
    .replace(/\s*[\[\(【「『]?\s*(official\s*)?(music\s*)?(video|mv|m\/v|audio|lyric|lyrics|visualizer|live)\s*[\]\)】」』]?\s*/gi, " ")
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
  const url = new URL("https://wwwapi.kugou.com/yy/index.php");
  url.searchParams.set("r", "play/getdata");
  url.searchParams.set("hash", hash);
  url.searchParams.set("dfid", randomString(23, "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"));
  url.searchParams.set("mid", randomString(23, "abcdefghijklmnopqrstuvwxyz0123456789"));
  url.searchParams.set("album_id", String(albumId));
  url.searchParams.set("_", String(Date.now()));

  const res = await fetch(url.toString(), { headers: kugouHeaders });
  if (!res.ok) return "";
  const json = (await res.json()) as { data?: { img?: string } };
  return json?.data?.img ?? "";
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

  const searchRes = await fetch(searchUrl, { headers: kugouHeaders });
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
  const candidateRes = await fetch(candidateUrl, { headers: kugouHeaders });
  if (!candidateRes.ok) {
    logError(requestId, "Failed to get lyrics candidate", candidateRes.status);
    return null;
  }

  const candidateJson = (await candidateRes.json()) as unknown as CandidateResponse;
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
    const krcRes = await fetch(krcUrl, { headers: kugouHeaders });
    if (krcRes.ok) {
      const krcJson = (await krcRes.json()) as unknown as LyricsDownloadResponse;
      if (krcJson?.content) {
        krc = decodeKRC(krcJson.content);
        logInfo(requestId, "Successfully decoded KRC lyrics");
      }
    }
  } catch (err) {
    logInfo(requestId, "KRC fetch/decode failed, trying LRC", err);
  }

  // Fetch LRC format
  const lrcUrl = `http://lyrics.kugou.com/download?ver=1&client=pc&id=${lyricsId}&accesskey=${lyricsKey}&fmt=lrc&charset=utf8`;
  try {
    const lrcRes = await fetch(lrcUrl, { headers: kugouHeaders });
    if (lrcRes.ok) {
      const lrcJson = (await lrcRes.json()) as unknown as LyricsDownloadResponse;
      if (lrcJson?.content) {
        lrc = base64ToUtf8(lrcJson.content);
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
  "录音", "混音", "母带", "和声", "版权", "吉他", "贝斯", "鼓", "键盘",
  "企划", "词", "詞：", "曲", "男：", "女：", "合：", "OP", "SP",
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
  const lineRegex = /^\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)$/;

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
  const wordTimingRegex = /<(\d+),(\d+),\d+>([^<]*)/g;

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

  const { object: aiResponse } = await generateObject({
    model: google("gemini-2.5-flash"),
    schema: AiTranslatedTextsSchema,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify(chunk.map((line) => ({ words: line.words }))) },
    ],
    temperature: 0.3,
  });

  return chunk.map((line, index) => aiResponse.translatedTexts[index] || line.words);
}

/**
 * Translate lyrics from pre-parsed lines
 * This ensures translation uses the same lines as the client
 */
async function translateFromParsedLines(
  parsedLines: ParsedLyricLine[],
  targetLanguage: string,
  requestId: string
): Promise<string> {
  if (parsedLines.length === 0) return "";

  // Convert to LyricLine format for chunk processing
  const lines: LyricLine[] = parsedLines.map(line => ({
    words: line.words,
    startTimeMs: line.startTimeMs,
  }));

  // Process in chunks
  const chunks: LyricLine[][] = [];
  for (let i = 0; i < lines.length; i += CHUNK_SIZE) {
    chunks.push(lines.slice(i, i + CHUNK_SIZE));
  }

  const allTranslations: string[] = [];

  // Process chunks with limited concurrency
  for (let i = 0; i < chunks.length; i += MAX_PARALLEL_CHUNKS) {
    const batch = chunks.slice(i, i + MAX_PARALLEL_CHUNKS);
    const results = await Promise.all(
      batch.map((chunk) => translateChunk(chunk, targetLanguage, requestId))
    );
    for (const result of results) {
      allTranslations.push(...result);
    }
    logInfo(requestId, `Translated chunks ${i + 1}-${Math.min(i + MAX_PARALLEL_CHUNKS, chunks.length)}/${chunks.length}`);
  }

  // Build translated LRC
  return lines
    .map((line, index) => `${msToLrcTime(line.startTimeMs)}${allTranslations[index] || line.words}`)
    .join("\n");
}

// =============================================================================
// Furigana Functions
// =============================================================================

function isJapaneseText(text: string): boolean {
  const hasKanji = /[\u4E00-\u9FFF]/.test(text);
  const hasKana = /[\u3040-\u309F\u30A0-\u30FF]/.test(text);
  return hasKanji && hasKana;
}

function containsKanji(text: string): boolean {
  return /[\u4E00-\u9FFF]/.test(text);
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

  const { object: aiResponse } = await generateObject({
    model: google("gemini-2.5-flash"),
    schema: AiFuriganaResponseSchema,
    messages: [
      { role: "system", content: FURIGANA_SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(textsToProcess) },
    ],
    temperature: 0.1,
  });

  // Map results back to all lines
  let furiganaIndex = 0;
  return lines.map((line) => {
    if (containsKanji(line.words)) {
      return aiResponse.annotatedLines[furiganaIndex++] || [{ text: line.words }];
    }
    return [{ text: line.words }];
  });
}

/**
 * Generate furigana from pre-parsed lines
 * This ensures furigana uses the same lines as the client
 */
async function generateFuriganaFromParsedLines(
  parsedLines: ParsedLyricLine[],
  requestId: string
): Promise<FuriganaSegment[][]> {
  if (parsedLines.length === 0) return [];

  // Convert to LyricLine format for chunk processing
  const lines: LyricLine[] = parsedLines.map(line => ({
    words: line.words,
    startTimeMs: line.startTimeMs,
  }));

  // Check if any lines are Japanese
  const hasJapanese = lines.some((line) => isJapaneseText(line.words));
  if (!hasJapanese) {
    return lines.map((line) => [{ text: line.words }]);
  }

  // Process in chunks
  const chunks: LyricLine[][] = [];
  for (let i = 0; i < lines.length; i += CHUNK_SIZE) {
    chunks.push(lines.slice(i, i + CHUNK_SIZE));
  }

  const allFurigana: FuriganaSegment[][] = [];

  for (let i = 0; i < chunks.length; i += MAX_PARALLEL_CHUNKS) {
    const batch = chunks.slice(i, i + MAX_PARALLEL_CHUNKS);
    const results = await Promise.all(
      batch.map((chunk) => generateFuriganaForChunk(chunk, requestId))
    );
    for (const result of results) {
      allFurigana.push(...result);
    }
    logInfo(requestId, `Processed furigana chunks ${i + 1}-${Math.min(i + MAX_PARALLEL_CHUNKS, chunks.length)}/${chunks.length}`);
  }

  return allFurigana;
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
  if (!isAllowedOrigin(effectiveOrigin)) {
    return new Response("Unauthorized", { status: 403 });
  }

  // Create Redis client
  const redis = new Redis({
    url: process.env.REDIS_KV_REST_API_URL as string,
    token: process.env.REDIS_KV_REST_API_TOKEN as string,
  });

  // Helper for JSON responses
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

  if (!songId || songId === "[id]") {
    return errorResponse("Song ID is required", 400);
  }

  try {
    // =========================================================================
    // GET: Retrieve song data
    // =========================================================================
    if (req.method === "GET") {
      const includeParam = url.searchParams.get("include") || "metadata";
      const includes = includeParam.split(",").map((s) => s.trim());
      const translateTo = url.searchParams.get("translateTo");
      const withFurigana = url.searchParams.get("withFurigana") === "true";
      const force = url.searchParams.get("force") === "true";

      logInfo(requestId, "GET song", { songId, includes, translateTo, withFurigana, force });

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

      // Generate translation on-demand if requested
      if (translateTo && song.lyrics?.parsedLines && song.lyrics.parsedLines.length > 0) {
        const existingTranslation = song.translations?.[translateTo];
        if (!existingTranslation || force) {
          logInfo(requestId, `Generating translation to ${translateTo}`);
          try {
            const translatedLrc = await translateFromParsedLines(song.lyrics.parsedLines, translateTo, requestId);
            await saveTranslation(redis, songId, translateTo, translatedLrc);
            song.translations = song.translations || {};
            song.translations[translateTo] = translatedLrc;
          } catch (err) {
            logError(requestId, "Translation failed", err);
            // Continue without translation
          }
        }
      }

      // Generate furigana on-demand if requested
      if (withFurigana && song.lyrics?.parsedLines && song.lyrics.parsedLines.length > 0) {
        const existingFurigana = song.furigana;
        if (!existingFurigana || force) {
          logInfo(requestId, "Generating furigana");
          try {
            const furigana = await generateFuriganaFromParsedLines(song.lyrics.parsedLines, requestId);
            await saveFurigana(redis, songId, furigana);
            song.furigana = furigana;
          } catch (err) {
            logError(requestId, "Furigana generation failed", err);
            // Continue without furigana
          }
        }
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
        
        // If no custom query provided, use AI to parse the title for better results
        if (!query && rawTitle) {
          const aiParsed = await parseYouTubeTitleWithAI(rawTitle, rawArtist, requestId);
          searchTitle = aiParsed.title || rawTitle;
          searchArtist = aiParsed.artist || rawArtist;
          query = `${stripParentheses(searchTitle)} ${stripParentheses(searchArtist)}`.trim();
          logInfo(requestId, "AI-parsed search query", { original: rawTitle, parsed: { title: searchTitle, artist: searchArtist }, query });
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

        // Get existing song
        const song = await getSong(redis, songId, {
          includeMetadata: true,
          includeLyrics: true,
        });

        // Use provided source or existing source
        if (!lyricsSource && song?.lyricsSource) {
          lyricsSource = song.lyricsSource;
        }

        // If we have cached lyrics and not forcing, return them
        if (!force && song?.lyrics?.lrc) {
          logInfo(requestId, `Response: 200 OK - Returning cached lyrics`, {
            hasLrc: !!song.lyrics.lrc,
            hasKrc: !!song.lyrics.krc,
            hasCover: !!song.lyrics.cover,
          });
          return jsonResponse({
            lyrics: song.lyrics,
            cached: true,
          });
        }

        // If no source, try auto-search with AI-parsed title
        if (!lyricsSource && song) {
          // Use AI to parse the title for better search results
          const aiParsed = await parseYouTubeTitleWithAI(song.title, song.artist || "", requestId);
          const searchTitle = aiParsed.title || song.title;
          const searchArtist = aiParsed.artist || song.artist || "";
          const query = `${stripParentheses(searchTitle)} ${stripParentheses(searchArtist)}`.trim();
          
          logInfo(requestId, "Auto-searching lyrics with AI-parsed title", { 
            original: { title: song.title, artist: song.artist },
            parsed: { title: searchTitle, artist: searchArtist },
            query 
          });
          
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

        // Save to song document
        const savedSong = await saveLyrics(redis, songId, lyrics, lyricsSource);
        logInfo(requestId, `Lyrics saved to song document`, { 
          songId,
          hasLyricsStored: !!savedSong.lyrics,
          parsedLinesCount: parsedLines.length,
        });

        logInfo(requestId, `Response: 200 OK - Lyrics fetched`, { hasKrc: !!lyrics.krc, hasCover: !!lyrics.cover, parsedLinesCount: parsedLines.length });
        return jsonResponse({ lyrics, cached: false });
      }

      // Handle translate action (no auth required for reading, but we save results)
      if (action === "translate") {
        const parsed = TranslateSchema.safeParse(body);
        if (!parsed.success) {
          return errorResponse("Invalid request body");
        }

        const { language, force } = parsed.data;

        // Get song with lyrics and metadata (for title/artist filtering)
        const song = await getSong(redis, songId, {
          includeMetadata: true,
          includeLyrics: true,
          includeTranslations: [language],
        });

        if (!song?.lyrics?.lrc) {
          return errorResponse("Song has no lyrics to translate", 404);
        }

        // Check for cached translation
        if (!force && song.translations?.[language]) {
          logInfo(requestId, `Response: 200 OK - Returning cached translation (${language})`);
          return jsonResponse({
            translation: song.translations[language],
            cached: true,
          });
        }

        // Ensure parsedLines exist (generate for legacy data)
        if (!song.lyrics.parsedLines || song.lyrics.parsedLines.length === 0) {
          logInfo(requestId, "Generating parsedLines for legacy data");
          song.lyrics.parsedLines = parseLyricsContent(
            { lrc: song.lyrics.lrc, krc: song.lyrics.krc },
            song.title,
            song.artist
          );
          // Save updated lyrics with parsedLines
          await saveLyrics(redis, songId, song.lyrics, song.lyricsSource);
        }

        if (!song.lyrics.parsedLines || song.lyrics.parsedLines.length === 0) {
          return errorResponse("No lyrics lines to translate", 404);
        }

        logInfo(requestId, `Translating to ${language} (${song.lyrics.parsedLines.length} lines)`);
        const translatedLrc = await translateFromParsedLines(song.lyrics.parsedLines, language, requestId);

        // Save translation
        await saveTranslation(redis, songId, language, translatedLrc);

        logInfo(requestId, `Response: 200 OK - Translation generated (${language})`);
        return jsonResponse({
          translation: translatedLrc,
          cached: false,
        });
      }

      // Handle furigana action (no auth required)
      if (action === "furigana") {
        const parsed = FuriganaSchema.safeParse(body);
        if (!parsed.success) {
          return errorResponse("Invalid request body");
        }

        const { force } = parsed.data;

        // Get song with lyrics and metadata (for title/artist filtering)
        const song = await getSong(redis, songId, {
          includeMetadata: true,
          includeLyrics: true,
          includeFurigana: true,
        });

        if (!song?.lyrics?.lrc) {
          return errorResponse("Song has no lyrics", 404);
        }

        // Check for cached furigana
        if (!force && song.furigana) {
          logInfo(requestId, `Response: 200 OK - Returning cached furigana`);
          return jsonResponse({
            furigana: song.furigana,
            cached: true,
          });
        }

        // Ensure parsedLines exist (generate for legacy data)
        if (!song.lyrics.parsedLines || song.lyrics.parsedLines.length === 0) {
          logInfo(requestId, "Generating parsedLines for legacy data");
          song.lyrics.parsedLines = parseLyricsContent(
            { lrc: song.lyrics.lrc, krc: song.lyrics.krc },
            song.title,
            song.artist
          );
          // Save updated lyrics with parsedLines
          await saveLyrics(redis, songId, song.lyrics, song.lyricsSource);
        }

        if (!song.lyrics.parsedLines || song.lyrics.parsedLines.length === 0) {
          return errorResponse("No lyrics lines for furigana", 404);
        }

        logInfo(requestId, `Generating furigana (${song.lyrics.parsedLines.length} lines)`);
        const furigana = await generateFuriganaFromParsedLines(song.lyrics.parsedLines, requestId);

        // Save furigana
        await saveFurigana(redis, songId, furigana);

        logInfo(requestId, `Response: 200 OK - Furigana generated (${furigana.length} lines)`);
        return jsonResponse({
          furigana,
          cached: false,
        });
      }

      // =======================================================================
      // Handle get-chunk-info action - returns chunk metadata for client
      // =======================================================================
      if (action === "get-chunk-info") {
        const parsed = GetChunkInfoSchema.safeParse(body);
        if (!parsed.success) {
          return errorResponse("Invalid request body");
        }

        const { operation, language } = parsed.data;

        // Get song with lyrics
        const song = await getSong(redis, songId, {
          includeMetadata: true,
          includeLyrics: true,
          includeTranslations: language ? [language] : undefined,
          includeFurigana: operation === "furigana",
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

        // Check if already cached
        let cached = false;
        if (operation === "translate" && language && song.translations?.[language]) {
          cached = true;
        } else if (operation === "furigana" && song.furigana) {
          cached = true;
        }

        logInfo(requestId, `Chunk info: ${operation}`, { totalLines, totalChunks, cached });
        return jsonResponse({
          totalLines,
          totalChunks,
          chunkSize: CHUNK_SIZE,
          cached,
          // If cached, return the full result
          ...(cached && operation === "translate" && language
            ? { translation: song.translations![language] }
            : {}),
          ...(cached && operation === "furigana" ? { furigana: song.furigana } : {}),
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

        // Check chunk cache
        const chunkCacheKey = `song:${songId}:translate:${language}:chunk:${chunkIndex}`;
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

        // Convert to LyricLine format and translate
        const lines: LyricLine[] = chunkLines.map(line => ({
          words: line.words,
          startTimeMs: line.startTimeMs,
        }));

        logInfo(requestId, `Translating chunk ${chunkIndex + 1}/${totalChunks} (${lines.length} lines)`);
        const translations = await translateChunk(lines, language, requestId);

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

        // Check chunk cache
        const chunkCacheKey = `song:${songId}:furigana:chunk:${chunkIndex}`;
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
      const { lyricsSource, clearTranslations, clearFurigana, clearLyrics, ...restData } = parsed.data;
      
      // Determine what to preserve vs clear
      // If clearing is requested, don't preserve; otherwise preserve existing data
      const preserveOptions = {
        preserveLyrics: !clearLyrics,
        preserveTranslations: !clearTranslations,
        preserveFurigana: !clearFurigana,
      };

      // Build update data - if clearing, explicitly set to undefined
      const updateData: Parameters<typeof saveSong>[1] = {
        id: songId,
        ...restData,
        lyricsSource: lyricsSource as LyricsSource | undefined,
        createdBy: existingSong?.createdBy || username || undefined,
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
