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
import type {
  ServerToolContext,
  GenerateHtmlInput,
  GenerateHtmlOutput,
  SearchSongsInput,
  SearchSongsOutput,
  MemoryWriteInput,
  MemoryWriteOutput,
  MemoryReadInput,
  MemoryReadOutput,
  MemoryDeleteInput,
  MemoryDeleteOutput,
  DocumentsControlInput,
  DocumentsControlOutput,
  SongLibraryControlInput,
  SongLibraryControlOutput,
  SongLibraryToolRecord,
  SongLibraryScope,
  SongLibraryLyricsSource,
  WebFetchInput,
  WebFetchOutput,
} from "./types.js";
import {
  readFilesMetadataToolState,
  writeFilesMetadataToolState,
} from "../../sync/v2/_tool-state.js";
import { getAppPublicOrigin } from "../../_utils/runtime-config.js";
import { extractMetadata, stripHtmlToText } from "./htmlExtract.js";
import { checkToolRateLimit } from "./_tool-rate-limit.js";
import {
  getYouTubeApiKeys,
  toSearchSongsResult,
  youtubeSearch,
} from "../../_utils/youtube-client.js";
import { readSongsState, writeSongsState } from "../../_utils/song-library-state.js";
import {
  getSong,
  listSongs as listCachedSongs,
  saveSong,
  type LyricsSource,
  type SongDocument,
} from "../../_utils/_song-service.js";
import { parseYouTubeTitleSimple } from "../../_utils/parse-youtube-title.js";
import {
  getMemoryIndex,
  getMemoryDetail,
  upsertMemory,
  deleteMemory,
  appendDailyNote,
  getDailyNote,
  getTodayDateString,
  normalizeMemoryKey,
  withCurrentAccountMemoryMutation,
} from "../../_utils/_memory.js";

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
  context: ServerToolContext & { username?: string | null; redis?: Redis }
): Promise<SearchSongsOutput> {
  const { query, maxResults = 5 } = input;
  
  context.log(`[searchSongs] Searching for: "${query}" (max ${maxResults} results)`);

  const rateLimit = await checkToolRateLimit("searchSongs", context);
  if (!rateLimit.allowed) {
    return { results: [], message: rateLimit.message! };
  }

  const apiKeys = getYouTubeApiKeys(context.env);

  if (apiKeys.length === 0) {
    throw new Error("No YouTube API keys configured");
  }

  context.log(`[searchSongs] Available API keys: ${apiKeys.length}`);

  const result = await youtubeSearch(
    {
      query,
      maxResults,
      category: "music",
      videoEmbeddable: false,
    },
    {
      apiKeys,
      timeoutMs: 15000,
      onKeyAttempt: ({ keyIndex, keyLabel }) => {
        context.log(
          `[searchSongs] Trying ${keyLabel} API key (${keyIndex + 1}/${apiKeys.length})`
        );
      },
    }
  );

  if (!result.ok) {
    context.logError("[searchSongs] YouTube search failed", result);
    if (result.reason === "quota_exhausted") {
      throw new Error(
        `All YouTube API keys exhausted. Last error: ${result.message || "Unknown"}`
      );
    }
    if (result.status) {
      throw new Error(`Failed to search for songs: YouTube search failed: ${result.status}`);
    }
    throw new Error(`Failed to search for songs: ${result.message || "Unknown error"}`);
  }

  if (result.hits.length === 0) {
    return {
      results: [],
      message: `No songs found for "${query}"`,
    };
  }

  const results = result.hits.map(toSearchSongsResult);
  context.log(
    `[searchSongs] Found ${results.length} results for "${query}" using ${result.keyLabel} key`
  );

  return {
    results,
    message: `Found ${results.length} ${results.length === 1 ? "song" : "songs"} for "${query}"`,
    hint: "Use mediaControl with action 'addAndPlay' and the videoId to add a song to the iPod",
  };
}
// ============================================================================
// Web Fetch Tool Executor
// ============================================================================

import {
  safeFetchWithRedirects,
  validatePublicUrl,
  SsrfBlockedError,
} from "../../_utils/_ssrf.js";
export {
  executeCalendarControl,
  executeContactsControl,
  executeStickiesControl,
} from "./app-state-executors.js";

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

// Pure HTML→text + metadata helpers live in ./htmlExtract.js so they can be
// unit-tested without pulling this module's server-only imports.

export async function executeWebFetch(
  input: WebFetchInput,
  context: ServerToolContext & { username?: string | null; redis?: Redis }
): Promise<WebFetchOutput> {
  const { url, selector } = input;

  context.log(`[webFetch] Fetching: ${url}${selector ? ` (selector: ${selector})` : ""}`);

  const rateLimit = await checkToolRateLimit("webFetch", context);
  if (!rateLimit.allowed) {
    return {
      success: false,
      url,
      content: "",
      contentLength: 0,
      truncated: false,
      message: rateLimit.message!,
    };
  }

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
    coverColor?: string;
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
    ...(track.coverColor ? { coverColor: track.coverColor } : {}),
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
    ...(song.coverColor ? { coverColor: song.coverColor } : {}),
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
    coverColor: userRecord.coverColor ?? globalRecord.coverColor,
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
        coverColor: track.coverColor,
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
      ...(savedSong.coverColor ? { coverColor: savedSong.coverColor } : {}),
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
        coverColor: savedSong.coverColor,
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
  accountCreatedAt?: number;
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
  const redis = context.redis;
  const username = context.username;

  try {
    // Route to the appropriate handler
    if (type === "daily") {
      context.log(`[memoryWrite:daily] Logging daily note (${content.length} chars)`);
      const mutation = await withCurrentAccountMemoryMutation({
        redis,
        username,
        accountCreatedAt: context.accountCreatedAt,
        mutation: () =>
          appendDailyNote(
            redis,
            username,
            content,
            { timeZone: context.timeZone },
          ),
      });
      if (mutation.status === "account_changed") {
        return {
          success: false,
          message: "Memory write rejected because the account changed. Please retry.",
        };
      }
      const result = mutation.value;

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

    const mutation = await withCurrentAccountMemoryMutation({
      redis,
      username,
      accountCreatedAt: context.accountCreatedAt,
      mutation: async () => {
        const result = await upsertMemory(
          redis,
          username,
          key,
          summary,
          content,
          mode
        );
        const index = await getMemoryIndex(redis, username);
        return {
          result,
          currentMemories:
            index?.memories.map((memory) => ({
              key: memory.key,
              summary: memory.summary,
            })) || [],
        };
      },
    });
    if (mutation.status === "account_changed") {
      return {
        success: false,
        message: "Memory write rejected because the account changed. Please retry.",
      };
    }
    const { result, currentMemories } = mutation.value;

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

    const normalizedKey = normalizeMemoryKey(key);
    const index = await getMemoryIndex(context.redis, context.username);
    const entry = index?.memories.find((memory) => memory.key === normalizedKey);

    if (!entry) {
      context.log(`[memoryRead:long_term] Memory "${key}" not found`);
      return {
        success: false,
        message: `Memory "${key}" not found.`,
        key,
        content: null,
        summary: null,
      };
    }

    const detail = await getMemoryDetail(
      context.redis,
      context.username,
      normalizedKey
    );

    if (!detail) {
      context.log(`[memoryRead:long_term] Memory "${key}" has no detail`);
      return {
        success: false,
        message: `Memory "${key}" not found.`,
        key,
        content: null,
        summary: null,
      };
    }

    context.log(
      `[memoryRead:long_term] Found memory "${key}" (${detail.content.length} chars)`
    );

    return {
      success: true,
      message: `Retrieved memory "${key}".`,
      key,
      content: detail.content,
      summary: entry.summary,
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
  const redis = context.redis;
  const username = context.username;

  try {
    const mutation = await withCurrentAccountMemoryMutation({
      redis,
      username,
      accountCreatedAt: context.accountCreatedAt,
      mutation: () => deleteMemory(redis, username, key),
    });
    if (mutation.status === "account_changed") {
      return {
        success: false,
        message: "Memory delete rejected because the account changed. Please retry.",
      };
    }
    const result = mutation.value;

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

async function readFilesMetadataState(
  redis: Redis,
  username: string
): Promise<FilesMetadataSnapshotData | null> {
  return (await readFilesMetadataToolState(
    redis,
    username
  )) as FilesMetadataSnapshotData | null;
}

async function writeFilesMetadataState(
  redis: Redis,
  username: string,
  data: FilesMetadataSnapshotData
): Promise<void> {
  await writeFilesMetadataToolState(redis, username, {
    items: data.items as unknown as Record<string, Record<string, unknown>>,
    libraryState: data.libraryState,
    documents: (data.documents || []) as unknown as Array<
      Record<string, unknown>
    >,
  });
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
