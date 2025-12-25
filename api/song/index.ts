/**
 * Song List/Batch API Endpoint
 *
 * GET /api/song - List all songs
 * POST /api/song - Create new song or bulk import
 * DELETE /api/song - Delete all songs (admin only)
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

import { Redis } from "@upstash/redis";
import { z } from "zod";
import {
  getEffectiveOrigin,
  isAllowedOrigin,
  preflightIfNeeded,
} from "../_utils/cors.js";
import { validateAuthToken } from "../_utils/auth-validate.js";
import {
  listSongs,
  saveSong,
  canModifySong,
  getSong,
  deleteAllSongs,
  type SongDocument,
  type GetSongOptions,
  type LyricsSource,
} from "../_utils/song-service.js";

// Vercel Edge Function configuration
export const config = {
  runtime: "edge",
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

// =============================================================================
// Main Handler
// =============================================================================

export default async function handler(req: Request) {
  const requestId = generateRequestId();
  const startTime = Date.now();

  console.log(`[${requestId}] ${req.method} /api/song`);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    const effectiveOrigin = getEffectiveOrigin(req);
    const resp = preflightIfNeeded(req, ["GET", "POST", "DELETE", "OPTIONS"], effectiveOrigin);
    if (resp) return resp;
  }

  // Validate origin
  const effectiveOrigin = getEffectiveOrigin(req);
  if (!isAllowedOrigin(effectiveOrigin)) {
    return new Response("Unauthorized", { status: 403 });
  }

  // Create Redis client
  const redis = new Redis({
    url: process.env.REDIS_KV_REST_API_URL as string,
    token: process.env.REDIS_KV_REST_API_TOKEN as string,
  });

  // Helper for JSON responses
  const jsonResponse = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(data), {
      status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": effectiveOrigin!,
        ...headers,
      },
    });

  const errorResponse = (message: string, status = 400) => {
    logInfo(requestId, `Response: ${status} - ${message}`);
    return jsonResponse({ error: message }, status);
  };

  try {
    // =========================================================================
    // GET: List songs
    // =========================================================================
    if (req.method === "GET") {
      const url = new URL(req.url);
      const createdBy = url.searchParams.get("createdBy") || undefined;
      const idsParam = url.searchParams.get("ids");
      const ids = idsParam ? idsParam.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
      const includeParam = url.searchParams.get("include") || "metadata";
      const includes = includeParam.split(",").map((s) => s.trim());

      logInfo(requestId, "Listing songs", { createdBy, idsCount: ids?.length, includes });

      const getOptions: GetSongOptions = {
        includeMetadata: includes.includes("metadata"),
        includeLyrics: includes.includes("lyrics"),
        includeTranslations: includes.includes("translations"),
        includeFurigana: includes.includes("furigana"),
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
      // Extract auth credentials
      const authHeader = req.headers.get("Authorization");
      const usernameHeader = req.headers.get("X-Username");
      const authToken = authHeader?.replace("Bearer ", "") || null;
      const username = usernameHeader || null;

      // Validate authentication
      const authResult = await validateAuthToken(redis, username, authToken);
      if (!authResult.valid) {
        return errorResponse("Unauthorized - authentication required", 401);
      }

      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch (parseError) {
        logError(requestId, "Failed to parse request body", parseError);
        return errorResponse("Invalid JSON body", 400);
      }
      logInfo(requestId, `POST action=${body.action || "create"}`, { 
        hasId: !!body.id,
        songsCount: Array.isArray(body.songs) ? body.songs.length : undefined 
      });

      // Handle bulk import (admin only)
      if (body.action === "import") {
        // Only admin can bulk import
        if (username?.toLowerCase() !== "ryo") {
          return errorResponse("Forbidden - admin access required for bulk import", 403);
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
        let imported = 0;
        let updated = 0;

        logInfo(requestId, "Starting bulk import", { songCount: songs.length });

        // Process songs in order
        for (let i = 0; i < songs.length; i++) {
          const songData = songs[i];

          // Check if song already exists
          const existing = await getSong(redis, songData.id, { includeMetadata: true });

          // Convert legacy lyricsSearch to lyricsSource
          let lyricsSource: LyricsSource | undefined = songData.lyricsSource as LyricsSource | undefined;
          if (!lyricsSource && songData.lyricsSearch?.selection) {
            lyricsSource = songData.lyricsSearch.selection as LyricsSource;
          }

          const songDoc: Partial<SongDocument> & { id: string } = {
            id: songData.id,
            title: songData.title,
            artist: songData.artist,
            album: songData.album,
            lyricOffset: songData.lyricOffset,
            lyricsSource,
            createdBy: existing?.createdBy || username || undefined,
            createdAt: existing?.createdAt || now - i, // Maintain order
            importOrder: existing?.importOrder ?? i,
          };

          await saveSong(redis, songDoc, {
            preserveLyrics: true,
            preserveTranslations: true,
            preserveFurigana: true,
          });

          if (existing) {
            updated++;
          } else {
            imported++;
          }
        }

        logInfo(requestId, "Bulk import complete", {
          imported,
          updated,
          total: songs.length,
          duration: `${Date.now() - startTime}ms`,
        });

        return jsonResponse({
          success: true,
          imported,
          updated,
          total: songs.length,
        });
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

      // Check permission
      const existing = await getSong(redis, songData.id, { includeMetadata: true });
      const permission = canModifySong(existing, username);
      if (!permission.canModify) {
        // For create, return success but indicate it was skipped
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
      // Extract auth credentials
      const authHeader = req.headers.get("Authorization");
      const usernameHeader = req.headers.get("X-Username");
      const authToken = authHeader?.replace("Bearer ", "") || null;
      const username = usernameHeader || null;

      // Validate authentication
      const authResult = await validateAuthToken(redis, username, authToken);
      if (!authResult.valid) {
        return errorResponse("Unauthorized - authentication required", 401);
      }

      // Only admin can delete all songs
      if (username?.toLowerCase() !== "ryo") {
        return errorResponse("Forbidden - admin access required", 403);
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
