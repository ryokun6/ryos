/**
 * Song metadata cache utilities
 * 
 * Provides functions to save and retrieve song metadata from Redis cache.
 * Used by iPod and Karaoke apps to share song metadata between users.
 * 
 * Uses the unified /api/song endpoint.
 */

import { getApiUrl } from "./platform";

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
  lyricOffset?: number;
  /** Lyrics source from Kugou */
  lyricsSource?: CachedLyricsSource;
  createdBy?: string;
  createdAt: number;
  updatedAt: number;
  importOrder?: number;
}

/**
 * Unified song document from /api/song endpoint
 */
interface UnifiedSongDocument {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  lyricOffset?: number;
  lyricsSource?: CachedLyricsSource;
  createdBy?: string;
  createdAt: number;
  updatedAt: number;
  importOrder?: number;
}

/**
 * Response from unified /api/song list endpoint
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

/**
 * Convert unified song document to CachedSongMetadata format
 */
function unifiedToMetadata(doc: UnifiedSongDocument): CachedSongMetadata {
  return {
    youtubeId: doc.id,
    title: doc.title,
    artist: doc.artist,
    album: doc.album,
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
    const response = await fetch(
      getApiUrl(`/api/song/${encodeURIComponent(youtubeId)}?include=metadata`),
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
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
    let url = "/api/song?include=metadata";
    if (createdBy) {
      url += `&createdBy=${encodeURIComponent(createdBy)}`;
    }
    
    const response = await fetch(
      getApiUrl(url),
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
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
    const response = await fetch(
      getApiUrl(`/api/song/${encodeURIComponent(youtubeId)}`),
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${auth.authToken}`,
          "X-Username": auth.username,
        },
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
 * Save song metadata to Redis cache
 * Requires authentication - will fail if not logged in
 * 
 * @param metadata - Song metadata to save
 * @param auth - Authentication credentials (username and token)
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
  auth: SongMetadataAuthCredentials
): Promise<boolean> {
  try {
    const response = await fetch(getApiUrl(`/api/song/${encodeURIComponent(metadata.youtubeId)}`), {
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
      }),
    });

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
  songs: Array<{
    id: string;
    url?: string;
    title: string;
    artist?: string;
    album?: string;
    lyricOffset?: number;
    lyricsSource?: CachedLyricsSource;
  }>,
  auth: SongMetadataAuthCredentials
): Promise<{ success: boolean; imported: number; updated: number; total: number; error?: string }> {
  try {
    const response = await fetch(getApiUrl("/api/song"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${auth.authToken}`,
        "X-Username": auth.username,
      },
      body: JSON.stringify({ action: "import", songs }),
    });

    if (response.status === 401) {
      console.warn(`[SongMetadataCache] Unauthorized - user must be logged in to import`);
      return { success: false, imported: 0, updated: 0, total: 0, error: "Unauthorized" };
    }

    if (response.status === 403) {
      console.warn(`[SongMetadataCache] Forbidden - admin access required to import`);
      return { success: false, imported: 0, updated: 0, total: 0, error: "Forbidden - admin only" };
    }

    if (!response.ok) {
      console.warn(`[SongMetadataCache] Failed to import songs: ${response.status}`);
      return { success: false, imported: 0, updated: 0, total: 0, error: `HTTP ${response.status}` };
    }

    const data = await response.json();

    if (data.success) {
      console.log(
        `[SongMetadataCache] Imported ${data.imported} new, updated ${data.updated}, total ${data.total}`
      );
      return { success: true, imported: data.imported, updated: data.updated, total: data.total };
    }

    console.warn(`[SongMetadataCache] Failed to import: ${data.error}`);
    return { success: false, imported: 0, updated: 0, total: 0, error: data.error };
  } catch (error) {
    console.error(`[SongMetadataCache] Error importing songs:`, error);
    return { success: false, imported: 0, updated: 0, total: 0, error: String(error) };
  }
}

/**
 * Save song metadata from a Track object (convenience function)
 * Requires authentication - will skip if not logged in
 * 
 * @param track - Track object from iPod store
 * @param auth - Authentication credentials (username and token), or null to skip
 * @returns true if saved successfully, false otherwise (including when skipped due to no auth)
 */
export async function saveSongMetadataFromTrack(
  track: {
    id: string;
    title: string;
    artist?: string;
    album?: string;
    lyricOffset?: number;
    lyricsSearch?: {
      query?: string;
      selection?: {
        hash: string;
        albumId: string | number;
        title: string;
        artist: string;
        album?: string;
      };
    };
  },
  auth: SongMetadataAuthCredentials | null
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
      lyricsSource: track.lyricsSearch?.selection,
    },
    auth
  );
}
