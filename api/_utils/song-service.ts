/**
 * Unified Song Service
 *
 * Provides a single source of truth for song data including:
 * - Metadata (title, artist, album, etc.)
 * - Lyrics (LRC/KRC format from Kugou)
 * - Translations (multiple languages)
 * - Furigana (Japanese reading annotations)
 *
 * Redis Key Format: song:{youtubeId}
 */

import type { Redis } from "@upstash/redis";

// =============================================================================
// Types
// =============================================================================

/**
 * Lyrics source information from Kugou
 */
export interface LyricsSource {
  hash: string;
  albumId: string | number;
  title: string;
  artist: string;
  album?: string;
}

/**
 * Word-level timing from KRC format
 */
export interface WordTiming {
  text: string;
  startTimeMs: number;
  durationMs: number;
}

/**
 * Parsed lyric line (filtered and normalized)
 */
export interface ParsedLyricLine {
  startTimeMs: string;
  words: string;
  wordTimings?: WordTiming[];
}

/**
 * Fetched lyrics content
 */
export interface LyricsContent {
  lrc: string; // LRC format lyrics (raw, kept for backwards compat)
  krc?: string; // KRC format if available (raw, kept for backwards compat)
  cover?: string; // Cover image URL
  parsedLines?: ParsedLyricLine[]; // Pre-parsed and filtered lines (use this for display)
}

/**
 * Furigana segment for Japanese text
 */
export interface FuriganaSegment {
  text: string;
  reading?: string; // Hiragana reading for kanji
}

/**
 * Unified song document stored in Redis
 */
export interface SongDocument {
  id: string; // YouTube video ID
  title: string;
  artist?: string;
  album?: string;
  lyricOffset?: number; // Offset in ms to adjust lyrics timing

  // Lyrics source from Kugou search
  lyricsSource?: LyricsSource;

  // Fetched lyrics content
  lyrics?: LyricsContent;

  // Translations keyed by language code
  translations?: Record<string, string>;

  // Furigana annotations (one array per lyric line)
  furigana?: FuriganaSegment[][];

  // Soramimi annotations - Chinese misheard lyrics (空耳)
  soramimi?: FuriganaSegment[][];

  // Metadata
  createdBy?: string;
  createdAt: number;
  updatedAt: number;
  importOrder?: number; // For stable sorting during bulk imports
}

/**
 * Options for fetching song data
 */
export interface GetSongOptions {
  includeMetadata?: boolean;
  includeLyrics?: boolean;
  includeTranslations?: boolean | string[]; // true = all, string[] = specific languages
  includeFurigana?: boolean;
  includeSoramimi?: boolean;
}

/**
 * Options for saving song data
 */
export interface SaveSongOptions {
  /** Preserve existing lyrics if not provided */
  preserveLyrics?: boolean;
  /** Preserve existing translations if not provided */
  preserveTranslations?: boolean;
  /** Preserve existing furigana if not provided */
  preserveFurigana?: boolean;
  /** Preserve existing soramimi if not provided */
  preserveSoramimi?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/** Redis key prefix for unified song documents */
export const SONG_KEY_PREFIX = "song:";

/** Redis set tracking all song IDs */
export const SONG_SET_KEY = "song:all";

/** Old key prefix for backwards compatibility */
export const LEGACY_SONG_METADATA_PREFIX = "song:metadata:";

/** In-progress chunk cache TTL (24 hours) */
const CHUNK_PROGRESS_TTL_SECONDS = 24 * 60 * 60;

// =============================================================================
// Chunk Progress Caching (for partial result resilience)
// =============================================================================

/** Types of chunk-based processing */
export type ChunkProcessingType = "soramimi" | "furigana" | "translation";

/** Get the Redis key for chunk progress */
function getChunkProgressKey(songId: string, type: ChunkProcessingType, language?: string): string {
  if (type === "translation" && language) {
    return `${SONG_KEY_PREFIX}${songId}:${type}:${language}:progress`;
  }
  return `${SONG_KEY_PREFIX}${songId}:${type}:progress`;
}

/** Progress data stored for each type */
export interface ChunkProgressData<T> {
  chunks: Record<number, T>;
  totalChunks: number;
  startedAt: number;
}

/**
 * Save a single successful chunk to the progress cache.
 * This is called immediately when a chunk succeeds, before all chunks complete.
 */
export async function saveChunkProgress<T>(
  redis: Redis,
  songId: string,
  type: ChunkProcessingType,
  chunkIndex: number,
  chunkData: T,
  totalChunks: number,
  language?: string
): Promise<void> {
  const key = getChunkProgressKey(songId, type, language);
  
  // Get existing progress or create new
  const existing = await redis.get(key);
  const progress: ChunkProgressData<T> = existing 
    ? (typeof existing === "string" ? JSON.parse(existing) : existing as ChunkProgressData<T>)
    : { chunks: {}, totalChunks, startedAt: Date.now() };
  
  // Add this chunk
  progress.chunks[chunkIndex] = chunkData;
  progress.totalChunks = totalChunks;
  
  // Save with TTL
  await redis.set(key, JSON.stringify(progress), { ex: CHUNK_PROGRESS_TTL_SECONDS });
}

/**
 * Get all cached chunk progress for a song.
 * Returns null if no progress cache exists.
 */
export async function getChunkProgress<T>(
  redis: Redis,
  songId: string,
  type: ChunkProcessingType,
  language?: string
): Promise<ChunkProgressData<T> | null> {
  const key = getChunkProgressKey(songId, type, language);
  const data = await redis.get(key);
  if (!data) return null;
  return typeof data === "string" ? JSON.parse(data) : data as ChunkProgressData<T>;
}

/**
 * Clear the chunk progress cache (called after successful completion).
 */
export async function clearChunkProgress(
  redis: Redis,
  songId: string,
  type: ChunkProcessingType,
  language?: string
): Promise<void> {
  const key = getChunkProgressKey(songId, type, language);
  await redis.del(key);
}

/**
 * Get which chunk indices are missing from the progress cache.
 */
export function getMissingChunkIndices<T>(
  progress: ChunkProgressData<T> | null,
  totalChunks: number
): number[] {
  if (!progress) {
    // No progress - all chunks are missing
    return Array.from({ length: totalChunks }, (_, i) => i);
  }
  
  const missing: number[] = [];
  for (let i = 0; i < totalChunks; i++) {
    if (!(i in progress.chunks)) {
      missing.push(i);
    }
  }
  return missing;
}

/**
 * Check if all chunks are complete in the progress cache.
 */
export function isChunkProgressComplete<T>(
  progress: ChunkProgressData<T> | null,
  totalChunks: number
): boolean {
  if (!progress) return false;
  return Object.keys(progress.chunks).length >= totalChunks;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get the Redis key for a song document
 */
export function getSongKey(id: string): string {
  return `${SONG_KEY_PREFIX}${id}`;
}

/**
 * Parse stored song data (handles both string and object formats)
 */
export function parseSongDocument(raw: unknown): SongDocument | null {
  if (!raw) return null;
  try {
    return typeof raw === "string" ? JSON.parse(raw) : (raw as SongDocument);
  } catch {
    return null;
  }
}

// =============================================================================
// CRUD Operations
// =============================================================================

/**
 * Get a song by ID from Redis
 * Includes backwards compatibility with legacy format
 */
export async function getSong(
  redis: Redis,
  id: string,
  options: GetSongOptions = {}
): Promise<SongDocument | null> {
  const {
    includeMetadata = true,
    includeLyrics = false,
    includeTranslations = false,
    includeFurigana = false,
  } = options;

  // Try new unified format first
  const songKey = getSongKey(id);
  const raw = await redis.get(songKey);
  let song = parseSongDocument(raw);

  // Fall back to legacy format if not found
  if (!song) {
    song = await getLegacySong(redis, id);
    if (song) {
      // Optionally migrate to new format (write-through)
      // Uncomment to enable automatic migration:
      // await saveSong(redis, song);
    }
  }

  if (!song) return null;

  // Filter response based on options
  const result: SongDocument = {
    id: song.id,
    title: song.title,
    createdAt: song.createdAt,
    updatedAt: song.updatedAt,
  };

  if (includeMetadata) {
    result.artist = song.artist;
    result.album = song.album;
    result.lyricOffset = song.lyricOffset;
    result.lyricsSource = song.lyricsSource;
    result.createdBy = song.createdBy;
    result.importOrder = song.importOrder;
  }

  if (includeLyrics && song.lyrics) {
    result.lyrics = song.lyrics;
  }

  if (includeFurigana && song.furigana) {
    result.furigana = song.furigana;
  }

  if (options.includeSoramimi && song.soramimi) {
    result.soramimi = song.soramimi;
  }

  if (includeTranslations && song.translations) {
    if (includeTranslations === true) {
      result.translations = song.translations;
    } else if (Array.isArray(includeTranslations)) {
      result.translations = {};
      for (const lang of includeTranslations) {
        if (song.translations[lang]) {
          result.translations[lang] = song.translations[lang];
        }
      }
    }
  }

  return result;
}

/**
 * Get song from legacy format (song:metadata + lyrics:cache)
 */
async function getLegacySong(
  redis: Redis,
  id: string
): Promise<SongDocument | null> {
  const metadataKey = `${LEGACY_SONG_METADATA_PREFIX}${id}`;
  const metadataRaw = await redis.get(metadataKey);

  if (!metadataRaw) return null;

  const metadata = parseSongDocument(metadataRaw);
  if (!metadata) return null;

  // Legacy format has different property names
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const legacyData = metadata as any;

  // Convert legacy format to new format
  const song: SongDocument = {
    id: legacyData.youtubeId || id,
    title: legacyData.title || metadata.title,
    artist: legacyData.artist || metadata.artist,
    album: legacyData.album || metadata.album,
    lyricOffset: legacyData.lyricOffset || metadata.lyricOffset,
    createdBy: legacyData.createdBy || metadata.createdBy,
    createdAt: legacyData.createdAt || metadata.createdAt || Date.now(),
    updatedAt: legacyData.updatedAt || metadata.updatedAt || Date.now(),
    importOrder: legacyData.importOrder || metadata.importOrder,
  };

  // Convert legacy lyricsSearch to lyricsSource
  if (legacyData.lyricsSearch?.selection) {
    song.lyricsSource = legacyData.lyricsSearch.selection;
  }

  return song;
}

/**
 * Save a song to Redis
 */
export async function saveSong(
  redis: Redis,
  song: Partial<SongDocument> & { id: string },
  options: SaveSongOptions = {},
  existingSong?: SongDocument | null
): Promise<SongDocument> {
  const { 
    preserveLyrics = false, 
    preserveTranslations = false, 
    preserveFurigana = false, 
    preserveSoramimi = false, 
  } = options;
  const songKey = getSongKey(song.id);
  const now = Date.now();

  // Get existing song to merge with (use provided or fetch)
  const existing = existingSong !== undefined 
    ? existingSong 
    : parseSongDocument(await redis.get(songKey));

  // Build the document
  // Note: For createdBy, we check if the key exists in the song object to allow explicit clearing
  // If 'createdBy' key exists (even as undefined), use that value; otherwise preserve existing
  const createdByValue = 'createdBy' in song ? song.createdBy : existing?.createdBy;
  
  const doc: SongDocument = {
    id: song.id,
    title: song.title ?? existing?.title ?? "",
    artist: song.artist ?? existing?.artist,
    album: song.album ?? existing?.album,
    lyricOffset: song.lyricOffset ?? existing?.lyricOffset,
    lyricsSource: song.lyricsSource ?? existing?.lyricsSource,
    lyrics: preserveLyrics ? (existing?.lyrics ?? song.lyrics) : (song.lyrics ?? existing?.lyrics),
    translations: preserveTranslations
      ? { ...existing?.translations, ...song.translations }
      : (song.translations ?? existing?.translations),
    furigana: preserveFurigana ? (existing?.furigana ?? song.furigana) : (song.furigana ?? existing?.furigana),
    soramimi: preserveSoramimi ? (existing?.soramimi ?? song.soramimi) : (song.soramimi ?? existing?.soramimi),
    createdBy: createdByValue,
    createdAt: existing?.createdAt ?? song.createdAt ?? now,
    updatedAt: now,
    importOrder: song.importOrder ?? existing?.importOrder,
  };

  // Save to Redis
  await redis.set(songKey, JSON.stringify(doc));

  // Add to the set of all song IDs
  await redis.sadd(SONG_SET_KEY, song.id);

  return doc;
}

/**
 * Delete a song from Redis
 */
export async function deleteSong(redis: Redis, id: string): Promise<boolean> {
  const songKey = getSongKey(id);

  // Check if exists
  const exists = await redis.exists(songKey);
  if (!exists) return false;

  // Delete song document
  await redis.del(songKey);

  // Remove from the set
  await redis.srem(SONG_SET_KEY, id);

  return true;
}

/**
 * Delete all songs from Redis (admin only)
 * Returns the number of songs deleted
 */
export async function deleteAllSongs(redis: Redis): Promise<number> {
  // Get all song IDs
  const songIds = await redis.smembers(SONG_SET_KEY);
  
  if (!songIds || songIds.length === 0) {
    return 0;
  }

  // Delete all song documents
  const keys = songIds.map((id) => getSongKey(id));
  await redis.del(...keys);

  // Clear the set
  await redis.del(SONG_SET_KEY);

  return songIds.length;
}

/**
 * List songs with optional filtering
 */
export async function listSongs(
  redis: Redis,
  options: {
    createdBy?: string;
    ids?: string[];
    getOptions?: GetSongOptions;
  } = {}
): Promise<SongDocument[]> {
  const { createdBy, ids, getOptions = { includeMetadata: true } } = options;

  // Get song IDs
  let songIds: string[];
  if (ids && ids.length > 0) {
    songIds = ids;
  } else {
    songIds = await redis.smembers(SONG_SET_KEY);
  }

  if (!songIds || songIds.length === 0) {
    return [];
  }

  // Fetch all songs in parallel
  const keys = songIds.map((id) => getSongKey(id));
  const rawDocs = await redis.mget(...keys);

  const songs: SongDocument[] = [];
  for (let i = 0; i < rawDocs.length; i++) {
    const raw = rawDocs[i];
    if (!raw) continue;

    const song = parseSongDocument(raw);
    if (!song) continue;

    // Filter by createdBy if specified
    if (createdBy && song.createdBy !== createdBy) {
      continue;
    }

    // Apply filtering based on getOptions
    const filtered: SongDocument = {
      id: song.id,
      title: song.title,
      createdAt: song.createdAt,
      updatedAt: song.updatedAt,
    };

    if (getOptions.includeMetadata) {
      filtered.artist = song.artist;
      filtered.album = song.album;
      filtered.lyricOffset = song.lyricOffset;
      filtered.lyricsSource = song.lyricsSource;
      filtered.createdBy = song.createdBy;
      filtered.importOrder = song.importOrder;
    }

    if (getOptions.includeLyrics && song.lyrics) {
      filtered.lyrics = song.lyrics;
    }

    if (getOptions.includeFurigana && song.furigana) {
      filtered.furigana = song.furigana;
    }

    if (getOptions.includeSoramimi && song.soramimi) {
      filtered.soramimi = song.soramimi;
    }

    if (getOptions.includeTranslations && song.translations) {
      if (getOptions.includeTranslations === true) {
        filtered.translations = song.translations;
      } else if (Array.isArray(getOptions.includeTranslations)) {
        filtered.translations = {};
        for (const lang of getOptions.includeTranslations) {
          if (song.translations[lang]) {
            filtered.translations[lang] = song.translations[lang];
          }
        }
      }
    }

    songs.push(filtered);
  }

  // Sort by createdAt (newest first), then by importOrder for stable sorting
  songs.sort((a, b) => {
    const createdAtDiff = (b.createdAt || 0) - (a.createdAt || 0);
    if (createdAtDiff !== 0) return createdAtDiff;
    return (a.importOrder ?? Infinity) - (b.importOrder ?? Infinity);
  });

  return songs;
}

/**
 * Save lyrics content for a song
 * Creates a minimal song document if it doesn't exist
 */
export async function saveLyrics(
  redis: Redis,
  id: string,
  lyrics: LyricsContent,
  lyricsSource?: LyricsSource
): Promise<SongDocument> {
  // Get existing song or create a minimal document
  const existing = await getSong(redis, id, {
    includeMetadata: true,
    includeLyrics: true,
    includeTranslations: true,
    includeFurigana: true,
  });

  return saveSong(redis, {
    id,
    title: existing?.title || lyricsSource?.title || id,
    artist: existing?.artist || lyricsSource?.artist,
    album: existing?.album || lyricsSource?.album,
    lyrics,
    ...(lyricsSource && { lyricsSource }),
    createdBy: existing?.createdBy,
    createdAt: existing?.createdAt,
  }, {
    preserveTranslations: true,
    preserveFurigana: true,
  }, existing);
}

/**
 * Save a translation for a song
 * Requires the song to exist (call after saveLyrics)
 */
export async function saveTranslation(
  redis: Redis,
  id: string,
  language: string,
  translatedLrc: string
): Promise<SongDocument | null> {
  const existing = await getSong(redis, id, { 
    includeMetadata: true,
    includeLyrics: true,
    includeTranslations: true,
    includeFurigana: true,
  });
  if (!existing) return null;

  const translations = { ...existing.translations, [language]: translatedLrc };

  return saveSong(redis, {
    ...existing,
    translations,
  }, {}, existing);
}

/**
 * Save furigana annotations for a song
 * Requires the song to exist (call after saveLyrics)
 */
export async function saveFurigana(
  redis: Redis,
  id: string,
  furigana: FuriganaSegment[][]
): Promise<SongDocument | null> {
  const existing = await getSong(redis, id, { 
    includeMetadata: true,
    includeLyrics: true,
    includeTranslations: true,
    includeFurigana: true,
    includeSoramimi: true,
  });
  if (!existing) return null;

  return saveSong(redis, {
    ...existing,
    furigana,
  }, {}, existing);
}

/**
 * Save soramimi annotations for a song
 * Requires the song to exist (call after saveLyrics)
 */
export async function saveSoramimi(
  redis: Redis,
  id: string,
  soramimi: FuriganaSegment[][]
): Promise<SongDocument | null> {
  const existing = await getSong(redis, id, { 
    includeMetadata: true,
    includeLyrics: true,
    includeTranslations: true,
    includeFurigana: true,
    includeSoramimi: true,
  });
  if (!existing) return null;

  return saveSong(redis, {
    ...existing,
    soramimi,
  }, {}, existing);
}

/**
 * Check if a user can modify a song
 */
export function canModifySong(
  song: SongDocument | null,
  username: string | null
): { canModify: boolean; reason?: string } {
  if (!username) {
    return { canModify: false, reason: "Authentication required" };
  }

  const isAdmin = username.toLowerCase() === "ryo";

  // Admin can modify anything
  if (isAdmin) {
    return { canModify: true };
  }

  // New song - anyone authenticated can create
  if (!song) {
    return { canModify: true };
  }

  // Owner can modify their own songs
  if (!song.createdBy || song.createdBy === username) {
    return { canModify: true };
  }

  return { canModify: false, reason: "Can only modify your own songs" };
}
