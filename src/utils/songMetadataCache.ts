/**
 * Song metadata cache utilities
 * 
 * Provides functions to save and retrieve song metadata from Redis cache.
 * Used by iPod and Karaoke apps to share song metadata between users.
 * 
 * Uses the unified /api/songs endpoint.
 */

import { getApiUrl } from "./platform";
import { abortableFetch } from "./abortableFetch";

const BULK_IMPORT_BATCH_SIZE = 100;
const BULK_IMPORT_MAX_PAYLOAD_BYTES = 3_500_000;
const BULK_IMPORT_MAX_RATE_LIMIT_RETRIES = 4;
const bulkImportTextEncoder = new TextEncoder();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Lyrics source stored in cache
 */
export interface CachedLyricsSource {
  hash: string;
  albumId: string | number;
  title: string;
  artist: string;
  album?: string;
}

/**
 * Song metadata structure
 */
export interface CachedSongMetadata {
  /** YouTube video ID */
  youtubeId: string;
  title: string;
  artist?: string;
  album?: string;
  /** Cover image URL from Kugou */
  cover?: string;
  lyricOffset?: number;
  /** Lyrics source from Kugou (user-selected or auto-detected) */
  lyricsSource?: CachedLyricsSource;
  createdBy?: string;
  createdAt: number;
  updatedAt: number;
  importOrder?: number;
}

/**
 * Unified song document from /api/songs endpoint
 */
interface UnifiedSongDocument {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  cover?: string;
  lyricOffset?: number;
  lyricsSource?: CachedLyricsSource;
  createdBy?: string;
  createdAt: number;
  updatedAt: number;
  importOrder?: number;
}

/**
 * Response from unified /api/songs list endpoint
 */
interface UnifiedSongListResponse {
  songs: UnifiedSongDocument[];
}

/**
 * Response from the song API when saving
 */
interface SaveSongResponse {
  success: boolean;
  id?: string;
  isUpdate?: boolean;
  createdBy?: string;
  error?: string;
}

/**
 * Authentication credentials for saving metadata
 */
export interface SongMetadataAuthCredentials {
  username: string;
  authToken: string;
}

type BulkImportSong = {
  id: string;
  url?: string;
  title: string;
  artist?: string;
  album?: string;
  lyricOffset?: number;
  lyricsSource?: CachedLyricsSource;
  // Content fields (may be compressed gzip:base64 strings or raw objects)
  // Using unknown to allow flexible import from JSON files
  lyrics?: unknown;
  translations?: unknown;
  furigana?: unknown;
  soramimi?: unknown;
  soramimiByLang?: unknown;
  // Timestamps
  createdBy?: string;
  createdAt?: number;
  updatedAt?: number;
  importOrder?: number;
};

export type BulkImportProgressStage =
  | "starting"
  | "batch-start"
  | "batch-success"
  | "rate-limited"
  | "batch-split"
  | "complete"
  | "error";

export interface BulkImportProgress {
  stage: BulkImportProgressStage;
  totalSongs: number;
  processedSongs: number;
  pendingSongs: number;
  importedSongs: number;
  updatedSongs: number;
  batchIndex: number;
  batchCount: number;
  batchSize: number;
  retryAttempt?: number;
  retryAfterMs?: number;
  statusCode?: number;
  message?: string;
}

interface BulkImportOptions {
  onProgress?: (progress: BulkImportProgress) => void;
}

function buildBulkImportRequestBody(songs: BulkImportSong[]): {
  body: string;
  byteLength: number;
} {
  const body = JSON.stringify({ action: "import", songs });
  return {
    body,
    byteLength: bulkImportTextEncoder.encode(body).length,
  };
}

function splitBulkImportBatch(
  songs: BulkImportSong[]
): [BulkImportSong[], BulkImportSong[]] {
  const midpoint = Math.ceil(songs.length / 2);
  return [songs.slice(0, midpoint), songs.slice(midpoint)];
}

function createBulkImportBatches(songs: BulkImportSong[]): BulkImportSong[][] {
  const batches: BulkImportSong[][] = [];
  let currentBatch: BulkImportSong[] = [];

  for (const song of songs) {
    const nextBatch = [...currentBatch, song];
    const { byteLength } = buildBulkImportRequestBody(nextBatch);
    const exceedsCountLimit = nextBatch.length > BULK_IMPORT_BATCH_SIZE;
    const exceedsPayloadLimit = byteLength > BULK_IMPORT_MAX_PAYLOAD_BYTES;

    if (currentBatch.length > 0 && (exceedsCountLimit || exceedsPayloadLimit)) {
      batches.push(currentBatch);
      currentBatch = [song];
      continue;
    }

    currentBatch = nextBatch;
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

/**
 * Convert unified song document to CachedSongMetadata format
 */
function unifiedToMetadata(doc: UnifiedSongDocument): CachedSongMetadata {
  return {
    youtubeId: doc.id,
    title: doc.title,
    artist: doc.artist,
    album: doc.album,
    cover: doc.cover,
    lyricOffset: doc.lyricOffset,
    lyricsSource: doc.lyricsSource,
    createdBy: doc.createdBy,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    importOrder: doc.importOrder,
  };
}

/**
 * Retrieve cached song metadata from Redis
 * 
 * @param youtubeId - YouTube video ID
 * @returns Cached metadata if found, null otherwise
 */
export async function getCachedSongMetadata(
  youtubeId: string
): Promise<CachedSongMetadata | null> {
  try {
    const response = await abortableFetch(
      getApiUrl(`/api/songs/${encodeURIComponent(youtubeId)}?include=metadata`),
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 15000,
        throwOnHttpError: false,
        retry: { maxAttempts: 1, initialDelayMs: 250 },
      }
    );

    if (response.ok) {
      const data: UnifiedSongDocument = await response.json();
      console.log(`[SongMetadataCache] Cache HIT for ${youtubeId}`);
      return unifiedToMetadata(data);
    }

    if (response.status === 404) {
      console.log(`[SongMetadataCache] Cache MISS for ${youtubeId}`);
      return null;
    }

    console.warn(`[SongMetadataCache] Failed to fetch metadata for ${youtubeId}: ${response.status}`);
    return null;
  } catch (error) {
    console.error(`[SongMetadataCache] Error fetching metadata for ${youtubeId}:`, error);
    return null;
  }
}

/**
 * List all cached song metadata from Redis (for sync)
 * 
 * @param createdBy - Optional filter to only return songs created by a specific user
 * @returns Array of all cached song metadata
 */
export async function listAllCachedSongMetadata(createdBy?: string): Promise<CachedSongMetadata[]> {
  try {
    let url = "/api/songs?include=metadata";
    if (createdBy) {
      url += `&createdBy=${encodeURIComponent(createdBy)}`;
    }
    
    const response = await abortableFetch(
      getApiUrl(url),
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 15000,
        throwOnHttpError: false,
        retry: { maxAttempts: 1, initialDelayMs: 250 },
      }
    );

    if (!response.ok) {
      console.warn(`[SongMetadataCache] Failed to list all metadata: ${response.status}`);
      return [];
    }

    const data: UnifiedSongListResponse = await response.json();
    const songs = data.songs?.map(unifiedToMetadata) || [];
    console.log(`[SongMetadataCache] Listed ${songs.length} songs${createdBy ? ` (by ${createdBy})` : ""}`);
    return songs;
  } catch (error) {
    console.error(`[SongMetadataCache] Error listing metadata:`, error);
    return [];
  }
}

/**
 * Delete song metadata from Redis cache
 * Requires admin authentication (user ryo only)
 * 
 * @param youtubeId - YouTube video ID to delete
 * @param auth - Authentication credentials (username and token)
 * @returns true if deleted successfully, false otherwise
 */
export async function deleteSongMetadata(
  youtubeId: string,
  auth: SongMetadataAuthCredentials
): Promise<boolean> {
  try {
    const response = await abortableFetch(
      getApiUrl(`/api/songs/${encodeURIComponent(youtubeId)}`),
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${auth.authToken}`,
          "X-Username": auth.username,
        },
        timeout: 15000,
        throwOnHttpError: false,
        retry: { maxAttempts: 1, initialDelayMs: 250 },
      }
    );

    if (response.status === 401) {
      console.warn(`[SongMetadataCache] Unauthorized - user must be logged in to delete metadata`);
      return false;
    }

    if (response.status === 403) {
      console.warn(`[SongMetadataCache] Forbidden - admin access required to delete metadata`);
      return false;
    }

    if (response.status === 404) {
      console.warn(`[SongMetadataCache] Song not found: ${youtubeId}`);
      return false;
    }

    if (response.ok) {
      console.log(`[SongMetadataCache] Deleted metadata for ${youtubeId}`);
      return true;
    }

    console.warn(`[SongMetadataCache] Failed to delete metadata for ${youtubeId}: ${response.status}`);
    return false;
  } catch (error) {
    console.error(`[SongMetadataCache] Error deleting metadata for ${youtubeId}:`, error);
    return false;
  }
}

/**
 * Delete all song metadata from Redis cache
 * Requires admin authentication (user ryo only)
 * Uses bulk delete endpoint for efficiency
 * 
 * @param auth - Authentication credentials (username and token)
 * @returns Object with deleted count
 */
export async function deleteAllSongMetadata(
  auth: SongMetadataAuthCredentials
): Promise<{ success: number; total: number }> {
  try {
    console.log(`[SongMetadataCache] Deleting all songs...`);

    const response = await abortableFetch(getApiUrl("/api/songs"), {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${auth.authToken}`,
        "X-Username": auth.username,
      },
      timeout: 15000,
      throwOnHttpError: false,
      retry: { maxAttempts: 1, initialDelayMs: 250 },
    });

    if (response.status === 401) {
      console.warn(`[SongMetadataCache] Unauthorized - user must be logged in`);
      return { success: 0, total: 0 };
    }

    if (response.status === 403) {
      console.warn(`[SongMetadataCache] Forbidden - admin access required`);
      return { success: 0, total: 0 };
    }

    if (response.ok) {
      const data = await response.json();
      console.log(`[SongMetadataCache] Deleted ${data.deleted} songs`);
      return { success: data.deleted, total: data.deleted };
    }

    console.warn(`[SongMetadataCache] Failed to delete all: ${response.status}`);
    return { success: 0, total: 0 };
  } catch (error) {
    console.error(`[SongMetadataCache] Error deleting all metadata:`, error);
    return { success: 0, total: 0 };
  }
}

/**
 * Save song metadata to Redis cache
 * Requires authentication - will fail if not logged in
 * 
 * @param metadata - Song metadata to save
 * @param auth - Authentication credentials (username and token)
 * @param options - Additional options
 * @param options.isShare - If true, this is a share action and will update createdBy
 * @returns true if saved successfully, false otherwise
 */
export async function saveSongMetadata(
  metadata: {
    youtubeId: string;
    title: string;
    artist?: string;
    album?: string;
    lyricOffset?: number;
    lyricsSource?: CachedLyricsSource;
  },
  auth: SongMetadataAuthCredentials,
  options?: { isShare?: boolean }
): Promise<boolean> {
  try {
    const response = await abortableFetch(
      getApiUrl(`/api/songs/${encodeURIComponent(metadata.youtubeId)}`),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${auth.authToken}`,
          "X-Username": auth.username,
        },
        body: JSON.stringify({
          title: metadata.title,
          artist: metadata.artist,
          album: metadata.album,
          lyricOffset: metadata.lyricOffset,
          lyricsSource: metadata.lyricsSource,
          isShare: options?.isShare,
        }),
        timeout: 15000,
        throwOnHttpError: false,
        retry: { maxAttempts: 1, initialDelayMs: 250 },
      }
    );

    if (response.status === 401) {
      console.warn(`[SongMetadataCache] Unauthorized - user must be logged in to save metadata`);
      return false;
    }

    if (!response.ok) {
      console.warn(`[SongMetadataCache] Failed to save metadata for ${metadata.youtubeId}: ${response.status}`);
      return false;
    }

    const data: SaveSongResponse = await response.json();
    console.log(
      `[SongMetadataCache] ${data.isUpdate ? "Updated" : "Saved"} metadata for ${metadata.youtubeId} (by ${data.createdBy || auth.username})`
    );
    return true;
  } catch (error) {
    console.error(`[SongMetadataCache] Error saving metadata for ${metadata.youtubeId}:`, error);
    return false;
  }
}

/**
 * Bulk import songs to Redis cache
 * Requires admin authentication
 * 
 * @param songs - Array of songs to import
 * @param auth - Authentication credentials (username and token)
 * @returns Import result with counts
 */
export async function bulkImportSongMetadata(
  songs: BulkImportSong[],
  auth: SongMetadataAuthCredentials,
  options?: BulkImportOptions
): Promise<{ success: boolean; imported: number; updated: number; total: number; error?: string }> {
  try {
    if (songs.length === 0) {
      return { success: true, imported: 0, updated: 0, total: 0 };
    }

    const batches = createBulkImportBatches(songs);
    let imported = 0;
    let updated = 0;
    let total = 0;

    const reportProgress = (
      progress: Omit<
        BulkImportProgress,
        "totalSongs" | "processedSongs" | "pendingSongs" | "importedSongs" | "updatedSongs"
      >
    ) => {
      options?.onProgress?.({
        ...progress,
        totalSongs: songs.length,
        processedSongs: total,
        pendingSongs: Math.max(songs.length - total, 0),
        importedSongs: imported,
        updatedSongs: updated,
      });
    };

    reportProgress({
      stage: "starting",
      batchIndex: 0,
      batchCount: batches.length,
      batchSize: 0,
      message: "Starting import",
    });

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      let completedBatch = false;
      let shouldSplitBatch = false;
      let rateLimitRetries = 0;

      while (!completedBatch) {
        reportProgress({
          stage: "batch-start",
          batchIndex: i + 1,
          batchCount: batches.length,
          batchSize: batch.length,
          message: "Uploading batch",
        });

        const { body, byteLength } = buildBulkImportRequestBody(batch);
        if (byteLength > BULK_IMPORT_MAX_PAYLOAD_BYTES) {
          if (batch.length <= 1) {
            reportProgress({
              stage: "error",
              batchIndex: i + 1,
              batchCount: batches.length,
              batchSize: batch.length,
              message:
                "Payload too large: one song entry exceeds import request size limits",
            });
            return {
              success: false,
              imported,
              updated,
              total,
              error:
                "Payload too large: one song entry exceeds import request size limits",
            };
          }
          reportProgress({
            stage: "batch-split",
            batchIndex: i + 1,
            batchCount: batches.length,
            batchSize: batch.length,
            message: "Splitting oversized batch before upload",
          });
          shouldSplitBatch = true;
          break;
        }

        const response = await abortableFetch(getApiUrl("/api/songs"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${auth.authToken}`,
            "X-Username": auth.username,
          },
          body,
          timeout: 30000,
          throwOnHttpError: false,
          retry: { maxAttempts: 1, initialDelayMs: 250 },
        });

        if (response.status === 413) {
          if (batch.length <= 1) {
            reportProgress({
              stage: "error",
              batchIndex: i + 1,
              batchCount: batches.length,
              batchSize: batch.length,
              statusCode: 413,
              message:
                "Payload too large: one song entry exceeds import request size limits",
            });
            return {
              success: false,
              imported,
              updated,
              total,
              error:
                "Payload too large: one song entry exceeds import request size limits",
            };
          }
          console.warn(
            `[SongMetadataCache] Batch ${i + 1}/${batches.length} hit 413, splitting and retrying`
          );
          reportProgress({
            stage: "batch-split",
            batchIndex: i + 1,
            batchCount: batches.length,
            batchSize: batch.length,
            statusCode: 413,
            message: "Server returned 413, splitting batch and retrying",
          });
          shouldSplitBatch = true;
          break;
        }

        if (response.status === 429) {
          if (rateLimitRetries >= BULK_IMPORT_MAX_RATE_LIMIT_RETRIES) {
            console.warn(
              `[SongMetadataCache] Rate limited too many times while importing batch ${i + 1}/${batches.length}`
            );
            reportProgress({
              stage: "error",
              batchIndex: i + 1,
              batchCount: batches.length,
              batchSize: batch.length,
              statusCode: 429,
              message: "Rate limited while importing songs",
            });
            return {
              success: false,
              imported,
              updated,
              total,
              error: "Rate limited while importing songs",
            };
          }

          rateLimitRetries += 1;
          const retryAfterHeader = response.headers.get("Retry-After");
          const retryAfterSeconds = retryAfterHeader
            ? Number.parseInt(retryAfterHeader, 10)
            : NaN;
          const waitMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
            ? retryAfterSeconds * 1000
            : 4000 * Math.pow(2, rateLimitRetries - 1);

          console.warn(
            `[SongMetadataCache] Import rate limited on batch ${i + 1}/${batches.length}, retrying in ${waitMs}ms`
          );
          reportProgress({
            stage: "rate-limited",
            batchIndex: i + 1,
            batchCount: batches.length,
            batchSize: batch.length,
            retryAttempt: rateLimitRetries,
            retryAfterMs: waitMs,
            statusCode: 429,
            message: `Rate limited. Retrying in ${Math.ceil(waitMs / 1000)}s`,
          });
          await sleep(waitMs);
          continue;
        }

        if (response.status === 401) {
          console.warn(`[SongMetadataCache] Unauthorized - user must be logged in to import`);
          reportProgress({
            stage: "error",
            batchIndex: i + 1,
            batchCount: batches.length,
            batchSize: batch.length,
            statusCode: 401,
            message: "Unauthorized",
          });
          return { success: false, imported, updated, total, error: "Unauthorized" };
        }

        if (response.status === 403) {
          console.warn(`[SongMetadataCache] Forbidden - admin access required to import`);
          reportProgress({
            stage: "error",
            batchIndex: i + 1,
            batchCount: batches.length,
            batchSize: batch.length,
            statusCode: 403,
            message: "Forbidden - admin only",
          });
          return {
            success: false,
            imported,
            updated,
            total,
            error: "Forbidden - admin only",
          };
        }

        if (!response.ok) {
          console.warn(`[SongMetadataCache] Failed to import songs: ${response.status}`);
          reportProgress({
            stage: "error",
            batchIndex: i + 1,
            batchCount: batches.length,
            batchSize: batch.length,
            statusCode: response.status,
            message: `HTTP ${response.status}`,
          });
          return {
            success: false,
            imported,
            updated,
            total,
            error: `HTTP ${response.status}`,
          };
        }

        const data = await response.json();
        if (!data.success) {
          console.warn(`[SongMetadataCache] Failed to import: ${data.error}`);
          reportProgress({
            stage: "error",
            batchIndex: i + 1,
            batchCount: batches.length,
            batchSize: batch.length,
            message: data.error,
          });
          return {
            success: false,
            imported,
            updated,
            total,
            error: data.error,
          };
        }

        imported += Number(data.imported) || 0;
        updated += Number(data.updated) || 0;
        total += Number(data.total) || batch.length;
        reportProgress({
          stage: "batch-success",
          batchIndex: i + 1,
          batchCount: batches.length,
          batchSize: batch.length,
          message: "Batch uploaded",
        });
        completedBatch = true;
      }

      if (shouldSplitBatch) {
        const [firstHalf, secondHalf] = splitBulkImportBatch(batch);
        batches.splice(i, 1, firstHalf, secondHalf);
        i -= 1;
      }
    }

    console.log(
      `[SongMetadataCache] Imported ${imported} new, updated ${updated}, total ${total}`
    );
    reportProgress({
      stage: "complete",
      batchIndex: batches.length,
      batchCount: batches.length,
      batchSize: 0,
      message: "Import complete",
    });
    return { success: true, imported, updated, total };
  } catch (error) {
    console.error(`[SongMetadataCache] Error importing songs:`, error);
    options?.onProgress?.({
      stage: "error",
      totalSongs: songs.length,
      processedSongs: 0,
      pendingSongs: songs.length,
      importedSongs: 0,
      updatedSongs: 0,
      batchIndex: 0,
      batchCount: 0,
      batchSize: 0,
      message: String(error),
    });
    return { success: false, imported: 0, updated: 0, total: 0, error: String(error) };
  }
}

/**
 * Save song metadata from a Track object (convenience function)
 * Requires authentication - will skip if not logged in
 * 
 * @param track - Track object from iPod store
 * @param auth - Authentication credentials (username and token), or null to skip
 * @param options - Additional options
 * @param options.isShare - If true, this is a share action and will update createdBy
 * @returns true if saved successfully, false otherwise (including when skipped due to no auth)
 */
export async function saveSongMetadataFromTrack(
  track: {
    id: string;
    title: string;
    artist?: string;
    album?: string;
    lyricOffset?: number;
    lyricsSource?: {
      hash: string;
      albumId: string | number;
      title: string;
      artist: string;
      album?: string;
    };
  },
  auth: SongMetadataAuthCredentials | null,
  options?: { isShare?: boolean }
): Promise<boolean> {
  // Skip if not authenticated
  if (!auth || !auth.username || !auth.authToken) {
    console.log(`[SongMetadataCache] Skipping save for ${track.id} - user not logged in`);
    return false;
  }

  return saveSongMetadata(
    {
      youtubeId: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album,
      lyricOffset: track.lyricOffset,
      lyricsSource: track.lyricsSource,
    },
    auth,
    options
  );
}
