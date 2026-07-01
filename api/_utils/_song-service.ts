/**
 * Unified Song Service
 *
 * Provides a single source of truth for song data including:
 * - Metadata (title, artist, album, etc.) - stored in media:song:meta:{id}
 * - Content (lyrics, translations, furigana, soramimi) - stored in media:song:content:{id}
 *
 * Split storage avoids exceeding Upstash's 10MB request limit when listing songs.
 */

import type { Redis } from "./redis.js";
import { redisKeys } from "../../src/shared/redisKeys.js";
import type { ChineseLyricsLanguage } from "../../src/shared/media/chineseLyrics.js";

const REDIS_MGET_BATCH_SIZE = 100;

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
 * KuGou's raw lrc/krc stays intact while both processed Chinese script
 * variants are cached for script switching without reparsing.
 * NOTE: cover is now stored in SongMetadata, not here
 */
export interface LyricsContent {
  lrc: string; // LRC format lyrics (raw)
  krc?: string; // KRC format if available (raw)
  parsedLinesByLanguage?: Partial<
    Record<ChineseLyricsLanguage, ParsedLyricLine[]>
  >;
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
 * Song metadata stored in media:song:meta:{id}
 * Lightweight data for listing (~300 bytes per song)
 */
export interface SongMetadata {
  id: string; // YouTube video ID
  title: string;
  artist?: string;
  album?: string;
  cover?: string; // Cover image URL (from Kugou)
  coverColor?: string; // Cached boosted cover color for lyrics/title glow
  lyricOffset?: number; // Offset in ms to adjust lyrics timing
  lyricsSource?: LyricsSource;
  createdBy?: string;
  createdAt: number;
  updatedAt: number;
  importOrder?: number; // For stable sorting during bulk imports
}

/**
 * Song content stored in media:song:content:{id}
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
// Utility Functions
// =============================================================================

/**
 * Get the Redis key for song metadata
 */
export function getSongMetaKey(id: string): string {
  return redisKeys.media.songMeta(id);
}

/**
 * Get the Redis key for song content
 */
export function getSongContentKey(id: string): string {
  return redisKeys.media.songContent(id);
}

async function getSongIds(redis: Redis): Promise<string[]> {
  return (await redis.smembers<string[]>(redisKeys.media.songIds())) || [];
}

async function getSongMetaRaw(redis: Redis, id: string): Promise<unknown> {
  return await redis.get(getSongMetaKey(id));
}

async function getSongContentRaw(redis: Redis, id: string): Promise<unknown> {
  return await redis.get(getSongContentKey(id));
}

async function mgetInBatches<T = unknown>(
  redis: Redis,
  keys: string[]
): Promise<(T | null)[]> {
  if (keys.length === 0) {
    return [];
  }

  const mget = redis.mget.bind(redis) as <TValue = unknown>(
    ...batchKeys: string[]
  ) => Promise<(TValue | null)[]>;
  const results: (T | null)[] = [];
  for (let index = 0; index < keys.length; index += REDIS_MGET_BATCH_SIZE) {
    const batch = keys.slice(index, index + REDIS_MGET_BATCH_SIZE);
    results.push(...(await mget<T>(...batch)));
  }
  return results;
}

async function getSongMetaRows(
  redis: Redis,
  songIds: string[]
): Promise<Array<{ id: string; meta: SongMetadata }>> {
  const rawMetas = await mgetInBatches<unknown>(
    redis,
    songIds.map((songId) => getSongMetaKey(songId))
  );

  const rows: Array<{ id: string; meta: SongMetadata }> = [];
  for (let index = 0; index < songIds.length; index++) {
    const meta = parseJson<SongMetadata>(rawMetas[index]);
    if (meta) {
      rows.push({ id: songIds[index], meta });
    }
  }
  return rows;
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
  const metaRaw = await getSongMetaRaw(redis, id);
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
    result.coverColor = meta.coverColor;
    result.lyricOffset = meta.lyricOffset;
    result.lyricsSource = meta.lyricsSource;
    result.createdBy = meta.createdBy;
    result.importOrder = meta.importOrder;
  }

  // Fetch content if needed
  if (needsContent) {
    const contentRaw = await getSongContentRaw(redis, id);
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
  const coverChanged = song.cover !== undefined && song.cover !== existing?.cover;
  
  const meta: SongMetadata = {
    id: song.id,
    title: song.title ?? existing?.title ?? "",
    artist: song.artist ?? existing?.artist,
    album: song.album ?? existing?.album,
    cover: song.cover ?? existing?.cover,
    coverColor: song.coverColor ?? (coverChanged ? undefined : existing?.coverColor),
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
  await redis.sadd(redisKeys.media.songIds(), song.id);

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
  await redis.srem(redisKeys.media.songIds(), id);

  return true;
}

/**
 * Delete all songs from Redis (admin only)
 * Returns the number of songs deleted
 */
export async function deleteAllSongs(redis: Redis): Promise<number> {
  // Get all song IDs
  const songIds = await getSongIds(redis);
  
  if (!songIds || songIds.length === 0) {
    return 0;
  }

  // Delete all metadata and content keys
  const metaKeys = songIds.map((id) => getSongMetaKey(id));
  const contentKeys = songIds.map((id) => getSongContentKey(id));
  await redis.del(...metaKeys, ...contentKeys);

  // Clear the set
  await redis.del(redisKeys.media.songIds());

  return songIds.length;
}

export interface SongsVersionInfo {
  /** Highest updatedAt (falling back to createdAt) across matching songs. */
  version: number;
  /** Number of matching songs. */
  count: number;
}

/**
 * Lightweight version summary of the song catalog, so clients can poll for
 * changes (~50 byte response) instead of downloading the full metadata list
 * every interval.
 */
export async function getSongsVersionInfo(
  redis: Redis,
  options: { createdBy?: string } = {}
): Promise<SongsVersionInfo> {
  const { createdBy } = options;
  const songIds = await getSongIds(redis);
  if (!songIds || songIds.length === 0) {
    return { version: 0, count: 0 };
  }

  const metaRows = await getSongMetaRows(redis, songIds);

  let version = 0;
  let count = 0;
  for (const { meta } of metaRows) {
    if (createdBy && meta.createdBy !== createdBy) continue;
    count++;
    const stamp = meta.updatedAt || meta.createdAt || 0;
    if (stamp > version) version = stamp;
  }

  return { version, count };
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
    songIds = await getSongIds(redis);
  }

  if (!songIds || songIds.length === 0) {
    return [];
  }

  const needsContent = getOptions.includeLyrics || getOptions.includeTranslations || 
                       getOptions.includeFurigana || getOptions.includeSoramimi;

  const metaRows = await getSongMetaRows(redis, songIds);
  const songsWithIds: Array<{ id: string; song: SongDocument }> = [];
  for (const { id, meta } of metaRows) {
    if (createdBy && meta.createdBy !== createdBy) {
      continue;
    }

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
      result.coverColor = meta.coverColor;
      result.lyricOffset = meta.lyricOffset;
      result.lyricsSource = meta.lyricsSource;
      result.createdBy = meta.createdBy;
      result.importOrder = meta.importOrder;
    }

    songsWithIds.push({ id, song: result });
  }

  if (needsContent) {
    const rawContents = await mgetInBatches<unknown>(
      redis,
      songsWithIds.map(({ id }) => getSongContentKey(id))
    );

    for (let index = 0; index < songsWithIds.length; index++) {
      const rawContent = rawContents[index];
      if (rawContent) {
        const content = parseJson<SongContent>(rawContent);
        if (content) {
          const result = songsWithIds[index].song;
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
  }

  const songs = songsWithIds.map(({ song }) => song);

  // Sort by createdAt (newest first), then importOrder, then updatedAt (recent activity first)
  songs.sort((a, b) => {
    const createdAtDiff = (b.createdAt || 0) - (a.createdAt || 0);
    if (createdAtDiff !== 0) return createdAtDiff;
    const importDiff =
      (a.importOrder ?? Infinity) - (b.importOrder ?? Infinity);
    if (importDiff !== 0) return importDiff;
    return (b.updatedAt || 0) - (a.updatedAt || 0);
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
  const existingMeta = parseJson<SongMetadata>(await getSongMetaRaw(redis, id));
  
  // Get existing content to preserve other fields
  const existingContent = parseJson<SongContent>(await getSongContentRaw(redis, id));

  // Check if lyrics source changed (compare by hash)
  // If changed, we need to clear cached annotations since they're tied to the old lyrics
  const lyricsSourceChanged = lyricsSource?.hash && 
    existingMeta?.lyricsSource?.hash && 
    lyricsSource.hash !== existingMeta.lyricsSource.hash;
  
  // Clear annotations if source changed OR if explicitly requested (e.g., force refresh)
  const shouldClearAnnotations = clearAnnotations || lyricsSourceChanged;

  // Build/update metadata
  const coverChanged = cover !== undefined && cover !== existingMeta?.cover;
  const meta: SongMetadata = {
    id,
    title: existingMeta?.title || lyricsSource?.title || id,
    artist: existingMeta?.artist || lyricsSource?.artist,
    album: existingMeta?.album || lyricsSource?.album,
    cover: cover ?? existingMeta?.cover,
    coverColor: coverChanged ? undefined : existingMeta?.coverColor,
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

  // Save canonical keys
  await redis.set(metaKey, JSON.stringify(meta));
  await redis.set(contentKey, JSON.stringify(content));
  await redis.sadd(redisKeys.media.songIds(), id);

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
  return saveTranslations(redis, id, { [language]: translatedLrc });
}

/**
 * Save multiple translations atomically (updates content key only).
 * Requires the song to exist (call after saveLyrics).
 */
export async function saveTranslations(
  redis: Redis,
  id: string,
  translations: Record<string, string>
): Promise<SongDocument | null> {
  const contentKey = getSongContentKey(id);

  // Verify song exists
  const existingMeta = parseJson<SongMetadata>(await getSongMetaRaw(redis, id));
  if (!existingMeta) return null;

  // Get existing content
  const existingContent = parseJson<SongContent>(await getSongContentRaw(redis, id)) ?? {};

  // Update translations
  const content: SongContent = {
    ...existingContent,
    translations: { ...existingContent.translations, ...translations },
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
  const contentKey = getSongContentKey(id);

  // Verify song exists
  const existingMeta = parseJson<SongMetadata>(await getSongMetaRaw(redis, id));
  if (!existingMeta) return null;

  // Get existing content
  const existingContent = parseJson<SongContent>(await getSongContentRaw(redis, id)) ?? {};

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
  const contentKey = getSongContentKey(id);

  // Verify song exists
  const existingMeta = parseJson<SongMetadata>(await getSongMetaRaw(redis, id));
  if (!existingMeta) return null;

  // Get existing content
  const existingContent = parseJson<SongContent>(await getSongContentRaw(redis, id)) ?? {};

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
