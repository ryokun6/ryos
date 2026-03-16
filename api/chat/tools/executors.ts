/**
 * Server-side tool executors
 * 
 * This module contains the server-side execution logic for tools that can
 * run entirely on the server (no browser state needed).
 * 
 * Tools that require client-side state (like launching apps, controlling media)
 * do not have executors here - they are handled by the client via onToolCall.
 */

import type { Redis } from "../../_utils/redis.js";
import { redisStateMetaKey } from "../../sync/_keys.js";
import type {
  ServerToolContext,
  GenerateHtmlInput,
  GenerateHtmlOutput,
  SearchSongsInput,
  SearchSongsOutput,
  SearchSongsResult,
  MemoryWriteInput,
  MemoryWriteOutput,
  MemoryReadInput,
  MemoryReadOutput,
  MemoryDeleteInput,
  MemoryDeleteOutput,
  CalendarControlInput,
  CalendarControlOutput,
  DocumentsControlInput,
  DocumentsControlOutput,
  StickiesControlInput,
  StickiesControlOutput,
  ContactsControlInput,
  ContactsControlOutput,
  CalendarSnapshotData,
  StickiesSnapshotData,
  ContactsSnapshotData,
  type StickyColor,
  SongLibraryControlInput,
  SongLibraryControlOutput,
  SongLibraryToolRecord,
  SongLibraryScope,
  SongLibraryLyricsSource,
  WebFetchInput,
  WebFetchOutput,
} from "./types.js";
import { stateKey } from "../../sync/_state.js";
import { getAppPublicOrigin } from "../../_utils/runtime-config.js";
import { readSongsState, writeSongsState } from "../../_utils/song-library-state.js";
import {
  getSong,
  listSongs as listCachedSongs,
  saveSong,
  type LyricsSource,
  type SongDocument,
} from "../../_utils/_song-service.js";
import { parseYouTubeTitleSimple } from "../../songs/_utils.js";
import {
  getMemoryIndex,
  getMemoryDetail,
  upsertMemory,
  deleteMemory,
  appendDailyNote,
  getDailyNote,
  getTodayDateString,
} from "../../_utils/_memory.js";
import {
  contactMatchesQuery,
  createContactFromDraft,
  getContactSummary,
  type ContactDraft,
  sortContacts,
  updateContactFromDraft,
} from "../../../src/utils/contacts.js";
import {
  readContactsState,
  serializeContactForTool,
  writeContactsState,
} from "../../_utils/contacts.js";

/**
 * Execute generateHtml tool
 * 
 * Server-side validation and passthrough of HTML content.
 * The actual rendering happens on the client.
 */
export async function executeGenerateHtml(
  input: GenerateHtmlInput,
  context: ServerToolContext
): Promise<GenerateHtmlOutput> {
  const { html, title, icon } = input;
  
  context.log(
    `[generateHtml] Received HTML (${html.length} chars), title: ${title || "none"}, icon: ${icon || "none"}`
  );

  if (!html || html.trim().length === 0) {
    throw new Error("HTML content cannot be empty");
  }

  return {
    html,
    title: title || "Applet",
    icon: icon || "📦",
  };
}

/**
 * Execute searchSongs tool
 * 
 * Search YouTube for songs with API key rotation for quota management.
 */
export async function executeSearchSongs(
  input: SearchSongsInput,
  context: ServerToolContext
): Promise<SearchSongsOutput> {
  const { query, maxResults = 5 } = input;
  
  context.log(`[searchSongs] Searching for: "${query}" (max ${maxResults} results)`);

  // Collect all available API keys for rotation
  const apiKeys = [
    context.env.YOUTUBE_API_KEY,
    context.env.YOUTUBE_API_KEY_2,
  ].filter((key): key is string => !!key);

  if (apiKeys.length === 0) {
    throw new Error("No YouTube API keys configured");
  }

  context.log(`[searchSongs] Available API keys: ${apiKeys.length}`);

  // Helper to check if error is a quota exceeded error
  const isQuotaError = (status: number, errorText: string): boolean => {
    if (status === 403) {
      const lowerText = errorText.toLowerCase();
      return lowerText.includes("quota") || lowerText.includes("exceeded") || lowerText.includes("limit");
    }
    return false;
  };

  let lastError: string | null = null;

  // Try each API key until one works
  for (let keyIndex = 0; keyIndex < apiKeys.length; keyIndex++) {
    const apiKey = apiKeys[keyIndex];
    const keyLabel = keyIndex === 0 ? "primary" : `backup-${keyIndex}`;

    try {
      context.log(`[searchSongs] Trying ${keyLabel} API key (${keyIndex + 1}/${apiKeys.length})`);

      const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
      searchUrl.searchParams.set("part", "snippet");
      searchUrl.searchParams.set("type", "video");
      searchUrl.searchParams.set("videoCategoryId", "10"); // Music category
      searchUrl.searchParams.set("q", query);
      searchUrl.searchParams.set("maxResults", String(maxResults));
      searchUrl.searchParams.set("key", apiKey);

      // Add timeout to prevent hanging on network stalls
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      let response: Response;
      try {
        response = await fetch(searchUrl.toString(), { signal: controller.signal });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        const errorText = await response.text();
        context.log(`[searchSongs] YouTube API error with ${keyLabel} key: ${response.status} - ${errorText}`);

        // Check if quota exceeded and we have more keys to try
        if (isQuotaError(response.status, errorText) && keyIndex < apiKeys.length - 1) {
          context.log(`[searchSongs] Quota exceeded for ${keyLabel} key, rotating to next key`);
          lastError = errorText;
          continue; // Try next key
        }

        throw new Error(`YouTube search failed: ${response.status}`);
      }

      const data = await response.json() as { items?: Array<{
        id: { videoId: string };
        snippet: { title: string; channelTitle: string; publishedAt: string; thumbnails: { medium?: { url: string } } };
      }> };

      if (!data.items || data.items.length === 0) {
        return {
          results: [],
          message: `No songs found for "${query}"`,
        };
      }

      const results: SearchSongsResult[] = data.items.map((item: {
        id: { videoId: string };
        snippet: {
          title: string;
          channelTitle: string;
          publishedAt: string;
          thumbnails?: { medium?: { url: string } };
        };
      }) => ({
        videoId: item.id.videoId,
        title: item.snippet.title,
        channelTitle: item.snippet.channelTitle,
        publishedAt: item.snippet.publishedAt,
      }));

      context.log(`[searchSongs] Found ${results.length} results for "${query}" using ${keyLabel} key`);

      return {
        results,
        message: `Found ${results.length} ${results.length === 1 ? "song" : "songs"} for "${query}"`,
        hint: "Use ipodControl with action 'addAndPlay' and the videoId to add a song to the iPod",
      };
    } catch (error) {
      context.logError(`[searchSongs] Error with ${keyLabel} key:`, error);
      // If we have more keys, try the next one
      if (keyIndex < apiKeys.length - 1) {
        context.log(`[searchSongs] Retrying with next API key`);
        continue;
      }
      throw new Error(`Failed to search for songs: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // All keys exhausted
  throw new Error(`All YouTube API keys exhausted. Last error: ${lastError || 'Unknown'}`);
}

// ============================================================================
// Web Fetch Tool Executor
// ============================================================================

import {
  safeFetchWithRedirects,
  validatePublicUrl,
  SsrfBlockedError,
} from "../../_utils/_ssrf.js";

const WEB_FETCH_MAX_CONTENT_LENGTH = 24_000;
const WEB_FETCH_TIMEOUT_MS = 15_000;

const WEB_FETCH_BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Upgrade-Insecure-Requests": "1",
};

const DANGEROUS_URL_SCHEMES = /^(?:javascript|data|vbscript|blob):/i;

/**
 * Repeatedly strip tag patterns until no more matches remain,
 * preventing nested-tag bypass (e.g. `<scr<script>ipt>`).
 */
function stripTagsLoop(html: string, pattern: RegExp, maxPasses = 10): string {
  let result = html;
  for (let i = 0; i < maxPasses; i++) {
    const next = result.replace(pattern, "");
    if (next === result) break;
    result = next;
  }
  return result;
}

/**
 * Decode HTML entities exactly once. We decode numeric/named entities in a
 * single pass to avoid double-unescaping (e.g. `&amp;lt;` → `&lt;` stays
 * as `&lt;`, not `<`).
 */
function decodeHtmlEntitiesOnce(text: string): string {
  const NAMED_ENTITIES: Record<string, string> = {
    "&nbsp;": " ",
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
  };

  return text.replace(
    /&(?:#x([0-9a-fA-F]+);|#(\d+);|[a-zA-Z]+;)/g,
    (match, hex, dec) => {
      if (hex) return String.fromCharCode(parseInt(hex, 16));
      if (dec) return String.fromCharCode(parseInt(dec, 10));
      const lower = match.toLowerCase();
      return NAMED_ENTITIES[lower] ?? match;
    }
  );
}

function stripHtmlToText(html: string, selector?: string): string {
  let working = html;

  if (selector) {
    const selectorPatterns = buildSelectorPatterns(selector);
    const extracted = extractByPatterns(working, selectorPatterns);
    if (extracted) {
      working = extracted;
    }
  } else {
    working = extractMainContent(working);
  }

  // Strip dangerous/non-content tags in a loop to handle nested obfuscation.
  // Regex allows optional whitespace before `>` in closing tags (e.g. `</script >`).
  working = stripTagsLoop(working, /<script\b[\s\S]*?<\/script\s*>/gi);
  working = stripTagsLoop(working, /<style\b[\s\S]*?<\/style\s*>/gi);
  working = stripTagsLoop(working, /<noscript\b[\s\S]*?<\/noscript\s*>/gi);
  working = stripTagsLoop(working, /<nav\b[\s\S]*?<\/nav\s*>/gi);
  working = stripTagsLoop(working, /<footer\b[\s\S]*?<\/footer\s*>/gi);
  working = stripTagsLoop(working, /<header\b[\s\S]*?<\/header\s*>/gi);
  working = stripTagsLoop(working, /<!--[\s\S]*?-->/g);
  working = stripTagsLoop(working, /<svg\b[\s\S]*?<\/svg\s*>/gi);

  working = working.replace(/<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/gi, (_m, tag, inner) => {
    const level = parseInt(tag.charAt(1), 10);
    return "\n" + "#".repeat(level) + " " + inner.trim() + "\n";
  });

  working = working.replace(/<li[^>]*>/gi, "\n- ");
  working = working.replace(/<\/li>/gi, "");
  working = working.replace(/<br\s*\/?>/gi, "\n");
  working = working.replace(/<\/p>/gi, "\n\n");
  working = working.replace(/<\/div>/gi, "\n");
  working = working.replace(/<\/tr>/gi, "\n");
  working = working.replace(/<td[^>]*>/gi, "\t");

  working = working.replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href, text) => {
    const linkText = text.replace(/<[^>]+>/g, "").trim();
    if (!linkText) return "";
    if (href.startsWith("#") || DANGEROUS_URL_SCHEMES.test(href)) return linkText;
    return `${linkText} (${href})`;
  });

  working = working.replace(/<[^>]+>/g, " ");

  working = decodeHtmlEntitiesOnce(working);

  working = working.replace(/[ \t]+/g, " ");
  working = working.replace(/\n[ \t]+/g, "\n");
  working = working.replace(/\n{3,}/g, "\n\n");
  working = working.trim();

  return working;
}

function buildSelectorPatterns(selector: string): RegExp[] {
  const patterns: RegExp[] = [];

  if (selector.startsWith("#")) {
    const id = selector.slice(1).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    patterns.push(new RegExp(`<[a-z][a-z0-9]*[^>]*\\bid=["']${id}["'][^>]*>[\\s\\S]*?(?=<\\/[a-z])`, "i"));
  } else if (selector.startsWith(".")) {
    const cls = selector.slice(1).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    patterns.push(new RegExp(`<[a-z][a-z0-9]*[^>]*\\bclass=["'][^"']*\\b${cls}\\b[^"']*["'][^>]*>[\\s\\S]*?(?=<\\/[a-z])`, "i"));
  } else {
    const tag = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    patterns.push(new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi"));
  }

  return patterns;
}

function extractByPatterns(html: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return match[0];
  }
  return null;
}

function extractMainContent(html: string): string {
  const mainPatterns = [
    /<main[^>]*>([\s\S]*?)<\/main>/i,
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<div[^>]*(?:id|class)=["'][^"']*(?:content|article|post|entry|main-body|main_content|page-content|post-content)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*role=["']main["'][^>]*>([\s\S]*?)<\/div>/i,
  ];

  for (const pattern of mainPatterns) {
    const match = html.match(pattern);
    if (match) {
      const content = match[1] || match[0];
      if (content.length > 200) return content;
    }
  }

  return html;
}

function extractMetadata(html: string): {
  title?: string;
  description?: string;
  siteName?: string;
} {
  const result: { title?: string; description?: string; siteName?: string } = {};

  const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i);
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  result.title = ogTitle?.[1]?.trim() || titleTag?.[1]?.trim().replace(/\s+/g, " ");

  const ogDesc = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["'][^>]*>/i);
  const metaDesc = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i);
  result.description = ogDesc?.[1]?.trim() || metaDesc?.[1]?.trim();

  const ogSite = html.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["'][^>]*>/i);
  result.siteName = ogSite?.[1]?.trim();

  return result;
}

export async function executeWebFetch(
  input: WebFetchInput,
  context: ServerToolContext
): Promise<WebFetchOutput> {
  const { url, selector } = input;

  context.log(`[webFetch] Fetching: ${url}${selector ? ` (selector: ${selector})` : ""}`);

  try {
    await validatePublicUrl(url);
  } catch (error) {
    const message =
      error instanceof SsrfBlockedError ? error.message : "Invalid URL format";
    context.log(`[webFetch] Blocked: ${message}`);
    return {
      success: false,
      url,
      content: "",
      contentLength: 0,
      truncated: false,
      message: `Cannot fetch this URL: ${message}`,
    };
  }

  try {
    const { response, finalUrl } = await safeFetchWithRedirects(
      url,
      {
        headers: WEB_FETCH_BROWSER_HEADERS,
        signal: AbortSignal.timeout(WEB_FETCH_TIMEOUT_MS),
      },
      { maxRedirects: 5 }
    );

    if (!response.ok) {
      context.log(`[webFetch] HTTP ${response.status} for ${url}`);
      return {
        success: false,
        url,
        finalUrl,
        content: "",
        contentLength: 0,
        truncated: false,
        message: `HTTP ${response.status}: ${response.statusText || "Request failed"}`,
      };
    }

    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const text = await response.text();
      const truncated = text.length > WEB_FETCH_MAX_CONTENT_LENGTH;
      const content = truncated
        ? text.slice(0, WEB_FETCH_MAX_CONTENT_LENGTH) + "\n\n[...truncated]"
        : text;

      context.log(`[webFetch] JSON response (${text.length} chars)`);
      return {
        success: true,
        url,
        finalUrl,
        content,
        contentLength: text.length,
        truncated,
        message: `Fetched JSON from ${new URL(finalUrl).hostname} (${text.length} chars)`,
      };
    }

    if (contentType.includes("text/plain")) {
      const text = await response.text();
      const truncated = text.length > WEB_FETCH_MAX_CONTENT_LENGTH;
      const content = truncated
        ? text.slice(0, WEB_FETCH_MAX_CONTENT_LENGTH) + "\n\n[...truncated]"
        : text;

      context.log(`[webFetch] Plain text response (${text.length} chars)`);
      return {
        success: true,
        url,
        finalUrl,
        content,
        contentLength: text.length,
        truncated,
        message: `Fetched text from ${new URL(finalUrl).hostname} (${text.length} chars)`,
      };
    }

    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      context.log(`[webFetch] Non-text content type: ${contentType}`);
      return {
        success: false,
        url,
        finalUrl,
        content: "",
        contentLength: 0,
        truncated: false,
        message: `Cannot extract text from content type: ${contentType}`,
      };
    }

    const html = await response.text();
    const metadata = extractMetadata(html);
    let textContent = stripHtmlToText(html, selector);

    const truncated = textContent.length > WEB_FETCH_MAX_CONTENT_LENGTH;
    if (truncated) {
      textContent =
        textContent.slice(0, WEB_FETCH_MAX_CONTENT_LENGTH) + "\n\n[...truncated]";
    }

    const hostname = new URL(finalUrl).hostname;
    context.log(
      `[webFetch] Extracted ${textContent.length} chars from ${hostname} (title: ${metadata.title || "none"})`
    );

    return {
      success: true,
      url,
      finalUrl,
      title: metadata.title,
      description: metadata.description,
      siteName: metadata.siteName || hostname,
      content: textContent,
      contentLength: textContent.length,
      truncated,
      message: `Fetched and extracted content from ${metadata.siteName || hostname}${metadata.title ? `: "${metadata.title}"` : ""} (${textContent.length} chars${truncated ? ", truncated" : ""})`,
    };
  } catch (error) {
    if (error instanceof SsrfBlockedError) {
      context.log(`[webFetch] SSRF blocked during redirect: ${error.message}`);
      return {
        success: false,
        url,
        content: "",
        contentLength: 0,
        truncated: false,
        message: `Blocked: ${error.message}`,
      };
    }

    const isTimeout =
      error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError");

    context.logError(`[webFetch] Fetch error for ${url}:`, error);
    return {
      success: false,
      url,
      content: "",
      contentLength: 0,
      truncated: false,
      message: isTimeout
        ? "Request timed out — the page took too long to respond."
        : `Failed to fetch: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

function buildSongLinks(context: ServerToolContext, id: string): Pick<
  SongLibraryToolRecord,
  "ipodUrl" | "karaokeUrl"
> {
  const baseOrigin = getAppPublicOrigin(context.apiBaseUrl);
  return {
    ipodUrl: `${baseOrigin}/ipod/${encodeURIComponent(id)}`,
    karaokeUrl: `${baseOrigin}/karaoke/${encodeURIComponent(id)}`,
  };
}

function toSongLibraryLyricsSource(
  source: LyricsSource | SongLibraryLyricsSource | undefined
): SongLibraryLyricsSource | undefined {
  if (!source) {
    return undefined;
  }

  return {
    hash: source.hash,
    albumId: source.albumId,
    title: source.title,
    artist: source.artist,
    ...(source.album ? { album: source.album } : {}),
  };
}

function toUserLibrarySongRecord(
  track: {
    id: string;
    title: string;
    artist?: string;
    album?: string;
    cover?: string;
    lyricOffset?: number;
    lyricsSource?: SongLibraryLyricsSource;
  },
  context: ServerToolContext
): SongLibraryToolRecord {
  return {
    id: track.id,
    title: track.title,
    ...(track.artist ? { artist: track.artist } : {}),
    ...(track.album ? { album: track.album } : {}),
    ...(track.cover ? { cover: track.cover } : {}),
    ...(track.lyricOffset !== undefined ? { lyricOffset: track.lyricOffset } : {}),
    ...(track.lyricsSource ? { lyricsSource: track.lyricsSource } : {}),
    source: "user_library",
    inUserLibrary: true,
    ...buildSongLinks(context, track.id),
  };
}

function toGlobalSongRecord(
  song: SongDocument,
  context: ServerToolContext,
  options: { includeAvailability?: boolean } = {}
): SongLibraryToolRecord {
  return {
    id: song.id,
    title: song.title,
    ...(song.artist ? { artist: song.artist } : {}),
    ...(song.album ? { album: song.album } : {}),
    ...(song.cover ? { cover: song.cover } : {}),
    ...(song.lyricOffset !== undefined ? { lyricOffset: song.lyricOffset } : {}),
    ...(song.lyricsSource
      ? { lyricsSource: toSongLibraryLyricsSource(song.lyricsSource) }
      : {}),
    ...(song.createdBy ? { createdBy: song.createdBy } : {}),
    ...(song.createdAt ? { createdAt: song.createdAt } : {}),
    ...(song.updatedAt ? { updatedAt: song.updatedAt } : {}),
    ...(options.includeAvailability
      ? {
          hasLyrics: !!song.lyrics?.lrc,
          hasTranslations: !!(song.translations && Object.keys(song.translations).length > 0),
          hasFurigana: !!(song.furigana && song.furigana.length > 0),
          hasSoramimi: !!(
            (song.soramimi && song.soramimi.length > 0) ||
            (song.soramimiByLang && Object.keys(song.soramimiByLang).length > 0)
          ),
        }
      : {}),
    source: "global_cache",
    inUserLibrary: false,
    ...buildSongLinks(context, song.id),
  };
}

function combineSongRecords(
  userRecord: SongLibraryToolRecord,
  globalRecord: SongLibraryToolRecord
): SongLibraryToolRecord {
  return {
    ...globalRecord,
    ...userRecord,
    title: userRecord.title || globalRecord.title,
    artist: userRecord.artist ?? globalRecord.artist,
    album: userRecord.album ?? globalRecord.album,
    cover: userRecord.cover ?? globalRecord.cover,
    lyricOffset: userRecord.lyricOffset ?? globalRecord.lyricOffset,
    lyricsSource: userRecord.lyricsSource ?? globalRecord.lyricsSource,
    createdBy: globalRecord.createdBy,
    createdAt: globalRecord.createdAt,
    updatedAt: globalRecord.updatedAt,
    hasLyrics: globalRecord.hasLyrics,
    hasTranslations: globalRecord.hasTranslations,
    hasFurigana: globalRecord.hasFurigana,
    hasSoramimi: globalRecord.hasSoramimi,
    source: "combined",
    inUserLibrary: true,
  };
}

function normalizeSongQuery(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function scoreSongMatch(record: SongLibraryToolRecord, query: string): number {
  const normalizedQuery = normalizeSongQuery(query);
  if (!normalizedQuery) {
    return 1;
  }

  const fields = [
    record.id,
    record.title,
    record.artist,
    record.album,
    record.createdBy,
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .map((value) => normalizeSongQuery(value));

  let score = 0;

  if (record.id.toLowerCase() === normalizedQuery) {
    score += 2000;
  }

  for (const field of fields) {
    if (field === normalizedQuery) {
      score += 1200;
    } else if (field.startsWith(normalizedQuery)) {
      score += 700;
    } else if (field.includes(normalizedQuery)) {
      score += 350;
    }
  }

  const queryTokens = normalizedQuery.split(" ").filter(Boolean);
  if (queryTokens.length > 1) {
    const combined = fields.join(" ");
    const matchingTokens = queryTokens.filter((token) => combined.includes(token)).length;
    score += matchingTokens * 120;
  }

  if (score <= 0) {
    return 0;
  }

  if (record.source === "combined") {
    score += 80;
  } else if (record.inUserLibrary) {
    score += 40;
  }

  return score;
}

function filterAndLimitSongs(
  songs: SongLibraryToolRecord[],
  query: string | undefined,
  limit: number
): SongLibraryToolRecord[] {
  if (!query) {
    return songs.slice(0, limit);
  }

  return songs
    .map((song, index) => ({ song, score: scoreSongMatch(song, query), index }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      const createdAtA = a.song.createdAt ?? 0;
      const createdAtB = b.song.createdAt ?? 0;
      if (createdAtB !== createdAtA) {
        return createdAtB - createdAtA;
      }
      return a.index - b.index;
    })
    .slice(0, limit)
    .map((entry) => entry.song);
}

function resolveSongScope(
  requestedScope: SongLibraryScope,
  username?: string | null
): SongLibraryScope {
  if (requestedScope === "user" && !username) {
    return "user";
  }

  if (requestedScope === "any" && !username) {
    return "global";
  }

  return requestedScope;
}

async function loadUserLibrarySongs(
  context: MemoryToolContext
): Promise<SongLibraryToolRecord[]> {
  if (!context.redis || !context.username) {
    return [];
  }

  const state = await readSongsState(context.redis, context.username);
  return (state?.data.tracks ?? []).map((track) =>
    toUserLibrarySongRecord(
      {
        id: track.id,
        title: track.title,
        artist: track.artist,
        album: track.album,
        cover: track.cover,
        lyricOffset: track.lyricOffset,
        lyricsSource: toSongLibraryLyricsSource(track.lyricsSource),
      },
      context
    )
  );
}

async function loadGlobalLibrarySongs(
  context: MemoryToolContext
): Promise<SongLibraryToolRecord[]> {
  if (!context.redis) {
    return [];
  }

  const songs = await listCachedSongs(context.redis, {
    getOptions: { includeMetadata: true },
  });
  return songs.map((song) => toGlobalSongRecord(song, context));
}

function combineSongCollections(
  userSongs: SongLibraryToolRecord[],
  globalSongs: SongLibraryToolRecord[]
): SongLibraryToolRecord[] {
  const globalMap = new Map(globalSongs.map((song) => [song.id, song]));
  const combined: SongLibraryToolRecord[] = [];
  const seen = new Set<string>();

  for (const userSong of userSongs) {
    const globalSong = globalMap.get(userSong.id);
    combined.push(globalSong ? combineSongRecords(userSong, globalSong) : userSong);
    seen.add(userSong.id);
  }

  for (const globalSong of globalSongs) {
    if (!seen.has(globalSong.id)) {
      combined.push(globalSong);
    }
  }

  return combined;
}

function extractYouTubeVideoId(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (!trimmed.includes("://") && !trimmed.includes("/")) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    if (url.hostname === "youtu.be") {
      return url.pathname.split("/").filter(Boolean)[0] ?? null;
    }
    if (url.searchParams.get("v")) {
      return url.searchParams.get("v");
    }
    const parts = url.pathname.split("/").filter(Boolean);
    const embedIndex = parts.findIndex((part) => part === "embed" || part === "shorts");
    if (embedIndex >= 0) {
      return parts[embedIndex + 1] ?? null;
    }
  } catch {
    return null;
  }

  return null;
}

async function fetchYouTubeOEmbed(
  videoId: string,
  context: ServerToolContext
): Promise<{ title?: string; authorName?: string; thumbnailUrl?: string } | null> {
  const oembedUrl = `https://www.youtube.com/oembed?url=http://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&format=json`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(oembedUrl, { signal: controller.signal });
    if (!response.ok) {
      context.log(
        `[songLibraryControl] oEmbed failed for ${videoId}: ${response.status}`
      );
      return null;
    }

    const data = (await response.json()) as {
      title?: string;
      author_name?: string;
      thumbnail_url?: string;
    };

    return {
      title: data.title,
      authorName: data.author_name,
      thumbnailUrl: data.thumbnail_url,
    };
  } catch (error) {
    context.logError(`[songLibraryControl] Failed to fetch oEmbed for ${videoId}`, error);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function executeSongLibraryControl(
  input: SongLibraryControlInput,
  context: MemoryToolContext
): Promise<SongLibraryControlOutput> {
  const requestedScope = input.scope || "any";
  const scope = resolveSongScope(requestedScope, context.username);
  const limit = input.limit ?? 5;

  context.log(
    `[songLibraryControl] action=${input.action} scope=${scope} query=${input.query || ""} id=${input.id || ""} videoId=${input.videoId || ""} url=${input.url || ""}`
  );

  if (input.action === "searchYoutube") {
    try {
      const result = await executeSearchSongs(
        {
          query: input.query || "",
          maxResults: limit,
        },
        context
      );

      return {
        success: true,
        message: result.message,
        youtubeResults: result.results,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to search YouTube.",
      };
    }
  }

  if (!context.redis) {
    return {
      success: false,
      message: "Song storage is not available.",
      scope,
    };
  }

  if (requestedScope === "user" && !context.username) {
    return {
      success: false,
      message: "Authentication required to search the user's synced song library.",
      scope: requestedScope,
    };
  }

  if (input.action === "add" && !context.username) {
    return {
      success: false,
      message: "Authentication required to add songs to your synced library.",
      scope: "user",
    };
  }

  if (input.action === "add") {
    const videoId =
      input.videoId?.trim() ||
      extractYouTubeVideoId(input.url) ||
      input.id?.trim() ||
      "";

    if (!videoId) {
      return {
        success: false,
        message: "A valid YouTube video ID or URL is required to add a song.",
        scope: "user",
      };
    }

    const userState = await readSongsState(context.redis, context.username!);
    const existingTrack = userState?.data.tracks.find((track) => track.id === videoId);
    const existingSong = await getSong(context.redis, videoId, {
      includeMetadata: true,
      includeLyrics: true,
      includeTranslations: true,
      includeFurigana: true,
      includeSoramimi: true,
    });

    let title =
      input.title?.trim() ||
      existingTrack?.title ||
      existingSong?.title ||
      "";
    let artist =
      input.artist?.trim() ||
      existingTrack?.artist ||
      existingSong?.artist ||
      "";
    const album =
      input.album?.trim() ||
      existingTrack?.album ||
      existingSong?.album;

    let cover = existingTrack?.cover || existingSong?.cover;

    if (!title || !artist || !cover) {
      const oembed = await fetchYouTubeOEmbed(videoId, context);
      const parsed = oembed?.title
        ? parseYouTubeTitleSimple(oembed.title, oembed.authorName)
        : null;

      if (!title) {
        title = parsed?.title || oembed?.title || videoId;
      }
      if (!artist) {
        artist = parsed?.artist || oembed?.authorName || "";
      }
      if (!cover && oembed?.thumbnailUrl) {
        cover = oembed.thumbnailUrl;
      }
    }

    if (!title) {
      title = videoId;
    }

    const savedSong = await saveSong(
      context.redis,
      {
        id: videoId,
        title,
        ...(artist ? { artist } : {}),
        ...(album ? { album } : {}),
        ...(cover ? { cover } : {}),
        ...(existingSong?.lyricOffset !== undefined
          ? { lyricOffset: existingSong.lyricOffset }
          : {}),
        ...(existingSong?.lyricsSource
          ? { lyricsSource: existingSong.lyricsSource }
          : {}),
        createdBy: existingSong?.createdBy || context.username || undefined,
      },
      {
        preserveLyrics: true,
        preserveTranslations: true,
        preserveFurigana: true,
        preserveSoramimi: true,
      },
      existingSong
    );

    const nextTrack = {
      id: savedSong.id,
      url: `https://www.youtube.com/watch?v=${savedSong.id}`,
      title: savedSong.title,
      ...(savedSong.artist ? { artist: savedSong.artist } : {}),
      ...(savedSong.album ? { album: savedSong.album } : {}),
      ...(savedSong.cover ? { cover: savedSong.cover } : {}),
      ...(savedSong.lyricOffset !== undefined
        ? { lyricOffset: savedSong.lyricOffset }
        : {}),
      ...(savedSong.lyricsSource
        ? { lyricsSource: savedSong.lyricsSource }
        : {}),
    };

    const existingTracks = userState?.data.tracks ?? [];
    const alreadyInLibrary = existingTracks.some((track) => track.id === savedSong.id);

    await writeSongsState(context.redis, context.username!, {
      tracks: [nextTrack, ...existingTracks.filter((track) => track.id !== savedSong.id)],
      libraryState: "loaded",
      lastKnownVersion: (userState?.data.lastKnownVersion ?? 0) + 1,
    });

    const userRecord = toUserLibrarySongRecord(
      {
        id: savedSong.id,
        title: savedSong.title,
        artist: savedSong.artist,
        album: savedSong.album,
        cover: savedSong.cover,
        lyricOffset: savedSong.lyricOffset,
        lyricsSource: toSongLibraryLyricsSource(savedSong.lyricsSource),
      },
      context
    );
    const globalRecord = toGlobalSongRecord(savedSong, context, {
      includeAvailability: true,
    });

    return {
      success: true,
      scope: "user",
      message: alreadyInLibrary
        ? `Updated "${savedSong.title}" in your library.`
        : `Added "${savedSong.title}" to your library.`,
      song: combineSongRecords(userRecord, globalRecord),
    };
  }

  const userSongs =
    scope === "user" || scope === "any" ? await loadUserLibrarySongs(context) : [];
  const globalSongs =
    scope === "global" || scope === "any" ? await loadGlobalLibrarySongs(context) : [];
  const searchableSongs =
    scope === "any"
      ? combineSongCollections(userSongs, globalSongs)
      : scope === "user"
        ? userSongs
        : globalSongs;

  switch (input.action) {
    case "list": {
      const songs = searchableSongs.slice(0, limit);
      return {
        success: true,
        message:
          songs.length === 0
            ? `No songs found in the ${scope === "user" ? "user" : scope === "global" ? "global" : "available"} library.`
            : `Found ${songs.length} ${songs.length === 1 ? "song" : "songs"} in ${scope} scope.`,
        scope,
        songs,
      };
    }

    case "search": {
      const songs = filterAndLimitSongs(searchableSongs, input.query, limit);
      return {
        success: true,
        message:
          songs.length === 0
            ? `No songs matched "${input.query}" in ${scope} scope.`
            : `Found ${songs.length} ${songs.length === 1 ? "song" : "songs"} matching "${input.query}" in ${scope} scope.`,
        scope,
        songs,
      };
    }

    case "get": {
      const id = input.id?.trim() || "";
      const userSong = userSongs.find((song) => song.id === id);

      let globalSong: SongLibraryToolRecord | null = null;
      if (scope !== "user") {
        const globalDetail = await getSong(context.redis, id, {
          includeMetadata: true,
          includeLyrics: true,
          includeTranslations: true,
          includeFurigana: true,
          includeSoramimi: true,
        });
        if (globalDetail) {
          globalSong = toGlobalSongRecord(globalDetail, context, {
            includeAvailability: true,
          });
        }
      }

      const song =
        userSong && globalSong
          ? combineSongRecords(userSong, globalSong)
          : userSong || globalSong;

      if (!song) {
        return {
          success: false,
          message: `Song '${id}' was not found in ${scope} scope.`,
          scope,
          song: null,
        };
      }

      return {
        success: true,
        message: `Loaded metadata for "${song.title}".`,
        scope,
        song,
      };
    }

  }
}

// ============================================================================
// Unified Memory Tool Executors
// ============================================================================

/**
 * Extended context for memory operations
 */
export interface MemoryToolContext extends ServerToolContext {
  username?: string | null;
  redis?: Redis;
  timeZone?: string;
}

/**
 * Execute memoryWrite tool (unified)
 * 
 * Handles both long-term memory writes and daily note appends.
 */
export async function executeMemoryWrite(
  input: MemoryWriteInput,
  context: MemoryToolContext
): Promise<MemoryWriteOutput> {
  const { type = "long_term", content } = input;

  // Validate authentication
  if (!context.username) {
    context.log("[memoryWrite] No username - authentication required");
    return {
      success: false,
      message: "Authentication required to write memories. Please log in.",
    };
  }

  if (!context.redis) {
    context.logError("[memoryWrite] Redis not available");
    return {
      success: false,
      message: "Memory storage not available.",
    };
  }

  try {
    // Route to the appropriate handler
    if (type === "daily") {
      context.log(`[memoryWrite:daily] Logging daily note (${content.length} chars)`);
      const result = await appendDailyNote(
        context.redis,
        context.username,
        content,
        { timeZone: context.timeZone },
      );

      context.log(
        `[memoryWrite:daily] Result: ${result.success ? "success" : "failed"} - ${result.message}`
      );

      return {
        success: result.success,
        message: result.message,
        date: result.date,
        entryCount: result.entryCount,
      };
    }

    // Long-term memory write
    const { key, summary, mode = "add" } = input;

    if (!key || !summary) {
      return {
        success: false,
        message: "Key and summary are required for long-term memories.",
      };
    }

    context.log(`[memoryWrite:long_term] Writing "${key}" with mode "${mode}"`);

    const result = await upsertMemory(
      context.redis,
      context.username,
      key,
      summary,
      content,
      mode
    );

    // Get updated memory list
    const index = await getMemoryIndex(context.redis, context.username);
    const currentMemories = index?.memories.map((m) => ({
      key: m.key,
      summary: m.summary,
    })) || [];

    context.log(
      `[memoryWrite:long_term] Result: ${result.success ? "success" : "failed"} - ${result.message}`
    );

    return {
      success: result.success,
      message: result.message,
      currentMemories,
    };
  } catch (error) {
    context.logError("[memoryWrite] Unexpected error:", error);
    return {
      success: false,
      message: `Memory write failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Execute memoryRead tool (unified)
 * 
 * Reads either a long-term memory by key or daily notes by date.
 */
export async function executeMemoryRead(
  input: MemoryReadInput,
  context: MemoryToolContext
): Promise<MemoryReadOutput> {
  const { type = "long_term" } = input;

  // Validate authentication
  if (!context.username) {
    context.log("[memoryRead] No username - authentication required");
    return {
      success: false,
      message: "Authentication required to read memories. Please log in.",
    };
  }

  if (!context.redis) {
    context.logError("[memoryRead] Redis not available");
    return {
      success: false,
      message: "Memory storage not available.",
    };
  }

  try {
    // Route to the appropriate handler
    if (type === "daily") {
      const date = input.date || getTodayDateString(context.timeZone);
      context.log(`[memoryRead:daily] Reading daily note for ${date}`);

      const note = await getDailyNote(context.redis, context.username, date);

      if (!note || note.entries.length === 0) {
        return {
          success: false,
          message: `No daily notes found for ${date}.`,
          date,
          entries: [],
        };
      }

      context.log(`[memoryRead:daily] Found ${note.entries.length} entries for ${date}`);

      return {
        success: true,
        message: `Retrieved ${note.entries.length} entries for ${date}.`,
        date,
        entries: note.entries.map((e) => ({
          timestamp: e.timestamp,
          isoTimestamp: e.isoTimestamp,
          localDate: e.localDate,
          localTime: e.localTime,
          timeZone: e.timeZone,
          content: e.content,
        })),
      };
    }

    // Long-term memory read
    const { key } = input;

    if (!key) {
      return {
        success: false,
        message: "Key is required for reading long-term memories.",
      };
    }

    context.log(`[memoryRead:long_term] Reading memory "${key}"`);

    const detail = await getMemoryDetail(context.redis, context.username, key);

    if (!detail) {
      context.log(`[memoryRead:long_term] Memory "${key}" not found`);
      return {
        success: false,
        message: `Memory "${key}" not found.`,
        key,
        content: null,
        summary: null,
      };
    }

    const index = await getMemoryIndex(context.redis, context.username);
    const entry = index?.memories.find((m) => m.key === key.toLowerCase());

    context.log(`[memoryRead:long_term] Found memory "${key}" (${detail.content.length} chars)`);

    return {
      success: true,
      message: `Retrieved memory "${key}".`,
      key,
      content: detail.content,
      summary: entry?.summary || null,
    };
  } catch (error) {
    context.logError("[memoryRead] Unexpected error:", error);
    return {
      success: false,
      message: `Memory read failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Execute memoryDelete tool
 * 
 * Deletes a long-term memory by key.
 */
export async function executeMemoryDelete(
  input: MemoryDeleteInput,
  context: MemoryToolContext
): Promise<MemoryDeleteOutput> {
  const { key } = input;

  context.log(`[memoryDelete] Deleting memory "${key}"`);

  // Validate authentication
  if (!context.username) {
    context.log("[memoryDelete] No username - authentication required");
    return {
      success: false,
      message: "Authentication required to delete memories. Please log in.",
    };
  }

  if (!context.redis) {
    context.logError("[memoryDelete] Redis not available");
    return {
      success: false,
      message: "Memory storage not available.",
    };
  }

  try {
    const result = await deleteMemory(context.redis, context.username, key);

    context.log(
      `[memoryDelete] Result: ${result.success ? "success" : "failed"} - ${result.message}`
    );

    return {
      success: result.success,
      message: result.message,
    };
  } catch (error) {
    context.logError("[memoryDelete] Unexpected error:", error);
    return {
      success: false,
      message: `Memory delete failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

// ============================================================================
// Server-Side Documents / Calendar / Stickies Executors (Redis-backed)
// ============================================================================

type AppStateToolContext = MemoryToolContext;

interface SyncedFileSystemItem {
  path: string;
  name: string;
  isDirectory: boolean;
  uuid?: string;
  size?: number;
  createdAt?: number;
  modifiedAt?: number;
  status: "active" | "trashed";
  type?: string;
  icon?: string;
  [key: string]: unknown;
}

interface SyncedStoreItem {
  key: string;
  value: {
    name?: string;
    content?: unknown;
    [key: string]: unknown;
  };
}

interface FilesMetadataSnapshotData {
  items: Record<string, SyncedFileSystemItem>;
  libraryState: "uninitialized" | "loaded" | "cleared";
  documents?: SyncedStoreItem[];
  deletedPaths?: Record<string, string>;
}

function filesMetadataStateKey(username: string): string {
  return stateKey(username, "files-metadata");
}

function stateMetaKey(username: string): string {
  return redisStateMetaKey(username);
}

async function readFilesMetadataState(
  redis: Redis,
  username: string
): Promise<FilesMetadataSnapshotData | null> {
  const raw = await redis.get<string | { data: FilesMetadataSnapshotData }>(
    filesMetadataStateKey(username)
  );
  if (!raw) return null;
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  return parsed?.data ?? null;
}

async function writeFilesMetadataState(
  redis: Redis,
  username: string,
  data: FilesMetadataSnapshotData
): Promise<void> {
  const now = new Date().toISOString();
  await redis.set(
    filesMetadataStateKey(username),
    JSON.stringify({
      data,
      updatedAt: now,
      version: 1,
      createdAt: now,
    })
  );

  const rawMeta = await redis.get<string | Record<string, unknown>>(
    stateMetaKey(username)
  );
  const meta = typeof rawMeta === "string" ? JSON.parse(rawMeta) : rawMeta || {};
  meta["files-metadata"] = { updatedAt: now, version: 1, createdAt: now };
  await redis.set(stateMetaKey(username), JSON.stringify(meta));
}

function isActiveDocument(item: SyncedFileSystemItem | undefined): item is SyncedFileSystemItem {
  return !!item && item.status === "active" && !item.isDirectory && item.path.startsWith("/Documents/");
}

function createDocumentsIndex(documents: SyncedStoreItem[] | undefined): Map<string, SyncedStoreItem> {
  return new Map((documents || []).map((entry) => [entry.key, entry]));
}

function getDocumentNameFromPath(path: string): string {
  return path.split("/").filter(Boolean).pop() || "Untitled.md";
}

function getSyncedDocumentName(item: Pick<SyncedFileSystemItem, "path" | "name">): string {
  const trimmedName = typeof item.name === "string" ? item.name.trim() : "";
  return trimmedName || getDocumentNameFromPath(item.path);
}

function getDocumentContentAsString(entry: SyncedStoreItem | undefined): string | null {
  if (!entry) return null;
  return typeof entry.value.content === "string" ? entry.value.content : null;
}

function createDocumentSize(content: string): number {
  return new TextEncoder().encode(content).length;
}

function createMissingFilesSyncMessage(): string {
  return "No file data synced yet. Enable cloud sync in ryOS first.";
}

function addDeletionMarkers(
  existing: Record<string, string> | undefined,
  keys: Iterable<string>,
  deletedAt: string
): Record<string, string> | undefined {
  const next = { ...(existing || {}) };
  let changed = false;

  for (const key of keys) {
    if (!key) {
      continue;
    }

    if (next[key] !== deletedAt) {
      next[key] = deletedAt;
      changed = true;
    }
  }

  return changed ? next : existing;
}

function clearDeletionMarkers(
  existing: Record<string, string> | undefined,
  keys: Iterable<string>
): Record<string, string> | undefined {
  if (!existing) {
    return existing;
  }

  const next = { ...existing };
  let changed = false;

  for (const key of keys) {
    if (key && key in next) {
      delete next[key];
      changed = true;
    }
  }

  return changed ? next : existing;
}

export async function executeDocumentsControl(
  input: DocumentsControlInput,
  context: AppStateToolContext
): Promise<DocumentsControlOutput> {
  if (!context.username) {
    return { success: false, message: "Authentication required." };
  }
  if (!context.redis) {
    return { success: false, message: "Storage not available." };
  }

  const state = await readFilesMetadataState(context.redis, context.username);
  if (!state) {
    return {
      success: false,
      message: createMissingFilesSyncMessage(),
    };
  }

  const { action } = input;
  const documentsIndex = createDocumentsIndex(state.documents);

  switch (action) {
    case "list": {
      const documents = Object.values(state.items)
        .filter(isActiveDocument)
        .sort((a, b) => {
          const aModified = a.modifiedAt ?? 0;
          const bModified = b.modifiedAt ?? 0;
          if (bModified !== aModified) {
            return bModified - aModified;
          }
          return a.path.localeCompare(b.path);
        })
        .map((item) => {
          const name = getSyncedDocumentName(item);
          return {
            path: item.path,
            name,
            size: item.size,
            modifiedAt: item.modifiedAt,
          };
        });

      const message =
        documents.length === 0
          ? "No synced documents found."
          : `Found ${documents.length} ${
              documents.length === 1 ? "document" : "documents"
            }: ${documents.map((document) => document.name).join(", ")}.`;

      return {
        success: true,
        message,
        documents,
      };
    }

    case "read": {
      const path = input.path?.trim() || "";
      const item = state.items[path];
      if (!isActiveDocument(item)) {
        return {
          success: false,
          message: `Document '${path}' not found.`,
        };
      }
      if (!item.uuid) {
        return {
          success: false,
          message: `Document '${path}' is missing synced content metadata.`,
        };
      }

      const content = getDocumentContentAsString(documentsIndex.get(item.uuid));
      if (content === null) {
        return {
          success: false,
          message: "No document data synced yet. Open ryOS and let files sync finish first.",
        };
      }

      const name = getSyncedDocumentName(item);

      return {
        success: true,
        message: `Read document '${name}'.`,
        document: {
          path: item.path,
          name,
          content,
          size: item.size,
          modifiedAt: item.modifiedAt,
        },
      };
    }

    case "write": {
      const path = input.path?.trim() || "";
      const content = input.content ?? "";
      const mode = input.mode || "overwrite";
      const existingItem = state.items[path];
      const existingIsDocument = isActiveDocument(existingItem);

      let baseContent = "";
      if (existingIsDocument) {
        if (!existingItem.uuid) {
          return {
            success: false,
            message: `Document '${path}' is missing synced content metadata.`,
          };
        }
        const currentContent = getDocumentContentAsString(
          documentsIndex.get(existingItem.uuid)
        );
        if (currentContent === null && mode !== "overwrite") {
          return {
            success: false,
            message: `Document '${path}' is missing synced content.`,
          };
        }
        baseContent = currentContent ?? "";
      } else if (existingItem?.isDirectory) {
        return {
          success: false,
          message: `Path '${path}' is a directory, not a document.`,
        };
      }

      const finalContent =
        mode === "append"
          ? `${baseContent}${content}`
          : mode === "prepend"
            ? `${content}${baseContent}`
            : content;

      const now = Date.now();
      const uuid = existingIsDocument ? existingItem.uuid! : crypto.randomUUID();
      const name = getDocumentNameFromPath(path);
      const updatedItem: SyncedFileSystemItem = {
        ...(existingItem || {}),
        path,
        name,
        isDirectory: false,
        uuid,
        size: createDocumentSize(finalContent),
        createdAt: existingIsDocument ? existingItem.createdAt : now,
        modifiedAt: now,
        status: "active",
        type: existingItem?.type || "markdown",
        icon: existingItem?.icon || "/icons/file-text.png",
      };

      const nextDocuments = state.documents
        ? [...state.documents.filter((entry) => entry.key !== uuid)]
        : [];
      nextDocuments.push({
        key: uuid,
        value: {
          name,
          content: finalContent,
        },
      });

      const nextState: FilesMetadataSnapshotData = {
        ...state,
        items: {
          ...state.items,
          [path]: updatedItem,
        },
        libraryState: state.libraryState === "uninitialized" ? "loaded" : state.libraryState,
        documents: nextDocuments,
        deletedPaths: clearDeletionMarkers(state.deletedPaths, [path]),
      };

      await writeFilesMetadataState(context.redis, context.username, nextState);

      context.log(`[documentsControl] Wrote document '${path}' with mode '${mode}'`);
      return {
        success: true,
        message: `${existingIsDocument ? "Updated" : "Created"} document '${name}'.`,
        document: {
          path,
          name,
          content: finalContent,
          size: updatedItem.size,
          modifiedAt: updatedItem.modifiedAt,
        },
      };
    }

    case "edit": {
      const path = input.path?.trim() || "";
      const item = state.items[path];
      if (!isActiveDocument(item)) {
        return {
          success: false,
          message: `Document '${path}' not found.`,
        };
      }
      if (!item.uuid) {
        return {
          success: false,
          message: `Document '${path}' is missing synced content metadata.`,
        };
      }

      const content = getDocumentContentAsString(documentsIndex.get(item.uuid));
      if (content === null) {
        return {
          success: false,
          message: `Document '${path}' is missing synced content.`,
        };
      }

      const oldString = (input.old_string || "").replace(/\r\n?/g, "\n");
      const newString = (input.new_string || "").replace(/\r\n?/g, "\n");
      const normalizedContent = content.replace(/\r\n?/g, "\n");
      const occurrences = normalizedContent.split(oldString).length - 1;

      if (occurrences === 0) {
        return {
          success: false,
          message: "old_string was not found in the document.",
        };
      }

      if (occurrences > 1) {
        return {
          success: false,
          message: `old_string matched ${occurrences} locations. Provide more context so it is unique.`,
        };
      }

      const finalContent = normalizedContent.replace(oldString, newString);
      const now = Date.now();
      const name = getSyncedDocumentName(item);
      const updatedItem: SyncedFileSystemItem = {
        ...item,
        name,
        size: createDocumentSize(finalContent),
        modifiedAt: now,
      };

      const nextDocuments = state.documents
        ? [...state.documents.filter((entry) => entry.key !== item.uuid)]
        : [];
      nextDocuments.push({
        key: item.uuid,
        value: {
          name,
          content: finalContent,
        },
      });

      const nextState: FilesMetadataSnapshotData = {
        ...state,
        items: {
          ...state.items,
          [path]: updatedItem,
        },
        documents: nextDocuments,
        deletedPaths: clearDeletionMarkers(state.deletedPaths, [path]),
      };

      await writeFilesMetadataState(context.redis, context.username, nextState);

      return {
        success: true,
        message: `Edited document '${name}'.`,
        document: {
          path,
          name,
          content: finalContent,
          size: updatedItem.size,
          modifiedAt: updatedItem.modifiedAt,
        },
      };
    }

    default:
      return { success: false, message: `Unknown action: ${action}` };
  }
}

async function readCalendarState(
  redis: Redis,
  username: string
): Promise<CalendarSnapshotData | null> {
  const raw = await redis.get<string | { data: CalendarSnapshotData }>(
    stateKey(username, "calendar")
  );
  if (!raw) return null;
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  return parsed?.data ?? null;
}

async function writeCalendarState(
  redis: Redis,
  username: string,
  data: CalendarSnapshotData
): Promise<void> {
  const now = new Date().toISOString();
  await redis.set(
    stateKey(username, "calendar"),
    JSON.stringify({ data, updatedAt: now, version: 1, createdAt: now })
  );
  const metaKey = redisStateMetaKey(username);
  const rawMeta = await redis.get<string | Record<string, unknown>>(metaKey);
  const meta = typeof rawMeta === "string" ? JSON.parse(rawMeta) : rawMeta || {};
  meta.calendar = { updatedAt: now, version: 1, createdAt: now };
  await redis.set(metaKey, JSON.stringify(meta));
}

async function readStickiesState(
  redis: Redis,
  username: string
): Promise<StickiesSnapshotData | null> {
  const raw = await redis.get<string | { data: StickiesSnapshotData }>(
    stateKey(username, "stickies")
  );
  if (!raw) return null;
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  return parsed?.data ?? null;
}

async function writeStickiesState(
  redis: Redis,
  username: string,
  data: StickiesSnapshotData
): Promise<void> {
  const now = new Date().toISOString();
  await redis.set(
    stateKey(username, "stickies"),
    JSON.stringify({ data, updatedAt: now, version: 1, createdAt: now })
  );
  const metaKey = redisStateMetaKey(username);
  const rawMeta = await redis.get<string | Record<string, unknown>>(metaKey);
  const meta = typeof rawMeta === "string" ? JSON.parse(rawMeta) : rawMeta || {};
  meta.stickies = { updatedAt: now, version: 1, createdAt: now };
  await redis.set(metaKey, JSON.stringify(meta));
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function executeCalendarControl(
  input: CalendarControlInput,
  context: AppStateToolContext
): Promise<CalendarControlOutput> {
  if (!context.username) {
    return { success: false, message: "Authentication required." };
  }
  if (!context.redis) {
    return { success: false, message: "Storage not available." };
  }

  const { action } = input;

  const state = await readCalendarState(context.redis, context.username);
  if (!state) {
    return {
      success: false,
      message: "No calendar data synced yet. Enable cloud sync in ryOS first.",
    };
  }

  switch (action) {
    case "list": {
      let events = state.events;
      if (input.date) {
        events = events.filter((ev) => ev.date === input.date);
      }
      const formatted = events.map((ev) => ({
        id: ev.id,
        title: ev.title,
        date: ev.date,
        startTime: ev.startTime,
        endTime: ev.endTime,
        color: ev.color,
        notes: ev.notes,
      }));
      return {
        success: true,
        message: input.date
          ? `Found ${formatted.length} ${formatted.length === 1 ? "event" : "events"} for ${input.date}.`
          : `Found ${formatted.length} ${formatted.length === 1 ? "event" : "events"} total.`,
        events: formatted,
      };
    }

    case "create": {
      if (!input.title || !input.date) {
        return { success: false, message: "Creating an event requires 'title' and 'date'." };
      }
      const now = Date.now();
      const newEvent = {
        id: generateId(),
        title: input.title,
        date: input.date,
        startTime: input.startTime,
        endTime: input.endTime,
        color: input.color || "blue",
        calendarId: input.calendarId,
        notes: input.notes,
        createdAt: now,
        updatedAt: now,
      };
      state.events.push(newEvent);
      await writeCalendarState(context.redis, context.username, state);
      context.log(`[calendarControl] Created event "${input.title}" on ${input.date}`);
      return {
        success: true,
        message: `Created event "${input.title}" on ${input.date}.`,
        event: {
          id: newEvent.id,
          title: newEvent.title,
          date: newEvent.date,
          startTime: newEvent.startTime,
          endTime: newEvent.endTime,
          color: newEvent.color,
          notes: newEvent.notes,
        },
      };
    }

    case "update": {
      if (!input.id) {
        return { success: false, message: "Updating an event requires 'id'." };
      }
      const idx = state.events.findIndex((ev) => ev.id === input.id);
      if (idx === -1) {
        return { success: false, message: `Event with id '${input.id}' not found.` };
      }
      const ev = state.events[idx];
      if (input.title !== undefined) ev.title = input.title;
      if (input.date !== undefined) ev.date = input.date;
      if (input.startTime !== undefined) ev.startTime = input.startTime;
      if (input.endTime !== undefined) ev.endTime = input.endTime;
      if (input.color !== undefined) ev.color = input.color;
      if (input.notes !== undefined) ev.notes = input.notes;
      ev.updatedAt = Date.now();
      await writeCalendarState(context.redis, context.username, state);
      return { success: true, message: `Updated event "${ev.title}".` };
    }

    case "delete": {
      if (!input.id) {
        return { success: false, message: "Deleting an event requires 'id'." };
      }
      const delIdx = state.events.findIndex((ev) => ev.id === input.id);
      if (delIdx === -1) {
        return { success: false, message: `Event with id '${input.id}' not found.` };
      }
      const deleted = state.events.splice(delIdx, 1)[0];
      state.deletedEventIds = addDeletionMarkers(
        state.deletedEventIds,
        [deleted.id],
        new Date().toISOString()
      );
      await writeCalendarState(context.redis, context.username, state);
      return { success: true, message: `Deleted event "${deleted.title}".` };
    }

    case "listTodos": {
      let todos = state.todos;
      if (input.completed === true) {
        todos = todos.filter((t) => t.completed);
      }
      return {
        success: true,
        message: `Found ${todos.length} ${todos.length === 1 ? "todo" : "todos"}.`,
        todos: todos.map((t) => ({
          id: t.id,
          title: t.title,
          completed: t.completed,
          dueDate: t.dueDate,
          calendarId: t.calendarId,
        })),
      };
    }

    case "createTodo": {
      if (!input.title) {
        return { success: false, message: "Creating a todo requires 'title'." };
      }
      const calendarId = input.calendarId || state.calendars[0]?.id || "home";
      const newTodo = {
        id: generateId(),
        title: input.title,
        completed: false,
        dueDate: input.date || null,
        calendarId,
        createdAt: Date.now(),
      };
      state.todos.push(newTodo);
      await writeCalendarState(context.redis, context.username, state);
      context.log(`[calendarControl] Created todo "${input.title}"`);
      return {
        success: true,
        message: `Created todo "${input.title}"${input.date ? ` due ${input.date}` : ""}.`,
        todo: {
          id: newTodo.id,
          title: newTodo.title,
          completed: false,
          dueDate: newTodo.dueDate,
          calendarId,
        },
      };
    }

    case "toggleTodo": {
      if (!input.id) {
        return { success: false, message: "Toggling a todo requires 'id'." };
      }
      const todo = state.todos.find((t) => t.id === input.id);
      if (!todo) {
        return { success: false, message: `Todo with id '${input.id}' not found.` };
      }
      todo.completed = !todo.completed;
      await writeCalendarState(context.redis, context.username, state);
      return {
        success: true,
        message: `Marked todo "${todo.title}" as ${todo.completed ? "completed" : "pending"}.`,
        todo: {
          id: todo.id,
          title: todo.title,
          completed: todo.completed,
          dueDate: todo.dueDate,
          calendarId: todo.calendarId,
        },
      };
    }

    case "deleteTodo": {
      if (!input.id) {
        return { success: false, message: "Deleting a todo requires 'id'." };
      }
      const todoIdx = state.todos.findIndex((t) => t.id === input.id);
      if (todoIdx === -1) {
        return { success: false, message: `Todo with id '${input.id}' not found.` };
      }
      const deletedTodo = state.todos.splice(todoIdx, 1)[0];
      state.deletedTodoIds = addDeletionMarkers(
        state.deletedTodoIds,
        [deletedTodo.id],
        new Date().toISOString()
      );
      await writeCalendarState(context.redis, context.username, state);
      return { success: true, message: `Deleted todo "${deletedTodo.title}".` };
    }

    default:
      return { success: false, message: `Unknown action: ${action}` };
  }
}

export async function executeStickiesControl(
  input: StickiesControlInput,
  context: AppStateToolContext
): Promise<StickiesControlOutput> {
  if (!context.username) {
    return { success: false, message: "Authentication required." };
  }
  if (!context.redis) {
    return { success: false, message: "Storage not available." };
  }

  const { action } = input;

  const state = await readStickiesState(context.redis, context.username);
  if (!state && action !== "create") {
    return {
      success: false,
      message: "No stickies data synced yet. Enable cloud sync in ryOS first.",
    };
  }

  const notes = state?.notes ?? [];

  switch (action) {
    case "list": {
      if (notes.length === 0) {
        return { success: true, message: "No stickies found." };
      }
      return {
        success: true,
        message: `Found ${notes.length} ${notes.length === 1 ? "sticky note" : "sticky notes"}.`,
        notes: notes.map((n) => ({
          id: n.id,
          content: n.content,
          color: n.color as StickyColor,
          position: n.position,
          size: n.size,
        })),
      };
    }

    case "create": {
      const now = Date.now();
      const newNote = {
        id: generateId(),
        content: input.content || "",
        color: input.color || "yellow",
        position: input.position || { x: 100 + Math.random() * 200, y: 100 + Math.random() * 200 },
        size: input.size || { width: 200, height: 200 },
        createdAt: now,
        updatedAt: now,
      };
      const updatedNotes = [...notes, newNote];
      await writeStickiesState(context.redis, context.username!, {
        ...(state || {}),
        notes: updatedNotes,
      });
      context.log(`[stickiesControl] Created sticky note (${input.color || "yellow"})`);
      return {
        success: true,
        message: `Created ${input.color || "yellow"} sticky note.`,
        note: {
          id: newNote.id,
          content: newNote.content,
          color: newNote.color as StickyColor,
          position: newNote.position,
          size: newNote.size,
        },
      };
    }

    case "update": {
      if (!input.id) {
        return { success: false, message: "Updating a sticky requires 'id'." };
      }
      const noteIdx = notes.findIndex((n) => n.id === input.id);
      if (noteIdx === -1) {
        return { success: false, message: `Sticky with id '${input.id}' not found.` };
      }
      const note = { ...notes[noteIdx] };
      if (input.content !== undefined) note.content = input.content;
      if (input.color !== undefined) note.color = input.color;
      if (input.position !== undefined) note.position = input.position;
      if (input.size !== undefined) note.size = input.size;
      note.updatedAt = Date.now();
      const updatedList = [...notes];
      updatedList[noteIdx] = note;
      await writeStickiesState(context.redis, context.username!, {
        ...state,
        notes: updatedList,
      });
      return { success: true, message: "Updated sticky note." };
    }

    case "delete": {
      if (!input.id) {
        return { success: false, message: "Deleting a sticky requires 'id'." };
      }
      const delIdx = notes.findIndex((n) => n.id === input.id);
      if (delIdx === -1) {
        return { success: false, message: `Sticky with id '${input.id}' not found.` };
      }
      const filtered = notes.filter((n) => n.id !== input.id);
      await writeStickiesState(context.redis, context.username!, {
        ...state,
        notes: filtered,
        deletedNoteIds: addDeletionMarkers(
          state?.deletedNoteIds,
          [input.id],
          new Date().toISOString()
        ),
      });
      return { success: true, message: "Deleted sticky note." };
    }

    case "clear": {
      if (notes.length === 0) {
        return { success: true, message: "No stickies to clear." };
      }
      const count = notes.length;
      await writeStickiesState(context.redis, context.username!, {
        ...state,
        notes: [],
        deletedNoteIds: addDeletionMarkers(
          state?.deletedNoteIds,
          notes.map((note) => note.id),
          new Date().toISOString()
        ),
      });
      return { success: true, message: `Cleared ${count} ${count === 1 ? "sticky note" : "sticky notes"}.` };
    }

    default:
      return { success: false, message: `Unknown action: ${action}` };
  }
}

function toContactsDraft(input: ContactsControlInput): ContactDraft {
  return {
    displayName: input.displayName,
    firstName: input.firstName,
    lastName: input.lastName,
    nickname: input.nickname,
    organization: input.organization,
    title: input.title,
    notes: input.notes,
    emails: input.emails,
    phones: input.phones,
    urls: input.urls,
    addresses: input.addresses,
    birthday: input.birthday,
    telegramUsername: input.telegramUsername,
    telegramUserId: input.telegramUserId,
    source: "ai",
  };
}

export async function executeContactsControl(
  input: ContactsControlInput,
  context: AppStateToolContext
): Promise<ContactsControlOutput> {
  if (!context.username) {
    return { success: false, message: "Authentication required." };
  }
  if (!context.redis) {
    return { success: false, message: "Storage not available." };
  }

  const state: ContactsSnapshotData = await readContactsState(
    context.redis,
    context.username
  );

  switch (input.action) {
    case "list": {
      const contacts = input.query
        ? state.contacts.filter((contact) =>
            contactMatchesQuery(contact, input.query || "")
          )
        : state.contacts;

      return {
        success: true,
        message:
          contacts.length === 0
            ? "No contacts found."
            : `Found ${contacts.length} ${
                contacts.length === 1 ? "contact" : "contacts"
              }.`,
        contacts: contacts.map(serializeContactForTool),
      };
    }

    case "get": {
      const contact = state.contacts.find((item) => item.id === input.id);
      if (!contact) {
        return {
          success: false,
          message: `Contact with id '${input.id}' not found.`,
        };
      }

      return {
        success: true,
        message: `Loaded contact "${contact.displayName}".`,
        contact: serializeContactForTool(contact),
      };
    }

    case "create": {
      const contact = createContactFromDraft(toContactsDraft(input));
      await writeContactsState(context.redis, context.username, {
        ...state,
        contacts: sortContacts([...state.contacts, contact]),
      });
      context.log(
        `[contactsControl] Created contact "${contact.displayName}" (${getContactSummary(contact)})`
      );
      return {
        success: true,
        message: `Created contact "${contact.displayName}".`,
        contact: serializeContactForTool(contact),
      };
    }

    case "update": {
      const index = state.contacts.findIndex((item) => item.id === input.id);
      if (index === -1) {
        return {
          success: false,
          message: `Contact with id '${input.id}' not found.`,
        };
      }

      const updated = updateContactFromDraft(
        state.contacts[index],
        toContactsDraft(input)
      );
      const nextContacts = [...state.contacts];
      nextContacts[index] = updated;

      await writeContactsState(context.redis, context.username, {
        ...state,
        contacts: sortContacts(nextContacts),
      });

      return {
        success: true,
        message: `Updated contact "${updated.displayName}".`,
        contact: serializeContactForTool(updated),
      };
    }

    case "delete": {
      const contact = state.contacts.find((item) => item.id === input.id);
      if (!contact) {
        return {
          success: false,
          message: `Contact with id '${input.id}' not found.`,
        };
      }

      await writeContactsState(context.redis, context.username, {
        ...state,
        contacts: state.contacts.filter((item) => item.id !== input.id),
        myContactId: state.myContactId === input.id ? null : state.myContactId,
        deletedContactIds: addDeletionMarkers(
          state.deletedContactIds,
          [input.id],
          new Date().toISOString()
        ),
      });

      return {
        success: true,
        message: `Deleted contact "${contact.displayName}".`,
      };
    }
  }

  return { success: false, message: `Unknown action: ${input.action}` };
}
