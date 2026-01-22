/**
 * Song List/Batch API Endpoint
 *
 * GET /api/songs - List all songs
 * POST /api/songs - Create new song or bulk import
 * DELETE /api/songs - Delete all songs (admin only)
 *
 * Query params for GET:
 * - createdBy: Filter by creator username
 * - ids: Comma-separated list of IDs for batch fetch
 * - include: Comma-separated list of: metadata,lyrics,translations,furigana
 *
 * POST body for single song:
 * { id, title, artist?, album?, lyricOffset?, lyricsSource? }
 *
 * POST body for bulk import (action=import):
 * { action: "import", songs: [...] }
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import pako from "pako";
import {
  createRedis,
  getOriginFromVercel,
  isOriginAllowed,
  handlePreflight,
  getClientIpFromRequest,
} from "../_utils/middleware.js";
import { validateAuth } from "../_utils/auth/index.js";
import * as RateLimit from "../_utils/_rate-limit.js";
import {
  listSongs,
  saveSong,
  canModifySong,
  getSong,
  deleteAllSongs,
  getSongMetaKey,
  getSongContentKey,
  SONG_SET_KEY,
  type SongMetadata,
  type SongContent,
  type GetSongOptions,
  type LyricsSource,
} from "../_utils/_song-service.js";
import { fetchCoverUrl } from "./_kugou.js";

// Vercel Function configuration (runs on Bun via bunVersion in vercel.json)
export const config = {
  runtime: "nodejs",
};

// Rate limiting configuration
const RATE_LIMITS = {
  list: { windowSeconds: 60, limit: 120 },     // 120/min for listing
  create: { windowSeconds: 60, limit: 30 },    // 30/min for creating songs
  import: { windowSeconds: 60, limit: 5 },     // 5/min for bulk import (admin)
  delete: { windowSeconds: 60, limit: 5 },     // 5/min for delete all (admin)
};

// =============================================================================
// Schemas
// =============================================================================

const LyricsSourceSchema = z.object({
  hash: z.string(),
  albumId: z.union([z.string(), z.number()]),
  title: z.string(),
  artist: z.string(),
  album: z.string().optional(),
});

const CreateSongSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  artist: z.string().optional(),
  album: z.string().optional(),
  lyricOffset: z.number().optional(),
  lyricsSource: LyricsSourceSchema.optional(),
});

// Furigana/Soramimi segment schema
const FuriganaSegmentSchema = z.object({
  text: z.string(),
  reading: z.string().optional(),
});

// Lyrics content schema (cover is now in metadata, but accept it here for backwards compatibility during import)
const LyricsContentSchema = z.object({
  lrc: z.string().optional(),
  krc: z.string().optional(),
  cover: z.string().optional(), // Accepted during import but stored in metadata
});

// Helper to create a schema that accepts either compressed string or raw data
const compressedOrRaw = <T extends z.ZodTypeAny>(schema: T) => 
  z.union([z.string().startsWith("gzip:"), schema]);

const BulkImportSchema = z.object({
  action: z.literal("import"),
  songs: z.array(
    z.object({
      id: z.string().min(1),
      url: z.string().optional(),
      title: z.string().min(1),
      artist: z.string().optional(),
      album: z.string().optional(),
      lyricOffset: z.number().optional(),
      lyricsSource: LyricsSourceSchema.optional(),
      // Legacy format support
      lyricsSearch: z
        .object({
          query: z.string().optional(),
          selection: LyricsSourceSchema.optional(),
        })
        .optional(),
      // Content fields (v2/v3 export format) - can be compressed or raw
      lyrics: compressedOrRaw(LyricsContentSchema).optional(),
      translations: compressedOrRaw(z.record(z.string(), z.string())).optional(),
      furigana: compressedOrRaw(z.array(z.array(FuriganaSegmentSchema))).optional(),
      soramimi: compressedOrRaw(z.array(z.array(FuriganaSegmentSchema))).optional(),
      soramimiByLang: compressedOrRaw(z.record(z.string(), z.array(z.array(FuriganaSegmentSchema)))).optional(),
      // Timestamps for preserving original dates
      createdBy: z.string().optional(),
      createdAt: z.number().optional(),
      updatedAt: z.number().optional(),
      importOrder: z.number().optional(),
    })
  ),
});

// =============================================================================
// Utility Functions
// =============================================================================

function generateRequestId(): string {
  return Math.random().toString(36).substring(2, 10);
}

function logInfo(id: string, message: string, data?: unknown) {
  console.log(`[${id}] INFO: ${message}`, data ?? "");
}

function logError(id: string, message: string, error: unknown) {
  console.error(`[${id}] ERROR: ${message}`, error);
}

/**
 * Decompress a gzip:base64 encoded string back to the original data
 * Returns the parsed JSON if the string starts with "gzip:", otherwise returns null
 */
function decompressFromBase64<T>(value: unknown): T | null {
  if (typeof value !== "string" || !value.startsWith("gzip:")) {
    return null; // Not compressed, return null to indicate raw data should be used
  }

  try {
    const base64Data = value.slice(5); // Remove "gzip:" prefix
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Use ungzip since the data is gzip compressed (not raw deflate)
    const decompressed = pako.ungzip(bytes);
    const text = new TextDecoder("utf-8").decode(decompressed);
    return JSON.parse(text) as T;
  } catch (error) {
    console.error("Failed to decompress:", error);
    return null;
  }
}

/**
 * Get a field value, decompressing if needed
 * Works with both compressed (gzip:base64) and raw JSON data
 */
function getFieldValue<T>(value: unknown): T | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  // Check if it's a compressed string
  const decompressed = decompressFromBase64<T>(value);
  if (decompressed !== null) {
    return decompressed;
  }

  // Return raw value (already parsed JSON)
  return value as T;
}

// =============================================================================
// Main Handler
// =============================================================================

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const requestId = generateRequestId();
  const startTime = Date.now();

  console.log(`[${requestId}] ${req.method} /api/songs`);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    const handled = handlePreflight(req, res, ["GET", "POST", "DELETE", "OPTIONS"]);
    if (handled) return;
  }

  // Validate origin
  const effectiveOrigin = getOriginFromVercel(req);
  if (!isOriginAllowed(effectiveOrigin)) {
    res.status(403).end("Unauthorized");
    return;
  }

  // Create Redis client
  const redis = createRedis();

  // Helper for JSON responses
  const jsonResponse = (data: unknown, status = 200, headers: Record<string, string> = {}) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", effectiveOrigin!);
    for (const [key, value] of Object.entries(headers)) {
      res.setHeader(key, value);
    }
    res.status(status).json(data);
  };

  const errorResponse = (message: string, status = 400) => {
    logInfo(requestId, `Response: ${status} - ${message}`);
    jsonResponse({ error: message }, status);
  };

  try {
    // =========================================================================
    // GET: List songs
    // =========================================================================
    if (req.method === "GET") {
      // Rate limiting for GET
      const ip = getClientIpFromRequest(req);
      const rlKey = RateLimit.makeKey(["rl", "song", "list", "ip", ip]);
      const rlResult = await RateLimit.checkCounterLimit({
        key: rlKey,
        windowSeconds: RATE_LIMITS.list.windowSeconds,
        limit: RATE_LIMITS.list.limit,
      });
      
      if (!rlResult.allowed) {
        jsonResponse({
          error: "rate_limit_exceeded",
          limit: rlResult.limit,
          retryAfter: rlResult.resetSeconds,
        }, 429, { "Retry-After": String(rlResult.resetSeconds) });
        return;
      }
      
      const createdBy = (req.query.createdBy as string) || undefined;
      const idsParam = req.query.ids as string | undefined;
      const ids = idsParam ? idsParam.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
      const includeParam = (req.query.include as string) || "metadata";
      const includes = includeParam.split(",").map((s) => s.trim());

      logInfo(requestId, "Listing songs", { createdBy, idsCount: ids?.length, includes });

      const getOptions: GetSongOptions = {
        includeMetadata: includes.includes("metadata"),
        includeLyrics: includes.includes("lyrics"),
        includeTranslations: includes.includes("translations"),
        includeFurigana: includes.includes("furigana"),
        includeSoramimi: includes.includes("soramimi"),
      };

      const songs = await listSongs(redis, {
        createdBy,
        ids,
        getOptions,
      });

      logInfo(requestId, "Returning songs", {
        count: songs.length,
        duration: `${Date.now() - startTime}ms`,
      });

      jsonResponse({ songs });
      return;
    }

    // =========================================================================
    // POST: Create song or bulk import
    // =========================================================================
    if (req.method === "POST") {
      // Extract auth credentials
      const authHeader = req.headers["authorization"] as string | undefined;
      const usernameHeader = req.headers["x-username"] as string | undefined;
      const authToken = authHeader?.replace("Bearer ", "") || null;
      const username = usernameHeader || null;

      // Validate authentication
      const authResult = await validateAuth(redis, username, authToken);
      if (!authResult.valid) {
        errorResponse("Unauthorized - authentication required", 401);
        return;
      }

      let body: Record<string, unknown>;
      try {
        body = req.body;
      } catch (parseError) {
        logError(requestId, "Failed to parse request body", parseError);
        errorResponse("Invalid JSON body", 400);
        return;
      }
      logInfo(requestId, `POST action=${body.action || "create"}`, { 
        hasId: !!body.id,
        songsCount: Array.isArray(body.songs) ? body.songs.length : undefined 
      });

      // Handle bulk import (admin only)
      if (body.action === "import") {
        // Only admin can bulk import
        if (username?.toLowerCase() !== "ryo") {
          errorResponse("Forbidden - admin access required for bulk import", 403);
          return;
        }

        // Rate limiting for bulk import - by admin user
        const rlKey = RateLimit.makeKey(["rl", "song", "import", "user", username || "unknown"]);
        const rlResult = await RateLimit.checkCounterLimit({
          key: rlKey,
          windowSeconds: RATE_LIMITS.import.windowSeconds,
          limit: RATE_LIMITS.import.limit,
        });
        
        if (!rlResult.allowed) {
          jsonResponse({
            error: "rate_limit_exceeded",
            limit: rlResult.limit,
            retryAfter: rlResult.resetSeconds,
          }, 429, { "Retry-After": String(rlResult.resetSeconds) });
          return;
        }

        const parsed = BulkImportSchema.safeParse(body);
        if (!parsed.success) {
          jsonResponse(
            { error: "Invalid request body", details: parsed.error.format() },
            400
          );
          return;
        }

        const { songs } = parsed.data;
        const now = Date.now();

        logInfo(requestId, "Starting bulk import", { songCount: songs.length });

        // Batch fetch all existing songs (1 Redis call instead of N)
        const songIds = songs.map((s) => s.id);
        const existingSongs = await listSongs(redis, {
          ids: songIds,
          getOptions: { includeMetadata: true },
        });
        const existingMap = new Map(existingSongs.map((s) => [s.id, s]));

        // Build all song metadata and content documents
        // Use Promise.all to handle async decompression of content fields
        const songDocs = await Promise.all(songs.map(async (songData, i) => {
          const existing = existingMap.get(songData.id);

          // Convert legacy lyricsSearch to lyricsSource
          // Use type assertion since Zod's inferred type may differ slightly from LyricsSource
          let lyricsSource: LyricsSource | undefined = songData.lyricsSource as LyricsSource | undefined;
          if (!lyricsSource && songData.lyricsSearch?.selection) {
            lyricsSource = songData.lyricsSearch.selection as LyricsSource;
          }

          // Handle lyrics - may be compressed string or raw object
          // Extract cover from lyrics (old format) to put in metadata (new format)
          const lyricsValue = getFieldValue<{ lrc?: string; krc?: string; cover?: string }>(songData.lyrics);
          
          // Cover: prefer from lyrics data (backwards compat), otherwise from existing, otherwise fetch later
          const cover = lyricsValue?.cover || existing?.cover;

          // Build metadata (cover is now in metadata, not lyrics)
          // For imports, respect the original createdBy from the export file
          // Only fall back to existing song's creator, NOT to the importing user
          const meta: SongMetadata = {
            id: songData.id,
            title: songData.title,
            artist: songData.artist,
            album: songData.album,
            cover, // Will be updated later if we need to fetch it
            lyricOffset: songData.lyricOffset,
            lyricsSource,
            createdBy: songData.createdBy || existing?.createdBy,
            createdAt: songData.createdAt || existing?.createdAt || now - i, // Maintain order
            updatedAt: songData.updatedAt || now,
            importOrder: songData.importOrder ?? existing?.importOrder ?? i,
          };

          // Build content (if any content fields are present)
          // Content may be compressed (gzip:base64) or raw JSON - handle both
          const content: SongContent = {};
          
          // Handle lyrics - cover is extracted above and stored in metadata
          if (lyricsValue?.lrc) {
            content.lyrics = {
              lrc: lyricsValue.lrc,
              krc: lyricsValue.krc,
            };
          }
          
          // Handle translations - may be compressed string or raw object
          const translationsValue = getFieldValue<Record<string, string>>(songData.translations);
          if (translationsValue && Object.keys(translationsValue).length > 0) {
            content.translations = translationsValue;
          }
          
          // Handle furigana - may be compressed string or raw array
          const furiganaValue = getFieldValue<Array<Array<{ text: string; reading?: string }>>>(songData.furigana);
          if (furiganaValue && furiganaValue.length > 0) {
            content.furigana = furiganaValue;
          }
          
          // Handle soramimi - may be compressed string or raw array
          const soramimiValue = getFieldValue<Array<Array<{ text: string; reading?: string }>>>(songData.soramimi);
          if (soramimiValue && soramimiValue.length > 0) {
            content.soramimi = soramimiValue;
          }
          
          // Handle soramimiByLang - may be compressed string or raw object
          const soramimiByLangValue = getFieldValue<Record<string, Array<Array<{ text: string; reading?: string }>>>>(songData.soramimiByLang);
          if (soramimiByLangValue && Object.keys(soramimiByLangValue).length > 0) {
            content.soramimiByLang = soramimiByLangValue;
          }

          const hasContent = Object.keys(content).length > 0;

          return {
            meta,
            content: hasContent ? content : null,
            isUpdate: !!existing,
            needsCover: !meta.cover && !!lyricsSource,
          };
        }));

        // Fetch missing covers for songs that have lyricsSource but no cover
        const songsNeedingCovers = songDocs.filter(d => d.needsCover && d.meta.lyricsSource);
        if (songsNeedingCovers.length > 0) {
          logInfo(requestId, `Fetching ${songsNeedingCovers.length} missing covers from Kugou`);
          
          // Fetch covers in parallel (but limit concurrency to avoid rate limiting)
          const COVER_FETCH_BATCH_SIZE = 10;
          let fetchedCount = 0;
          
          for (let i = 0; i < songsNeedingCovers.length; i += COVER_FETCH_BATCH_SIZE) {
            const batch = songsNeedingCovers.slice(i, i + COVER_FETCH_BATCH_SIZE);
            const coverPromises = batch.map(async (doc) => {
              const source = doc.meta.lyricsSource!;
              try {
                const cover = await fetchCoverUrl(source.hash, source.albumId);
                if (cover) {
                  doc.meta.cover = cover;
                  fetchedCount++;
                }
              } catch (err) {
                // Log but don't fail the import if cover fetch fails
                console.warn(`[${requestId}] Failed to fetch cover for ${doc.meta.id}:`, err);
              }
            });
            await Promise.all(coverPromises);
          }
          
          logInfo(requestId, `Fetched ${fetchedCount}/${songsNeedingCovers.length} covers`);
        }

        // Use pipeline for all writes (1 batched Redis call)
        const pipeline = redis.pipeline();
        for (const { meta, content } of songDocs) {
          pipeline.set(getSongMetaKey(meta.id), JSON.stringify(meta));
          pipeline.sadd(SONG_SET_KEY, meta.id);
          // Save content if present
          if (content) {
            pipeline.set(getSongContentKey(meta.id), JSON.stringify(content));
          }
        }
        await pipeline.exec();

        const contentCount = songDocs.filter((d) => d.content !== null).length;

        const imported = songDocs.filter((d) => !d.isUpdate).length;
        const updated = songDocs.filter((d) => d.isUpdate).length;

        logInfo(requestId, "Bulk import complete", {
          imported,
          updated,
          withContent: contentCount,
          total: songs.length,
          duration: `${Date.now() - startTime}ms`,
        });

        jsonResponse({
          success: true,
          imported,
          updated,
          withContent: contentCount,
          total: songs.length,
        });
        return;
      }

      // Rate limiting for single song creation - by user
      const createRlKey = RateLimit.makeKey(["rl", "song", "create", "user", username || "unknown"]);
      const createRlResult = await RateLimit.checkCounterLimit({
        key: createRlKey,
        windowSeconds: RATE_LIMITS.create.windowSeconds,
        limit: RATE_LIMITS.create.limit,
      });
      
      if (!createRlResult.allowed) {
        jsonResponse({
          error: "rate_limit_exceeded",
          limit: createRlResult.limit,
          retryAfter: createRlResult.resetSeconds,
        }, 429, { "Retry-After": String(createRlResult.resetSeconds) });
        return;
      }

      // Single song creation
      const parsed = CreateSongSchema.safeParse(body);
      if (!parsed.success) {
        jsonResponse(
          { error: "Invalid request body", details: parsed.error.format() },
          400
        );
        return;
      }

      const songData = parsed.data;

      // Check permission
      const existing = await getSong(redis, songData.id, { includeMetadata: true });
      const permission = canModifySong(existing, username);
      if (!permission.canModify) {
        // For create, return success but indicate it was skipped
        if (existing) {
          jsonResponse({
            success: true,
            id: songData.id,
            isUpdate: false,
            skipped: true,
            createdBy: existing.createdBy,
            message: "Song already exists, created by another user",
          });
          return;
        }
        errorResponse(permission.reason || "Permission denied", 403);
        return;
      }

      const song = await saveSong(
        redis,
        {
          id: songData.id,
          title: songData.title,
          artist: songData.artist,
          album: songData.album,
          lyricOffset: songData.lyricOffset,
          lyricsSource: songData.lyricsSource as LyricsSource | undefined,
          createdBy: existing?.createdBy || username || undefined,
        },
        { preserveLyrics: true, preserveTranslations: true, preserveFurigana: true }
      );

      logInfo(requestId, existing ? "Song updated" : "Song created", {
        id: song.id,
        duration: `${Date.now() - startTime}ms`,
      });

      jsonResponse({
        success: true,
        id: song.id,
        isUpdate: !!existing,
        createdBy: song.createdBy,
      });
      return;
    }

    // =========================================================================
    // DELETE: Delete all songs (admin only)
    // =========================================================================
    if (req.method === "DELETE") {
      // Extract auth credentials
      const authHeader = req.headers["authorization"] as string | undefined;
      const usernameHeader = req.headers["x-username"] as string | undefined;
      const authToken = authHeader?.replace("Bearer ", "") || null;
      const username = usernameHeader || null;

      // Validate authentication
      const authResult = await validateAuth(redis, username, authToken);
      if (!authResult.valid) {
        errorResponse("Unauthorized - authentication required", 401);
        return;
      }

      // Only admin can delete all songs
      if (username?.toLowerCase() !== "ryo") {
        errorResponse("Forbidden - admin access required", 403);
        return;
      }

      // Rate limiting for delete all - by admin user
      const rlKey = RateLimit.makeKey(["rl", "song", "delete", "user", username || "unknown"]);
      const rlResult = await RateLimit.checkCounterLimit({
        key: rlKey,
        windowSeconds: RATE_LIMITS.delete.windowSeconds,
        limit: RATE_LIMITS.delete.limit,
      });
      
      if (!rlResult.allowed) {
        jsonResponse({
          error: "rate_limit_exceeded",
          limit: rlResult.limit,
          retryAfter: rlResult.resetSeconds,
        }, 429, { "Retry-After": String(rlResult.resetSeconds) });
        return;
      }

      logInfo(requestId, "Deleting all songs");

      const deletedCount = await deleteAllSongs(redis);

      logInfo(requestId, "Delete all complete", {
        deleted: deletedCount,
        duration: `${Date.now() - startTime}ms`,
      });

      jsonResponse({
        success: true,
        deleted: deletedCount,
      });
      return;
    }

    errorResponse("Method not allowed", 405);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    logError(requestId, "Song list API error", error);
    errorResponse(errorMessage, 500);
  }
}
