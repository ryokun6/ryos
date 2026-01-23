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
  getEffectiveOriginNode,
  isAllowedOrigin,
  setCorsHeadersNode,
  handlePreflightNode,
  getClientIpNode,
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

// Vercel Node.js Function configuration
export const runtime = "nodejs";
export const maxDuration = 120;

// Rate limiting configuration
const RATE_LIMITS = {
  list: { windowSeconds: 60, limit: 120 },
  create: { windowSeconds: 60, limit: 30 },
  import: { windowSeconds: 60, limit: 5 },
  delete: { windowSeconds: 60, limit: 5 },
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

const FuriganaSegmentSchema = z.object({
  text: z.string(),
  reading: z.string().optional(),
});

const LyricsContentSchema = z.object({
  lrc: z.string().optional(),
  krc: z.string().optional(),
  cover: z.string().optional(),
});

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
      lyricsSearch: z
        .object({
          query: z.string().optional(),
          selection: LyricsSourceSchema.optional(),
        })
        .optional(),
      lyrics: compressedOrRaw(LyricsContentSchema).optional(),
      translations: compressedOrRaw(z.record(z.string(), z.string())).optional(),
      furigana: compressedOrRaw(z.array(z.array(FuriganaSegmentSchema))).optional(),
      soramimi: compressedOrRaw(z.array(z.array(FuriganaSegmentSchema))).optional(),
      soramimiByLang: compressedOrRaw(z.record(z.string(), z.array(z.array(FuriganaSegmentSchema)))).optional(),
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

function decompressFromBase64<T>(value: unknown): T | null {
  if (typeof value !== "string" || !value.startsWith("gzip:")) {
    return null;
  }

  try {
    const base64Data = value.slice(5);
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const decompressed = pako.ungzip(bytes);
    const text = new TextDecoder("utf-8").decode(decompressed);
    return JSON.parse(text) as T;
  } catch (error) {
    console.error("Failed to decompress:", error);
    return null;
  }
}

function getFieldValue<T>(value: unknown): T | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const decompressed = decompressFromBase64<T>(value);
  if (decompressed !== null) {
    return decompressed;
  }
  return value as T;
}

// Helper to get header value from VercelRequest
function getHeader(req: VercelRequest, name: string): string | null {
  const value = req.headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

// =============================================================================
// Main Handler
// =============================================================================

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  const requestId = generateRequestId();
  const startTime = Date.now();

  console.log(`[${requestId}] ${req.method} /api/songs`);

  const effectiveOrigin = getEffectiveOriginNode(req);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    if (handlePreflightNode(req, res, ["GET", "POST", "DELETE", "OPTIONS"], effectiveOrigin)) {
      return;
    }
  }

  // Validate origin
  if (!isAllowedOrigin(effectiveOrigin)) {
    return res.status(403).send("Unauthorized");
  }

  // Create Redis client
  const redis = createRedis();

  // Helper for JSON responses
  const jsonResponse = (data: unknown, status = 200, headers: Record<string, string> = {}) => {
    setCorsHeadersNode(res, effectiveOrigin);
    Object.entries(headers).forEach(([key, value]) => res.setHeader(key, value));
    return res.status(status).json(data);
  };

  const errorResponse = (message: string, status = 400) => {
    logInfo(requestId, `Response: ${status} - ${message}`);
    return jsonResponse({ error: message }, status);
  };

  try {
    // =========================================================================
    // GET: List songs
    // =========================================================================
    if (req.method === "GET") {
      const ip = getClientIpNode(req);
      const rlKey = RateLimit.makeKey(["rl", "song", "list", "ip", ip]);
      const rlResult = await RateLimit.checkCounterLimit({
        key: rlKey,
        windowSeconds: RATE_LIMITS.list.windowSeconds,
        limit: RATE_LIMITS.list.limit,
      });
      
      if (!rlResult.allowed) {
        return jsonResponse({
          error: "rate_limit_exceeded",
          limit: rlResult.limit,
          retryAfter: rlResult.resetSeconds,
        }, 429, { "Retry-After": String(rlResult.resetSeconds) });
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

      return jsonResponse({ songs });
    }

    // =========================================================================
    // POST: Create song or bulk import
    // =========================================================================
    if (req.method === "POST") {
      const authHeader = getHeader(req, "Authorization");
      const usernameHeader = getHeader(req, "X-Username");
      const authToken = authHeader?.replace("Bearer ", "") || null;
      const username = usernameHeader || null;

      const authResult = await validateAuth(redis, username, authToken);
      if (!authResult.valid) {
        return errorResponse("Unauthorized - authentication required", 401);
      }

      const body = req.body as Record<string, unknown>;
      if (!body || typeof body !== "object") {
        logError(requestId, "Failed to parse request body", "Invalid body");
        return errorResponse("Invalid JSON body", 400);
      }

      logInfo(requestId, `POST action=${body.action || "create"}`, { 
        hasId: !!body.id,
        songsCount: Array.isArray(body.songs) ? body.songs.length : undefined 
      });

      // Handle bulk import (admin only)
      if (body.action === "import") {
        if (username?.toLowerCase() !== "ryo") {
          return errorResponse("Forbidden - admin access required for bulk import", 403);
        }

        const rlKey = RateLimit.makeKey(["rl", "song", "import", "user", username || "unknown"]);
        const rlResult = await RateLimit.checkCounterLimit({
          key: rlKey,
          windowSeconds: RATE_LIMITS.import.windowSeconds,
          limit: RATE_LIMITS.import.limit,
        });
        
        if (!rlResult.allowed) {
          return jsonResponse({
            error: "rate_limit_exceeded",
            limit: rlResult.limit,
            retryAfter: rlResult.resetSeconds,
          }, 429, { "Retry-After": String(rlResult.resetSeconds) });
        }

        const parsed = BulkImportSchema.safeParse(body);
        if (!parsed.success) {
          return jsonResponse(
            { error: "Invalid request body", details: parsed.error.format() },
            400
          );
        }

        const { songs } = parsed.data;
        const now = Date.now();

        logInfo(requestId, "Starting bulk import", { songCount: songs.length });

        const songIds = songs.map((s) => s.id);
        const existingSongs = await listSongs(redis, {
          ids: songIds,
          getOptions: { includeMetadata: true },
        });
        const existingMap = new Map(existingSongs.map((s) => [s.id, s]));

        const songDocs = await Promise.all(songs.map(async (songData, i) => {
          const existing = existingMap.get(songData.id);

          let lyricsSource: LyricsSource | undefined = songData.lyricsSource as LyricsSource | undefined;
          if (!lyricsSource && songData.lyricsSearch?.selection) {
            lyricsSource = songData.lyricsSearch.selection as LyricsSource;
          }

          const lyricsValue = getFieldValue<{ lrc?: string; krc?: string; cover?: string }>(songData.lyrics);
          const cover = lyricsValue?.cover || existing?.cover;

          const meta: SongMetadata = {
            id: songData.id,
            title: songData.title,
            artist: songData.artist,
            album: songData.album,
            cover,
            lyricOffset: songData.lyricOffset,
            lyricsSource,
            createdBy: songData.createdBy || existing?.createdBy,
            createdAt: songData.createdAt || existing?.createdAt || now - i,
            updatedAt: songData.updatedAt || now,
            importOrder: songData.importOrder ?? existing?.importOrder ?? i,
          };

          const content: SongContent = {};
          
          if (lyricsValue?.lrc) {
            content.lyrics = {
              lrc: lyricsValue.lrc,
              krc: lyricsValue.krc,
            };
          }
          
          const translationsValue = getFieldValue<Record<string, string>>(songData.translations);
          if (translationsValue && Object.keys(translationsValue).length > 0) {
            content.translations = translationsValue;
          }
          
          const furiganaValue = getFieldValue<Array<Array<{ text: string; reading?: string }>>>(songData.furigana);
          if (furiganaValue && furiganaValue.length > 0) {
            content.furigana = furiganaValue;
          }
          
          const soramimiValue = getFieldValue<Array<Array<{ text: string; reading?: string }>>>(songData.soramimi);
          if (soramimiValue && soramimiValue.length > 0) {
            content.soramimi = soramimiValue;
          }
          
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

        const songsNeedingCovers = songDocs.filter(d => d.needsCover && d.meta.lyricsSource);
        if (songsNeedingCovers.length > 0) {
          logInfo(requestId, `Fetching ${songsNeedingCovers.length} missing covers from Kugou`);
          
          const COVER_FETCH_BATCH_SIZE = 10;
          let fetchedCount = 0;
          
          for (let i = 0; i < songsNeedingCovers.length; i += COVER_FETCH_BATCH_SIZE) {
            const batch = songsNeedingCovers.slice(i, i + COVER_FETCH_BATCH_SIZE);
            const coverPromises = batch.map(async (doc) => {
              const source = doc.meta.lyricsSource!;
              try {
                const coverUrl = await fetchCoverUrl(source.hash, source.albumId);
                if (coverUrl) {
                  doc.meta.cover = coverUrl;
                  fetchedCount++;
                }
              } catch (err) {
                console.warn(`[${requestId}] Failed to fetch cover for ${doc.meta.id}:`, err);
              }
            });
            await Promise.all(coverPromises);
          }
          
          logInfo(requestId, `Fetched ${fetchedCount}/${songsNeedingCovers.length} covers`);
        }

        const pipeline = redis.pipeline();
        for (const { meta, content } of songDocs) {
          pipeline.set(getSongMetaKey(meta.id), JSON.stringify(meta));
          pipeline.sadd(SONG_SET_KEY, meta.id);
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

        return jsonResponse({
          success: true,
          imported,
          updated,
          withContent: contentCount,
          total: songs.length,
        });
      }

      // Rate limiting for single song creation
      const createRlKey = RateLimit.makeKey(["rl", "song", "create", "user", username || "unknown"]);
      const createRlResult = await RateLimit.checkCounterLimit({
        key: createRlKey,
        windowSeconds: RATE_LIMITS.create.windowSeconds,
        limit: RATE_LIMITS.create.limit,
      });
      
      if (!createRlResult.allowed) {
        return jsonResponse({
          error: "rate_limit_exceeded",
          limit: createRlResult.limit,
          retryAfter: createRlResult.resetSeconds,
        }, 429, { "Retry-After": String(createRlResult.resetSeconds) });
      }

      // Single song creation
      const parsed = CreateSongSchema.safeParse(body);
      if (!parsed.success) {
        return jsonResponse(
          { error: "Invalid request body", details: parsed.error.format() },
          400
        );
      }

      const songData = parsed.data;
      const existing = await getSong(redis, songData.id, { includeMetadata: true });
      const permission = canModifySong(existing, username);
      if (!permission.canModify) {
        if (existing) {
          return jsonResponse({
            success: true,
            id: songData.id,
            isUpdate: false,
            skipped: true,
            createdBy: existing.createdBy,
            message: "Song already exists, created by another user",
          });
        }
        return errorResponse(permission.reason || "Permission denied", 403);
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

      return jsonResponse({
        success: true,
        id: song.id,
        isUpdate: !!existing,
        createdBy: song.createdBy,
      });
    }

    // =========================================================================
    // DELETE: Delete all songs (admin only)
    // =========================================================================
    if (req.method === "DELETE") {
      const authHeader = getHeader(req, "Authorization");
      const usernameHeader = getHeader(req, "X-Username");
      const authToken = authHeader?.replace("Bearer ", "") || null;
      const username = usernameHeader || null;

      const authResult = await validateAuth(redis, username, authToken);
      if (!authResult.valid) {
        return errorResponse("Unauthorized - authentication required", 401);
      }

      if (username?.toLowerCase() !== "ryo") {
        return errorResponse("Forbidden - admin access required", 403);
      }

      const rlKey = RateLimit.makeKey(["rl", "song", "delete", "user", username || "unknown"]);
      const rlResult = await RateLimit.checkCounterLimit({
        key: rlKey,
        windowSeconds: RATE_LIMITS.delete.windowSeconds,
        limit: RATE_LIMITS.delete.limit,
      });
      
      if (!rlResult.allowed) {
        return jsonResponse({
          error: "rate_limit_exceeded",
          limit: rlResult.limit,
          retryAfter: rlResult.resetSeconds,
        }, 429, { "Retry-After": String(rlResult.resetSeconds) });
      }

      logInfo(requestId, "Deleting all songs");

      const deletedCount = await deleteAllSongs(redis);

      logInfo(requestId, "Delete all complete", {
        deleted: deletedCount,
        duration: `${Date.now() - startTime}ms`,
      });

      return jsonResponse({
        success: true,
        deleted: deletedCount,
      });
    }

    return errorResponse("Method not allowed", 405);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    logError(requestId, "Song list API error", error);
    return errorResponse(errorMessage, 500);
  }
}
