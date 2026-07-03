import { apiRequest, apiRequestRaw, type ApiRequestOptions } from "@/api/core";
import { createClientLogger } from "@/utils/logger";
import type { ChineseLyricsLanguage } from "@/shared/media/chineseLyrics";

const lyricsApiLog = createClientLogger("LyricsApi");

/** Auth context for cookie-based auth (credentials sent automatically via credentials: "include") */
export interface SongsAuthContext {
  username: string;
  isAuthenticated: boolean;
}

export interface SongListQuery {
  include?: string;
  createdBy?: string;
  ids?: string[];
}

export interface SongSaveResponse {
  success: boolean;
  id?: string;
  isUpdate?: boolean;
  createdBy?: string;
  error?: string;
}

export interface SongDeleteAllResponse {
  success: boolean;
  deleted: number;
  error?: string;
}

export interface SongImportBatchResult {
  ok: boolean;
  status: number;
  retryAfterSeconds?: number;
  data?: Record<string, unknown>;
}

export interface SongLyricsSource {
  hash: string;
  albumId: string | number;
  title: string;
  artist: string;
  album?: string;
}

export interface SongMetadataPatch {
  title?: string;
  artist?: string;
  album?: string;
  cover?: string;
  coverColor?: string;
  lyricOffset?: number;
  lyricsSource?: SongLyricsSource;
  clearTranslations?: boolean;
  clearFurigana?: boolean;
  clearSoramimi?: boolean;
  clearLyrics?: boolean;
  isShare?: boolean;
}

export interface SongParsedLyricLine {
  startTimeMs: string;
  words: string;
  wordTimings?: Array<{
    text: string;
    startTimeMs: number;
    durationMs: number;
  }>;
}

export interface FetchSongLyricsParams {
  force?: boolean;
  title?: string;
  artist?: string;
  translateTo?: string;
  lyricsLanguage?: ChineseLyricsLanguage;
  includeFurigana?: boolean;
  includeSoramimi?: boolean;
  soramimiTargetLanguage?: "zh-TW" | "en";
  lyricsSource?: SongLyricsSource;
  returnMetadata?: boolean;
  signal?: AbortSignal;
  timeout?: number;
  retry?: ApiRequestOptions["retry"];
}

export interface FetchSongLyricsResponse {
  lyrics?: {
    lrc: string;
    krc?: string;
    parsedLines?: SongParsedLyricLine[];
  };
  cached?: boolean;
  translation?: unknown;
  furigana?: unknown;
  soramimi?: unknown;
  metadata?: {
    title?: string;
    artist?: string;
    album?: string;
    cover?: string;
    coverColor?: string;
    lyricsSource?: SongLyricsSource;
  };
}

export async function listSongs<TSong = Record<string, unknown>>(
  query: SongListQuery = {}
): Promise<{ songs: TSong[] }> {
  const include = query.include || "metadata";
  return apiRequest<{ songs: TSong[] }>({
    path: "/api/songs",
    method: "GET",
    query: {
      include,
      createdBy: query.createdBy,
      ids: query.ids?.length ? query.ids.join(",") : undefined,
    },
  });
}

export interface SongsVersionInfo {
  /** Highest updatedAt/createdAt across matching songs. */
  version: number;
  /** Number of matching songs. */
  count: number;
}

/**
 * Lightweight catalog version probe (`include=version`) — ~50 bytes instead
 * of the full metadata list. Used by pollers to decide whether a full fetch
 * is needed.
 */
export async function fetchSongsVersion(
  createdBy?: string
): Promise<SongsVersionInfo> {
  return apiRequest<SongsVersionInfo>({
    path: "/api/songs",
    method: "GET",
    query: { include: "version", createdBy },
  });
}

export async function getSongById<TSong = Record<string, unknown>>(
  songId: string,
  options: {
    include?: string;
    lyricsLanguage?: ChineseLyricsLanguage;
    signal?: AbortSignal;
  } = {}
): Promise<TSong> {
  return apiRequest<TSong>({
    path: `/api/songs/${encodeURIComponent(songId)}`,
    method: "GET",
    query: {
      include: options.include || "metadata",
      lyricsLanguage: options.lyricsLanguage,
    },
    signal: options.signal,
  });
}

export async function updateSongById<TPayload extends object>(
  songId: string,
  payload: TPayload,
  _auth?: SongsAuthContext
): Promise<SongSaveResponse> {
  // Any song mutation may change lyrics/timings — drop cached responses.
  invalidateLyricsCacheForSong(songId);
  return apiRequest<SongSaveResponse, TPayload>({
    path: `/api/songs/${encodeURIComponent(songId)}`,
    method: "POST",
    body: payload,
  });
}

export async function patchSongMetadata(
  songId: string,
  payload: SongMetadataPatch,
  auth?: SongsAuthContext
): Promise<SongSaveResponse> {
  return updateSongById(songId, payload, auth);
}

// ---------------------------------------------------------------------------
// fetch-lyrics dedup cache
//
// The same song's lyrics are requested from several places (track import,
// playback, fullscreen, StrictMode double-effects). Identical requests within
// a short window share one in-flight promise and a small TTL response cache.
// `force: true` bypasses and invalidates all entries for that song.
// ---------------------------------------------------------------------------
const LYRICS_CACHE_TTL_MS = 5 * 60 * 1000;
const LYRICS_CACHE_MAX_ENTRIES = 12;

const lyricsResponseCache = new Map<
  string,
  { at: number; data: FetchSongLyricsResponse }
>();
const lyricsInFlight = new Map<string, Promise<FetchSongLyricsResponse>>();

function lyricsCacheKey(songId: string, body: Record<string, unknown>): string {
  // Sort keys so logically-identical param objects produce the same key.
  const stable = Object.keys(body)
    .sort()
    .map((k) => `${k}:${JSON.stringify(body[k])}`)
    .join("|");
  return `${songId}\u001f${stable}`;
}

function invalidateLyricsCacheForSong(songId: string): void {
  const prefix = `${songId}\u001f`;
  for (const key of lyricsResponseCache.keys()) {
    if (key.startsWith(prefix)) lyricsResponseCache.delete(key);
  }
}

/** Wait for `promise` but reject early if the caller's signal aborts. */
function raceWithSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) {
    return Promise.reject(new DOMException("Aborted", "AbortError"));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () =>
      reject(new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      }
    );
  });
}

export async function fetchSongLyrics(
  songId: string,
  params: FetchSongLyricsParams = {}
): Promise<FetchSongLyricsResponse> {
  const {
    signal,
    timeout = 15000,
    retry = { maxAttempts: 3, initialDelayMs: 1000, backoffMultiplier: 2 },
    ...body
  } = params;

  const key = lyricsCacheKey(songId, body);
  const requestContext = {
    songId,
    force: Boolean(body.force),
    hasTitle: Boolean(body.title),
    hasArtist: Boolean(body.artist),
    hasLyricsSource: Boolean(body.lyricsSource),
    translateTo: body.translateTo,
    lyricsLanguage: body.lyricsLanguage,
    includeFurigana: Boolean(body.includeFurigana),
    includeSoramimi: Boolean(body.includeSoramimi),
    soramimiTargetLanguage: body.soramimiTargetLanguage,
    returnMetadata: Boolean(body.returnMetadata),
  };

  if (body.force) {
    // Forced refetch (e.g. changing lyrics source): drop every cached
    // variant for this song so subsequent reads see the new content.
    invalidateLyricsCacheForSong(songId);
    lyricsApiLog.debug("Cleared cached lyrics responses for forced fetch", {
      songId,
    });
  } else {
    const cached = lyricsResponseCache.get(key);
    if (cached && Date.now() - cached.at < LYRICS_CACHE_TTL_MS) {
      lyricsApiLog.debug("Using lyrics response from memory", {
        ...requestContext,
        ageMs: Date.now() - cached.at,
      });
      return cached.data;
    }
    const inFlight = lyricsInFlight.get(key);
    if (inFlight) {
      lyricsApiLog.debug("Reusing active lyrics request", requestContext);
      // Share the request, but honor this caller's own abort signal without
      // cancelling the request for other awaiters.
      return raceWithSignal(inFlight, signal);
    }
  }

  // The shared request deliberately runs without the caller's signal —
  // aborting one awaiter must not cancel it for the others. Callers race
  // against their own signal instead.
  lyricsApiLog.debug("Requesting lyrics from the songs API", requestContext);
  const requestPromise = apiRequest<FetchSongLyricsResponse>({
    path: `/api/songs/${encodeURIComponent(songId)}`,
    method: "POST",
    body: {
      action: "fetch-lyrics",
      ...body,
    },
    timeout,
    retry,
  })
    .then((data) => {
      lyricsApiLog.debug("Songs API returned lyrics", {
        ...requestContext,
        cached: data.cached ?? false,
        lineCount: data.lyrics?.parsedLines?.length ?? 0,
        hasMetadata: Boolean(data.metadata),
        hasTranslation: Boolean(data.translation),
        hasFurigana: Boolean(data.furigana),
        hasSoramimi: Boolean(data.soramimi),
      });
      lyricsResponseCache.set(key, { at: Date.now(), data });
      // Simple LRU-ish cap: drop the oldest insertion order entries.
      while (lyricsResponseCache.size > LYRICS_CACHE_MAX_ENTRIES) {
        const oldest = lyricsResponseCache.keys().next().value;
        if (oldest === undefined) break;
        lyricsResponseCache.delete(oldest);
      }
      return data;
    })
    .catch((error) => {
      lyricsApiLog.debug("Songs API lyrics request failed", {
        error,
        ...requestContext,
      });
      throw error;
    })
    .finally(() => {
      lyricsInFlight.delete(key);
    });

  if (!body.force) {
    lyricsInFlight.set(key, requestPromise);
  }

  return raceWithSignal(requestPromise, signal);
}

/** Test-only helper: reset the fetch-lyrics dedup caches. */
export function __clearLyricsCachesForTests(): void {
  lyricsResponseCache.clear();
  lyricsInFlight.clear();
}

export async function clearSongCachedData(
  songId: string,
  options: {
    clearTranslations?: boolean;
    clearFurigana?: boolean;
    clearSoramimi?: boolean;
  } = {}
): Promise<Record<string, unknown>> {
  invalidateLyricsCacheForSong(songId);
  return apiRequest<Record<string, unknown>>({
    path: `/api/songs/${encodeURIComponent(songId)}`,
    method: "POST",
    body: {
      action: "clear-cached-data",
      clearTranslations: options.clearTranslations ?? true,
      clearFurigana: options.clearFurigana ?? true,
      clearSoramimi: options.clearSoramimi ?? true,
    },
  });
}

export async function deleteSongById(
  songId: string,
  _auth: SongsAuthContext
): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>({
    path: `/api/songs/${encodeURIComponent(songId)}`,
    method: "DELETE",
  });
}

export async function deleteAllSongs(
  _auth: SongsAuthContext
): Promise<SongDeleteAllResponse> {
  return apiRequest<SongDeleteAllResponse>({
    path: "/api/songs",
    method: "DELETE",
  });
}

export async function importSongsBatch(params: {
  songs: Record<string, unknown>[];
  auth: SongsAuthContext;
  timeout?: number;
}): Promise<SongImportBatchResult> {
  const response = await apiRequestRaw({
    path: "/api/songs",
    method: "POST",
    body: { action: "import", songs: params.songs },
    timeout: params.timeout ?? 30000,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });

  let data: Record<string, unknown> | undefined;
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    data = undefined;
  }

  const retryAfterHeader = response.headers.get("Retry-After");
  const retryAfterSeconds = retryAfterHeader
    ? Number.parseInt(retryAfterHeader, 10)
    : NaN;

  return {
    ok: response.ok,
    status: response.status,
    retryAfterSeconds:
      Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? retryAfterSeconds
        : undefined,
    data,
  };
}

