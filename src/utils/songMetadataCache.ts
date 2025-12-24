/**
 * Song metadata cache utilities
 * 
 * Provides functions to save and retrieve song metadata from Redis cache.
 * Used by iPod and Karaoke apps to share song metadata between users.
 */

import { getApiUrl } from "./platform";

/**
 * Lyrics search selection stored in cache
 */
export interface CachedLyricsSearchSelection {
  hash: string;
  albumId: string | number;
  title: string;
  artist: string;
  album?: string;
}

/**
 * Song metadata structure stored in cache
 */
export interface CachedSongMetadata {
  youtubeId: string;
  title: string;
  artist?: string;
  album?: string;
  lyricOffset?: number;
  lyricsSearch?: {
    query?: string;
    selection?: CachedLyricsSearchSelection;
  };
  lyricsHash?: string;
  translationHash?: string;
  createdBy?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Response from the song metadata API when fetching
 */
interface GetSongMetadataResponse {
  found: boolean;
  metadata?: CachedSongMetadata;
  error?: string;
}

/**
 * Response from the song metadata API when saving
 */
interface SaveSongMetadataResponse {
  success: boolean;
  youtubeId?: string;
  isUpdate?: boolean;
  createdBy?: string;
  error?: string;
}

/**
 * Response from the song metadata API when listing all songs
 */
interface ListSongMetadataResponse {
  songs: CachedSongMetadata[];
}

/**
 * Authentication credentials for saving metadata
 */
export interface SongMetadataAuthCredentials {
  username: string;
  authToken: string;
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
      getApiUrl(`/api/song-metadata?id=${encodeURIComponent(youtubeId)}`),
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      console.warn(`[SongMetadataCache] Failed to fetch metadata for ${youtubeId}: ${response.status}`);
      return null;
    }

    const data: GetSongMetadataResponse = await response.json();

    if (data.found && data.metadata) {
      console.log(`[SongMetadataCache] Cache HIT for ${youtubeId}`);
      return data.metadata;
    }

    console.log(`[SongMetadataCache] Cache MISS for ${youtubeId}`);
    return null;
  } catch (error) {
    console.error(`[SongMetadataCache] Error fetching metadata for ${youtubeId}:`, error);
    return null;
  }
}

/**
 * List all cached song metadata from Redis (for sync)
 * 
 * @returns Array of all cached song metadata
 */
export async function listAllCachedSongMetadata(): Promise<CachedSongMetadata[]> {
  try {
    const response = await fetch(
      getApiUrl("/api/song-metadata?list=true"),
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

    const data: ListSongMetadataResponse = await response.json();
    console.log(`[SongMetadataCache] Listed ${data.songs?.length || 0} songs from cache`);
    return data.songs || [];
  } catch (error) {
    console.error(`[SongMetadataCache] Error listing metadata:`, error);
    return [];
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
    lyricsSearch?: {
      query?: string;
      selection?: CachedLyricsSearchSelection;
    };
    lyricsHash?: string;
    translationHash?: string;
  },
  auth: SongMetadataAuthCredentials
): Promise<boolean> {
  try {
    const response = await fetch(getApiUrl("/api/song-metadata"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${auth.authToken}`,
        "X-Username": auth.username,
      },
      body: JSON.stringify(metadata),
    });

    if (response.status === 401) {
      console.warn(`[SongMetadataCache] Unauthorized - user must be logged in to save metadata`);
      return false;
    }

    if (!response.ok) {
      console.warn(`[SongMetadataCache] Failed to save metadata for ${metadata.youtubeId}: ${response.status}`);
      return false;
    }

    const data: SaveSongMetadataResponse = await response.json();

    if (data.success) {
      console.log(
        `[SongMetadataCache] ${data.isUpdate ? "Updated" : "Saved"} metadata for ${metadata.youtubeId} (by ${data.createdBy || auth.username})`
      );
      return true;
    }

    console.warn(`[SongMetadataCache] Failed to save metadata: ${data.error}`);
    return false;
  } catch (error) {
    console.error(`[SongMetadataCache] Error saving metadata for ${metadata.youtubeId}:`, error);
    return false;
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
      lyricsSearch: track.lyricsSearch,
    },
    auth
  );
}
