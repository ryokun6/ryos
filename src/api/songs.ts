import { apiRequest, apiRequestRaw, type ApiRequestOptions } from "@/api/core";

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

export async function getSongById<TSong = Record<string, unknown>>(
  songId: string,
  options: { include?: string; signal?: AbortSignal } = {}
): Promise<TSong> {
  return apiRequest<TSong>({
    path: `/api/songs/${encodeURIComponent(songId)}`,
    method: "GET",
    query: { include: options.include || "metadata" },
    signal: options.signal,
  });
}

export async function updateSongById<TPayload extends object>(
  songId: string,
  payload: TPayload,
  _auth?: SongsAuthContext
): Promise<SongSaveResponse> {
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

  return apiRequest<FetchSongLyricsResponse>({
    path: `/api/songs/${encodeURIComponent(songId)}`,
    method: "POST",
    body: {
      action: "fetch-lyrics",
      ...body,
    },
    signal,
    timeout,
    retry,
  });
}

export async function clearSongCachedData(
  songId: string,
  options: {
    clearTranslations?: boolean;
    clearFurigana?: boolean;
    clearSoramimi?: boolean;
  } = {}
): Promise<Record<string, unknown>> {
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

