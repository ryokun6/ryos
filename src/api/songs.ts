import {
  apiRequest,
  apiRequestRaw,
  type ApiRequestOptions,
} from "@/api/core";

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

export interface SongActionOptions {
  signal?: AbortSignal;
  timeout?: number;
  retry?: ApiRequestOptions["retry"];
}

export async function postSongActionRaw<TPayload extends Record<string, unknown>>(
  songId: string,
  payload: TPayload,
  options: SongActionOptions = {}
): Promise<Response> {
  return apiRequestRaw<TPayload>({
    path: `/api/songs/${encodeURIComponent(songId)}`,
    method: "POST",
    body: payload,
    signal: options.signal,
    timeout: options.timeout ?? 15000,
    retry: options.retry ?? { maxAttempts: 1, initialDelayMs: 250 },
  });
}

export async function postSongAction<
  TResponse,
  TPayload extends Record<string, unknown>,
>(
  songId: string,
  payload: TPayload,
  options: SongActionOptions = {}
): Promise<TResponse> {
  return apiRequest<TResponse, TPayload>({
    path: `/api/songs/${encodeURIComponent(songId)}`,
    method: "POST",
    body: payload,
    signal: options.signal,
    timeout: options.timeout ?? 15000,
    retry: options.retry ?? { maxAttempts: 1, initialDelayMs: 250 },
  });
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

export async function updateSongById<TPayload extends Record<string, unknown>>(
  songId: string,
  payload: TPayload,
  _auth: SongsAuthContext
): Promise<SongSaveResponse> {
  return apiRequest<SongSaveResponse, TPayload>({
    path: `/api/songs/${encodeURIComponent(songId)}`,
    method: "POST",
    body: payload,
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

export async function searchSongLyrics<TResponse = Record<string, unknown>>(
  songId: string,
  query: string,
  options: SongActionOptions = {}
): Promise<TResponse> {
  return postSongAction<TResponse, { action: "search-lyrics"; query: string }>(
    songId,
    {
      action: "search-lyrics",
      query,
    },
    options
  );
}

export async function fetchSongLyrics<TResponse = Record<string, unknown>>(
  songId: string,
  payload: {
    title?: string;
    force?: boolean;
    returnMetadata?: boolean;
    lyricsSource?: SongLyricsSource;
  },
  options: SongActionOptions = {}
): Promise<TResponse> {
  return postSongAction<
    TResponse,
    {
      action: "fetch-lyrics";
      title?: string;
      force?: boolean;
      returnMetadata?: boolean;
      lyricsSource?: SongLyricsSource;
    }
  >(
    songId,
    {
      action: "fetch-lyrics",
      ...payload,
    },
    options
  );
}

export async function clearSongCachedData(
  songId: string,
  payload: {
    clearTranslations?: boolean;
    clearFurigana?: boolean;
    clearSoramimi?: boolean;
  } = {}
): Promise<{ success?: boolean }> {
  return postSongAction<
    { success?: boolean },
    {
      action: "clear-cached-data";
      clearTranslations?: boolean;
      clearFurigana?: boolean;
      clearSoramimi?: boolean;
    }
  >(songId, {
    action: "clear-cached-data",
    ...payload,
  });
}

export async function clearSongLyrics(
  songId: string
): Promise<{ success?: boolean }> {
  return postSongAction<{ success?: boolean }, { clearLyrics: true }>(songId, {
    clearLyrics: true,
  });
}

export async function unshareSong(
  songId: string
): Promise<{ success?: boolean }> {
  return postSongAction<{ success?: boolean }, { action: "unshare" }>(songId, {
    action: "unshare",
  });
}

