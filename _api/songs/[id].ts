/**
 * Unified Song API Endpoint
 *
 * GET /api/songs/{id} - Retrieve song data
 * POST /api/songs/{id} - Update song metadata
 * DELETE /api/songs/{id} - Delete song (admin only)
 *
 * Query params for GET:
 * - include: Comma-separated list of: metadata,lyrics,translations,furigana
 * - translateTo: Language code to fetch/generate translation
 * - withFurigana: Boolean to fetch/generate furigana
 * - force: Boolean to bypass cache
 *
 * Sub-routes (handled via action param):
 * - POST with action=fetch-lyrics: Fetch lyrics from Kugou
 * - POST with action=translate: Generate translation
 * - POST with action=furigana: Generate furigana
 * - POST with action=search-lyrics: Search for lyrics matches
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isAllowedOrigin, getEffectiveOrigin, setCorsHeaders } from "../_utils/_cors.js";
import { getClientIp } from "../_utils/_rate-limit.js";
import { executeSongsGetCore } from "../cores/songs-get-core.js";
import { executeSongsDeleteCore } from "../cores/songs-delete-core.js";
import { executeSongsSearchLyricsCore } from "../cores/songs-search-lyrics-core.js";
import { executeSongsTranslateCore } from "../cores/songs-translate-core.js";
import { executeSongsClearCachedDataCore } from "../cores/songs-clear-cached-data-core.js";
import { executeSongsUnshareCore } from "../cores/songs-unshare-core.js";
import { executeSongsUpdateMetadataCore } from "../cores/songs-update-metadata-core.js";
import { executeSongsFetchLyricsCore } from "../cores/songs-fetch-lyrics-core.js";
import { executeSongsTranslateStreamCore } from "../cores/songs-translate-stream-core.js";
import { executeSongsFuriganaStreamCore } from "../cores/songs-furigana-stream-core.js";
import { executeSongsSoramimiStreamCore } from "../cores/songs-soramimi-stream-core.js";

import {
  isValidYouTubeVideoId,
} from "./_utils.js";

import { initLogger } from "../_utils/_logging.js";

export const runtime = "nodejs";
export const maxDuration = 120;

// Helper for SSE responses with Node.js VercelResponse
function sendSSEResponse(res: VercelResponse, origin: string | null, data: unknown): void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.write(`data: ${JSON.stringify(data)}\n\n`);
  res.end();
}

// =============================================================================
// Main Handler
// =============================================================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { requestId, logger } = initLogger();
  const startTime = Date.now();

  // Extract song ID from query params
  const songId = req.query.id as string | undefined;

  const effectiveOrigin = getEffectiveOrigin(req);
  setCorsHeaders(res, effectiveOrigin, { methods: ["GET", "POST", "DELETE", "OPTIONS"] });

  logger.request(req.method || "GET", `/api/songs/${songId || "[id]"}`);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    logger.response(204, Date.now() - startTime);
    return res.status(204).end();
  }

  // Helper for JSON responses
  const jsonResponse = (data: unknown, status = 200, headers: Record<string, string> = {}) => {
    Object.entries(headers).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
    logger.response(status, Date.now() - startTime);
    return res.status(status).json(data);
  };

  const errorResponse = (message: string, status = 400) => {
    logger.info(`Response: ${status} - ${message}`);
    return jsonResponse({ error: message }, status);
  };

  if (!isAllowedOrigin(effectiveOrigin)) {
    logger.warn("Unauthorized origin", { effectiveOrigin });
    return errorResponse("Unauthorized", 403);
  }

  if (!songId || songId === "[id]") {
    logger.warn("Song ID is required");
    return errorResponse("Song ID is required", 400);
  }

  // Validate YouTube video ID format (allow GET to return 404 for unknown IDs)
  if (!isValidYouTubeVideoId(songId)) {
    if (req.method === "GET") {
      return errorResponse("Song not found", 404);
    }
    return errorResponse("Invalid song ID format. Expected YouTube video ID (11 characters, alphanumeric with - and _)", 400);
  }

  try {
    // =========================================================================
    // GET: Retrieve song data
    // =========================================================================
    if (req.method === "GET") {
      const includeParam = (req.query.include as string) || "metadata";
      const getResult = await executeSongsGetCore({
        songId,
        includeParam,
        clientIp: getClientIp(req),
      });

      if (getResult.headers) {
        Object.entries(getResult.headers).forEach(([key, value]) => {
          res.setHeader(key, value);
        });
      }

      if (getResult.status === 429) {
        logger.warn("Rate limit exceeded (get)", { ip: getClientIp(req) });
      } else if (getResult.status === 404) {
        logger.warn("Song not found", { songId });
        return jsonResponse(getResult.body, getResult.status);
      } else if (getResult.status !== 200) {
        return jsonResponse(getResult.body, getResult.status);
      }

      logger.info(`Response: 200 OK`, { 
        hasLyrics: !!(getResult.body as { lyrics?: unknown })?.lyrics,
        hasTranslations: !!(getResult.body as { translations?: unknown })?.translations,
        hasFurigana: !!(getResult.body as { furigana?: unknown })?.furigana,
        hasSoramimi: !!(getResult.body as { soramimi?: unknown; soramimiByLang?: unknown })?.soramimi
          || !!(getResult.body as { soramimiByLang?: unknown })?.soramimiByLang,
        duration: `${Date.now() - startTime}ms` 
      });
      return jsonResponse(getResult.body, 200);
    }

    // =========================================================================
    // POST: Update song or perform action
    // =========================================================================
    if (req.method === "POST") {
      // Vercel throws an error when accessing req.body with malformed JSON
      // Wrap in try-catch to return proper 400 error
      let bodyObj: Record<string, unknown>;
      try {
        const body = req.body;
        if (body === undefined || body === null || typeof body !== 'object' || Array.isArray(body)) {
          return errorResponse("Invalid JSON body", 400);
        }
        bodyObj = body as Record<string, unknown>;
      } catch {
        return errorResponse("Invalid JSON body", 400);
      }
      const action = bodyObj?.action;
      
      logger.info(`POST action=${action || "update-metadata"}`, {
        hasLyricsSource: !!bodyObj?.lyricsSource,
        language: bodyObj?.language,
        force: bodyObj?.force,
        query: bodyObj?.query,
      });

      // Extract auth credentials
      const authHeader = req.headers.authorization as string | undefined;
      const usernameHeader = req.headers["x-username"] as string | undefined;
      const authToken = authHeader?.replace("Bearer ", "") || null;
      const username = usernameHeader || null;
      const requestIp = getClientIp(req);
      const rateLimitUser = username?.toLowerCase() || requestIp;

      // Handle search-lyrics action (no auth required)
      if (action === "search-lyrics") {
        const result = await executeSongsSearchLyricsCore({
          songId,
          body: bodyObj,
          requestIp,
          requestId,
        });

        if (result.headers) {
          Object.entries(result.headers).forEach(([key, value]) => {
            res.setHeader(key, value);
          });
        }

        if (result.status === 429) {
          logger.warn("Rate limit exceeded (search-lyrics)", { ip: requestIp });
        } else if (result.status === 400) {
          const error = (result.body as { error?: string })?.error;
          if (error === "Search query is required") {
            logger.warn("Search query is required");
          } else {
            logger.warn("Invalid request body");
          }
        } else if (result.status === 200) {
          const meta = (result.body as { _meta?: { query?: string; count?: number } })?._meta;
          logger.info("Searching lyrics", { query: meta?.query });
          logger.info(`Response: 200 OK - Found ${meta?.count ?? 0} results`);
        }

        const body =
          typeof result.body === "object" && result.body && "_meta" in (result.body as Record<string, unknown>)
            ? (() => {
                const { _meta: _ignored, ...rest } = result.body as Record<string, unknown>;
                return rest;
              })()
            : result.body;

        return jsonResponse(body, result.status);
      }

      // Handle fetch-lyrics action
      // - First time fetch (no existing lyrics): anyone can do it
      // - Changing lyrics source or force refresh: requires auth + canModifySong
      if (action === "fetch-lyrics") {
        const result = await executeSongsFetchLyricsCore({
          songId,
          body: bodyObj,
          username,
          authToken,
          requestId,
          rateLimitUser,
        });

        if (result.headers) {
          Object.entries(result.headers).forEach(([key, value]) => {
            res.setHeader(key, value);
          });
        }

        if (result.status === 429) {
          logger.warn("Rate limit exceeded (fetch-lyrics)", { user: rateLimitUser });
        } else if (result.status === 401) {
          const error = (result.body as { error?: string })?.error;
          if (error?.includes("change lyrics source or force refresh")) {
            logger.warn("Unauthorized fetch-lyrics source change/force refresh");
          } else {
            logger.warn("Unauthorized fetch-lyrics invalid credentials");
          }
        } else if (result.status === 403) {
          logger.warn("Forbidden fetch-lyrics source change");
        } else if (result.status === 404) {
          logger.warn("Fetch lyrics failed", { error: (result.body as { error?: string })?.error });
        } else if (result.status === 400) {
          logger.warn((result.body as { error?: string })?.error || "Invalid request body");
        } else if (result.status === 200) {
          const meta = (result.body as {
            _meta?: { parsedLinesCount?: number; cached?: boolean; lyricsSourceChanged?: boolean };
          })?._meta;
          if (meta?.lyricsSourceChanged) {
            logger.info("Lyrics source changed, will re-fetch and clear cached annotations");
          }
          if (meta?.cached) {
            logger.info("Response: 200 OK - Returning cached lyrics", {
              parsedLinesCount: meta?.parsedLinesCount,
            });
          } else {
            logger.info("Response: 200 OK - Lyrics fetched", {
              parsedLinesCount: meta?.parsedLinesCount,
            });
          }
        }

        const body =
          typeof result.body === "object" && result.body && "_meta" in (result.body as Record<string, unknown>)
            ? (() => {
                const { _meta: _ignored, ...rest } = result.body as Record<string, unknown>;
                return rest;
              })()
            : result.body;

        return jsonResponse(body, result.status);
      }

      // =======================================================================
      // Handle translate action - non-streaming translation response
      // Returns full LRC translation in JSON
      // =======================================================================
      if (action === "translate") {
        const result = await executeSongsTranslateCore({
          songId,
          body: bodyObj,
          username,
          authToken,
          requestId,
        });

        if (result.status === 400) {
          logger.warn("Invalid translate request body");
        } else if (result.status === 401) {
          const error = (result.body as { error?: string })?.error;
          if (error?.includes("force refresh translation")) {
            logger.warn("Unauthorized force refresh translation - missing credentials");
          } else {
            logger.warn("Unauthorized force refresh translation - invalid credentials");
          }
        } else if (result.status === 403) {
          logger.warn("Forbidden force refresh translation");
        } else if (result.status === 404) {
          logger.warn("Translate action failed", {
            error: (result.body as { error?: string })?.error,
          });
        } else if (result.status === 200) {
          const meta = (result.body as { _meta?: { translationMode?: string } })?._meta;
          if (meta?.translationMode === "krc-derived") {
            logger.info("Using KRC-derived Traditional Chinese translation (non-stream)");
          }
        }

        const body =
          typeof result.body === "object" && result.body && "_meta" in (result.body as Record<string, unknown>)
            ? (() => {
                const { _meta: _ignored, ...rest } = result.body as Record<string, unknown>;
                return rest;
              })()
            : result.body;

        return jsonResponse(body, result.status);
      }

      // =======================================================================
      // Handle translate-stream action - SSE streaming with line-by-line updates
      // Uses streamText for real-time line emission as AI generates each line
      // - First time translation: anyone can do it
      // - Force refresh: requires auth + canModifySong
      // =======================================================================
      if (action === "translate-stream") {
        const result = await executeSongsTranslateStreamCore({
          songId,
          body: bodyObj,
          username,
          authToken,
          rateLimitUser,
        });

        if (result.kind === "response") {
          if (result.response.headers) {
            Object.entries(result.response.headers).forEach(([key, value]) => {
              res.setHeader(key, value);
            });
          }
          if (result.response.status === 429) {
            logger.warn("Rate limit exceeded (translate-stream)", { user: rateLimitUser });
          }
          return jsonResponse(result.response.body, result.response.status);
        }

        if (result.kind === "cached") {
          logger.info("Returning cached translation via SSE");
          sendSSEResponse(res, effectiveOrigin, result.payload);
          return;
        }

        logger.info("Starting translate SSE stream", { totalLines: result.totalLines });
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");
        res.setHeader("Access-Control-Allow-Origin", effectiveOrigin!);

        const sendEvent = (eventType: string, data: Record<string, unknown>) => {
          res.write(`data: ${JSON.stringify({ type: eventType, ...data })}\n\n`);
        };

        await result.run(sendEvent);
        res.end();
        return;
      }

      // =======================================================================
      // Handle furigana-stream action - SSE streaming with line-by-line updates
      // =======================================================================
      if (action === "furigana-stream") {
        const result = await executeSongsFuriganaStreamCore({
          songId,
          body: bodyObj,
          username,
          authToken,
          rateLimitUser,
        });

        if (result.kind === "response") {
          if (result.response.headers) {
            Object.entries(result.response.headers).forEach(([key, value]) => {
              res.setHeader(key, value);
            });
          }
          if (result.response.status === 429) {
            logger.warn("Rate limit exceeded (furigana-stream)", { user: rateLimitUser });
          }
          return jsonResponse(result.response.body, result.response.status);
        }

        if (result.kind === "cached") {
          logger.info("Returning cached furigana via SSE");
          sendSSEResponse(res, effectiveOrigin, result.payload);
          return;
        }

        logger.info("Starting furigana SSE stream", { totalLines: result.totalLines });
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");
        res.setHeader("Access-Control-Allow-Origin", effectiveOrigin!);

        const sendEvent = (eventType: string, data: Record<string, unknown>) => {
          res.write(`data: ${JSON.stringify({ type: eventType, ...data })}\n\n`);
        };

        await result.run(sendEvent);
        res.end();
        return;
      }

      // =======================================================================
      // Handle soramimi-stream action - SSE streaming with line-by-line updates
      // =======================================================================
      if (action === "soramimi-stream") {
        const result = await executeSongsSoramimiStreamCore({
          songId,
          body: bodyObj,
          username,
          authToken,
          rateLimitUser,
        });

        if (result.kind === "response") {
          if (result.response.headers) {
            Object.entries(result.response.headers).forEach(([key, value]) => {
              res.setHeader(key, value);
            });
          }
          if (result.response.status === 429) {
            logger.warn("Rate limit exceeded (soramimi-stream)", { user: rateLimitUser });
          }
          if (
            result.response.status === 200 &&
            (result.response.body as { skipped?: boolean })?.skipped
          ) {
            logger.info("Skipping Chinese soramimi stream - lyrics are already Chinese");
          }
          return jsonResponse(result.response.body, result.response.status);
        }

        if (result.kind === "cached") {
          logger.info("Returning cached soramimi via SSE");
          sendSSEResponse(res, effectiveOrigin, result.payload);
          return;
        }

        logger.info("Starting soramimi SSE stream", {
          totalLines: result.totalLines,
          hasFurigana: result.hasFuriganaData,
          targetLanguage: result.targetLanguage,
        });
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");
        res.setHeader("Access-Control-Allow-Origin", effectiveOrigin!);

        const sendEvent = (eventType: string, data: Record<string, unknown>) => {
          res.write(`data: ${JSON.stringify({ type: eventType, ...data })}\n\n`);
        };

        await result.run(sendEvent);
        res.end();
        return;
      }

      // =======================================================================
      // Handle clear-cached-data action - clears translations and/or furigana
      // =======================================================================
      if (action === "clear-cached-data") {
        const result = await executeSongsClearCachedDataCore({
          songId,
          body: bodyObj,
        });

        if (result.status === 400) {
          logger.warn("Invalid clear-cached-data request body");
        } else if (result.status === 404) {
          logger.warn("Song not found for clear-cached-data", { songId });
        } else if (result.status === 200) {
          const body = result.body as { cleared?: string[] };
          logger.info(
            `Cleared cached data: ${
              body.cleared && body.cleared.length > 0 ? body.cleared.join(", ") : "nothing to clear"
            }`
          );
        }

        const body =
          typeof result.body === "object" && result.body && "_meta" in (result.body as Record<string, unknown>)
            ? (() => {
                const { _meta: _ignored, ...rest } = result.body as Record<string, unknown>;
                return rest;
              })()
            : result.body;

        return jsonResponse(body, result.status);
      }

      // =======================================================================
      // Handle unshare action - clears the createdBy field (admin only)
      // =======================================================================
      if (action === "unshare") {
        const result = await executeSongsUnshareCore({
          songId,
          body: bodyObj,
          username,
          authToken,
        });

        if (result.status === 400) {
          logger.warn("Invalid unshare request body");
        } else if (result.status === 401) {
          logger.warn("Unauthorized - authentication required for unshare");
        } else if (result.status === 403) {
          logger.warn("Forbidden - admin access required for unshare");
        } else if (result.status === 404) {
          logger.warn("Song not found for unshare", { songId });
        } else if (result.status === 200) {
          logger.info("Song unshared (createdBy cleared)", {
            duration: `${Date.now() - startTime}ms`,
          });
        }

        return jsonResponse(result.body, result.status);
      }

      // Default POST: Update song metadata (requires auth)
      const result = await executeSongsUpdateMetadataCore({
        songId,
        body: bodyObj,
        username,
        authToken,
      });

      if (result.status === 401) {
        logger.warn("Unauthorized - authentication required for song update");
      } else if (result.status === 400) {
        logger.warn("Invalid song update request body");
      } else if (result.status === 403) {
        logger.warn("Permission denied for song update");
      } else if (result.status === 200) {
        const isUpdate = (result.body as { isUpdate?: boolean })?.isUpdate;
        logger.info(isUpdate ? "Song updated" : "Song created", {
          duration: `${Date.now() - startTime}ms`,
        });
      }

      return jsonResponse(result.body, result.status);
    }

    // =========================================================================
    // DELETE: Delete song (admin only)
    // =========================================================================
    if (req.method === "DELETE") {
      const result = await executeSongsDeleteCore({
        songId,
        authHeader: req.headers.authorization as string | undefined,
        usernameHeader: req.headers["x-username"] as string | undefined,
      });

      logger.info("Song deleted", { duration: `${Date.now() - startTime}ms` });
      return jsonResponse(result.body, result.status);
    }

    logger.warn("Method not allowed", { method: req.method });
    return errorResponse("Method not allowed", 405);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    logger.error("Song API error", error);
    return errorResponse(errorMessage, 500);
  }
}
