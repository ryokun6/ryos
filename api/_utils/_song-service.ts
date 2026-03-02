/**
 * Unified Song Service
 *
 * Provides a single source of truth for song data including:
 * - Metadata (title, artist, album, etc.) - stored in song:meta:{id}
 * - Content (lyrics, translations, furigana, soramimi) - stored in song:content:{id}
 *
 * Split storage avoids exceeding Upstash's 10MB request limit when listing songs.
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
 * Stored lyrics content (what we save in Redis)
 * NOTE: parsedLines is NOT stored - it's derived from lrc/krc on-demand
 * NOTE: cover is now stored in SongMetadata, not here
 */
export interface LyricsContent {
  lrc: string; // LRC format lyrics (raw)
  krc?: string; // KRC format if available (raw)
}

/**
 * Lyrics content with parsed lines for API responses
 * This is what the client receives - parsedLines is generated on-demand
 */
export interface LyricsResponse extends LyricsContent {
  parsedLines: ParsedLyricLine[]; // Generated on-demand from lrc/krc
}

/**
 * Furigana segment for Japanese text
 */
export interface FuriganaSegment {
  text: string;
  reading?: string; // Hiragana reading for kanji
}

/**
 * Song metadata stored in song:meta:{id}
 * Lightweight data for listing (~300 bytes per song)
 */
export interface SongMetadata {
  id: string; // YouTube video ID
  title: string;
  artist?: string;
  album?: string;
  cover?: string; // Cover image URL (from Kugou)
  lyricOffset?: number; // Offset in ms to adjust lyrics timing
  lyricsSource?: LyricsSource;
  createdBy?: string;
  createdAt: number;
  updatedAt: number;
  importOrder?: number; // For stable sorting during bulk imports
}

/**
 * Song content stored in song:content:{id}
 * Heavy data (~5-50KB per song)
 */
export interface SongContent {
  lyrics?: LyricsContent;
  translations?: Record<string, string>;
  furigana?: FuriganaSegment[][];
  soramimi?: FuriganaSegment[][];
  soramimiByLang?: Record<string, FuriganaSegment[][]>;
}

/**
 * Unified song document (metadata + content combined)
 * Used for API responses and internal operations
 */
export interface SongDocument extends SongMetadata, SongContent {}

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

/** Redis key prefix for song metadata (lightweight) */
export const SONG_META_PREFIX = "song:meta:";

/** Redis key prefix for song content (heavy data) */
export const SONG_CONTENT_PREFIX = "song:content:";

/** Redis set tracking all song IDs */
export const SONG_SET_KEY = "song:all";

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get the Redis key for song metadata
 */
export function getSongMetaKey(id: string): string {
  return `${SONG_META_PREFIX}${id}`;
}

/**
 * Get the Redis key for song content
 */
export function getSongContentKey(id: string): string {
  return `${SONG_CONTENT_PREFIX}${id}`;
}

/**
 * Parse stored data (handles both string and object formats)
 */
function parseJson<T>(raw: unknown): T | null {
  if (!raw) return null;
  try {
    return typeof raw === "string" ? JSON.parse(raw) : (raw as T);
  } catch {
    return null;
  }
}

// =============================================================================
// CRUD Operations
// =============================================================================

/**
 * Get a song by ID from Redis
 * Fetches metadata always, content only when needed
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
    includeSoramimi = false,
  } = options;

  // Determine if we need content
  const needsContent = includeLyrics || includeTranslations || includeFurigana || includeSoramimi;

  // Fetch metadata (always needed)
  const metaKey = getSongMetaKey(id);
  const metaRaw = await redis.get(metaKey);
  const meta = parseJson<SongMetadata>(metaRaw);

  if (!meta) return null;

  // Build result with metadata
  const result: SongDocument = {
    id: meta.id,
    title: meta.title,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
  };

  if (includeMetadata) {
    result.artist = meta.artist;
    result.album = meta.album;
    result.cover = meta.cover;
    result.lyricOffset = meta.lyricOffset;
    result.lyricsSource = meta.lyricsSource;
    result.createdBy = meta.createdBy;
    result.importOrder = meta.importOrder;
  }

  // Fetch content if needed
  if (needsContent) {
    const contentKey = getSongContentKey(id);
    const contentRaw = await redis.get(contentKey);
    const content = parseJson<SongContent>(contentRaw);

    if (content) {
      if (includeLyrics && content.lyrics) {
        result.lyrics = content.lyrics;
      }

      if (includeFurigana && content.furigana) {
        result.furigana = content.furigana;
      }

      if (includeSoramimi) {
        if (content.soramimi) {
          result.soramimi = content.soramimi;
        }
        if (content.soramimiByLang) {
          result.soramimiByLang = content.soramimiByLang;
        }
      }

      if (includeTranslations && content.translations) {
        if (includeTranslations === true) {
          result.translations = content.translations;
        } else if (Array.isArray(includeTranslations)) {
          result.translations = {};
          for (const lang of includeTranslations) {
            if (content.translations[lang]) {
              result.translations[lang] = content.translations[lang];
            }
          }
        }
      }
    }
  }

  return result;
}

/**
 * Save a song to Redis (split storage: metadata + content)
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
  const now = Date.now();

  // Get existing song to merge with (use provided or fetch full document)
  const existing = existingSong !== undefined 
    ? existingSong 
    : await getSong(redis, song.id, {
        includeMetadata: true,
        includeLyrics: true,
        includeTranslations: true,
        includeFurigana: true,
        includeSoramimi: true,
      });

  // Build metadata document
  // Note: For createdBy, we check if the key exists in the song object to allow explicit clearing
  const createdByValue = 'createdBy' in song ? song.createdBy : existing?.createdBy;
  
  const meta: SongMetadata = {
    id: song.id,
    title: song.title ?? existing?.title ?? "",
    artist: song.artist ?? existing?.artist,
    album: song.album ?? existing?.album,
    cover: song.cover ?? existing?.cover,
    lyricOffset: song.lyricOffset ?? existing?.lyricOffset,
    lyricsSource: song.lyricsSource ?? existing?.lyricsSource,
    createdBy: createdByValue,
    createdAt: existing?.createdAt ?? song.createdAt ?? now,
    updatedAt: now,
    importOrder: song.importOrder ?? existing?.importOrder,
  };

  // Build content document
  // When preserve* is false AND the field is explicitly in the song object, use the song value (even if undefined)
  // This allows explicit clearing of fields by passing undefined
  const hasSoramimiField = 'soramimi' in song;
  const hasSoramimiByLangField = 'soramimiByLang' in song;
  const hasFuriganaField = 'furigana' in song;
  const hasTranslationsField = 'translations' in song;
  const hasLyricsField = 'lyrics' in song;

  const content: SongContent = {
    lyrics: preserveLyrics 
      ? (existing?.lyrics ?? song.lyrics) 
      : (hasLyricsField ? song.lyrics : existing?.lyrics),
    translations: preserveTranslations
      ? { ...existing?.translations, ...song.translations }
      : (hasTranslationsField ? song.translations : existing?.translations),
    furigana: preserveFurigana 
      ? (existing?.furigana ?? song.furigana) 
      : (hasFuriganaField ? song.furigana : existing?.furigana),
    soramimi: preserveSoramimi 
      ? (existing?.soramimi ?? song.soramimi) 
      : (hasSoramimiField ? song.soramimi : existing?.soramimi),
    soramimiByLang: preserveSoramimi 
      ? { ...existing?.soramimiByLang, ...song.soramimiByLang }
      : (hasSoramimiByLangField ? song.soramimiByLang : existing?.soramimiByLang),
  };

  // Save metadata to Redis
  await redis.set(getSongMetaKey(song.id), JSON.stringify(meta));

  // Save content to Redis (only if there's any content)
  const hasContent = content.lyrics || content.translations || content.furigana || 
                     content.soramimi || content.soramimiByLang;
  if (hasContent) {
    await redis.set(getSongContentKey(song.id), JSON.stringify(content));
  }

  // Add to the set of all song IDs
  await redis.sadd(SONG_SET_KEY, song.id);

  // Return combined document
  return { ...meta, ...content };
}

/**
 * Delete a song from Redis (both metadata and content keys)
 */
export async function deleteSong(redis: Redis, id: string): Promise<boolean> {
  const metaKey = getSongMetaKey(id);

  // Check if exists
  const exists = await redis.exists(metaKey);
  if (!exists) return false;

  // Delete both metadata and content keys
  await redis.del(metaKey, getSongContentKey(id));

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

  // Delete all metadata and content keys
  const metaKeys = songIds.map((id) => getSongMetaKey(id));
  const contentKeys = songIds.map((id) => getSongContentKey(id));
  await redis.del(...metaKeys, ...contentKeys);

  // Clear the set
  await redis.del(SONG_SET_KEY);

  return songIds.length;
}

/**
 * List songs with optional filtering
 * Only fetches metadata by default (lightweight), fetches content only when requested
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

  // Determine if we need content
  const needsContent = getOptions.includeLyrics || getOptions.includeTranslations || 
                       getOptions.includeFurigana || getOptions.includeSoramimi;

  // Fetch all metadata (lightweight, ~300 bytes per song)
  const metaKeys = songIds.map((id) => getSongMetaKey(id));
  const rawMetas = await redis.mget(...metaKeys);

  // Fetch content only if needed (heavy data)
  let rawContents: (string | null)[] | null = null;
  if (needsContent) {
    const contentKeys = songIds.map((id) => getSongContentKey(id));
    rawContents = await redis.mget(...contentKeys) as (string | null)[];
  }

  const songs: SongDocument[] = [];
  for (let i = 0; i < rawMetas.length; i++) {
    const rawMeta = rawMetas[i];
    if (!rawMeta) continue;

    const meta = parseJson<SongMetadata>(rawMeta);
    if (!meta) continue;

    // Filter by createdBy if specified
    if (createdBy && meta.createdBy !== createdBy) {
      continue;
    }

    // Build result with metadata
    const result: SongDocument = {
      id: meta.id,
      title: meta.title,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
    };

    if (getOptions.includeMetadata) {
      result.artist = meta.artist;
      result.album = meta.album;
      result.cover = meta.cover;
      result.lyricOffset = meta.lyricOffset;
      result.lyricsSource = meta.lyricsSource;
      result.createdBy = meta.createdBy;
      result.importOrder = meta.importOrder;
    }

    // Add content if fetched
    if (needsContent && rawContents) {
      const rawContent = rawContents[i];
      if (rawContent) {
        const content = parseJson<SongContent>(rawContent);
        if (content) {
          if (getOptions.includeLyrics && content.lyrics) {
            result.lyrics = content.lyrics;
          }

          if (getOptions.includeFurigana && content.furigana) {
            result.furigana = content.furigana;
          }

          if (getOptions.includeSoramimi) {
            if (content.soramimi) {
              result.soramimi = content.soramimi;
            }
            if (content.soramimiByLang) {
              result.soramimiByLang = content.soramimiByLang;
            }
          }

          if (getOptions.includeTranslations && content.translations) {
            if (getOptions.includeTranslations === true) {
              result.translations = content.translations;
            } else if (Array.isArray(getOptions.includeTranslations)) {
              result.translations = {};
              for (const lang of getOptions.includeTranslations) {
                if (content.translations[lang]) {
                  result.translations[lang] = content.translations[lang];
                }
              }
            }
          }
        }
      }
    }

    songs.push(result);
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
 * Creates metadata if it doesn't exist, updates content key directly
 * 
 * NOTE: When lyrics source changes (different hash), cached annotations
 * (translations, furigana, soramimi) are cleared since they're tied to
 * the specific lyrics content.
 * 
 * @param cover - Cover image URL (stored in metadata, not lyrics content)
 * @param clearAnnotations - Force clear all cached annotations (translations, furigana, soramimi)
 */
export async function saveLyrics(
  redis: Redis,
  id: string,
  lyrics: LyricsContent,
  lyricsSource?: LyricsSource,
  cover?: string,
  clearAnnotations?: boolean
): Promise<SongDocument> {
  const metaKey = getSongMetaKey(id);
  const contentKey = getSongContentKey(id);
  const now = Date.now();

  // Get existing metadata
  const existingMeta = parseJson<SongMetadata>(await redis.get(metaKey));
  
  // Get existing content to preserve other fields
  const existingContent = parseJson<SongContent>(await redis.get(contentKey));

  // Check if lyrics source changed (compare by hash)
  // If changed, we need to clear cached annotations since they're tied to the old lyrics
  const lyricsSourceChanged = lyricsSource?.hash && 
    existingMeta?.lyricsSource?.hash && 
    lyricsSource.hash !== existingMeta.lyricsSource.hash;
  
  // Clear annotations if source changed OR if explicitly requested (e.g., force refresh)
  const shouldClearAnnotations = clearAnnotations || lyricsSourceChanged;

  // Build/update metadata
  const meta: SongMetadata = {
    id,
    title: existingMeta?.title || lyricsSource?.title || id,
    artist: existingMeta?.artist || lyricsSource?.artist,
    album: existingMeta?.album || lyricsSource?.album,
    cover: cover ?? existingMeta?.cover,
    lyricOffset: existingMeta?.lyricOffset,
    lyricsSource: lyricsSource ?? existingMeta?.lyricsSource,
    createdBy: existingMeta?.createdBy,
    createdAt: existingMeta?.createdAt ?? now,
    updatedAt: now,
    importOrder: existingMeta?.importOrder,
  };

  // Build content
  // Clear annotations if source changed or explicitly requested (e.g., force refresh)
  // Otherwise preserve existing translations, furigana, soramimi
  const content: SongContent = {
    lyrics,
    translations: shouldClearAnnotations ? undefined : existingContent?.translations,
    furigana: shouldClearAnnotations ? undefined : existingContent?.furigana,
    soramimi: shouldClearAnnotations ? undefined : existingContent?.soramimi,
    soramimiByLang: shouldClearAnnotations ? undefined : existingContent?.soramimiByLang,
  };

  // Save both keys
  await redis.set(metaKey, JSON.stringify(meta));
  await redis.set(contentKey, JSON.stringify(content));
  await redis.sadd(SONG_SET_KEY, id);

  return { ...meta, ...content };
}

/**
 * Save a translation for a song (updates content key only)
 * Requires the song to exist (call after saveLyrics)
 */
export async function saveTranslation(
  redis: Redis,
  id: string,
  language: string,
  translatedLrc: string
): Promise<SongDocument | null> {
  const metaKey = getSongMetaKey(id);
  const contentKey = getSongContentKey(id);

  // Verify song exists
  const existingMeta = parseJson<SongMetadata>(await redis.get(metaKey));
  if (!existingMeta) return null;

  // Get existing content
  const existingContent = parseJson<SongContent>(await redis.get(contentKey)) ?? {};

  // Update translations
  const content: SongContent = {
    ...existingContent,
    translations: { ...existingContent.translations, [language]: translatedLrc },
  };

  // Save content key only
  await redis.set(contentKey, JSON.stringify(content));

  return { ...existingMeta, ...content };
}

/**
 * Save furigana annotations for a song (updates content key only)
 * Requires the song to exist (call after saveLyrics)
 */
export async function saveFurigana(
  redis: Redis,
  id: string,
  furigana: FuriganaSegment[][]
): Promise<SongDocument | null> {
  const metaKey = getSongMetaKey(id);
  const contentKey = getSongContentKey(id);

  // Verify song exists
  const existingMeta = parseJson<SongMetadata>(await redis.get(metaKey));
  if (!existingMeta) return null;

  // Get existing content
  const existingContent = parseJson<SongContent>(await redis.get(contentKey)) ?? {};

  // Update furigana
  const content: SongContent = {
    ...existingContent,
    furigana,
  };

  // Save content key only
  await redis.set(contentKey, JSON.stringify(content));

  return { ...existingMeta, ...content };
}

/**
 * Save soramimi annotations for a song (updates content key only)
 * Requires the song to exist (call after saveLyrics)
 * @param language - Target language: "zh-TW" for Chinese, "en" for English.
 */
export async function saveSoramimi(
  redis: Redis,
  id: string,
  soramimi: FuriganaSegment[][],
  language?: "zh-TW" | "en"
): Promise<SongDocument | null> {
  const metaKey = getSongMetaKey(id);
  const contentKey = getSongContentKey(id);

  // Verify song exists
  const existingMeta = parseJson<SongMetadata>(await redis.get(metaKey));
  if (!existingMeta) return null;

  // Get existing content
  const existingContent = parseJson<SongContent>(await redis.get(contentKey)) ?? {};

  // Update soramimi (use language-specific field if language provided)
  const content: SongContent = {
    ...existingContent,
    ...(language
      ? { soramimiByLang: { ...existingContent.soramimiByLang, [language]: soramimi } }
      : { soramimi }),
  };

  // Save content key only
  await redis.set(contentKey, JSON.stringify(content));

  return { ...existingMeta, ...content };
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
