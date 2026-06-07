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

import { apiHandler } from "../_utils/api-handler.js";
import { isValidSongId } from "./_utils.js";
import { createSongHandlerContext } from "./handlers/_context.js";
import {
  handleGetMetadata,
  handleUpdateMetadata,
  handleDeleteMetadata,
  handleTranslate,
  handleClearCachedData,
  handleUnshare,
} from "./handlers/metadata.js";
import { handleSearchLyrics, handleFetchLyrics } from "./handlers/lyrics.js";
import { handleTranslateStream } from "./handlers/translate-stream.js";
import { handleFuriganaStream } from "./handlers/furigana-stream.js";
import { handleSoramimiStream } from "./handlers/soramimi-stream.js";

export const runtime = "nodejs";
export const maxDuration = 120;

export default apiHandler<Record<string, unknown>>(
  {
    methods: ["GET", "POST", "DELETE"],
    auth: "optional",
    parseJsonBody: true,
    contentType: null,
  },
  async (baseCtx) => {
    const requestIdHeader = baseCtx.req.headers["x-request-id"];
    const requestId = Array.isArray(requestIdHeader)
      ? requestIdHeader[0]
      : requestIdHeader || "unknown";
    const songId = baseCtx.req.query.id as string | undefined;

    const ctx = createSongHandlerContext(baseCtx, songId ?? "", requestId);
    const { req, logger, errorResponse } = ctx;

    if (!songId || songId === "[id]") {
      logger.warn("Song ID is required");
      errorResponse("Song ID is required", 400);
      return;
    }

    if (!isValidSongId(songId)) {
      if (req.method === "GET") {
        errorResponse("Song not found", 404);
        return;
      }
      errorResponse(
        "Invalid song ID format. Expected YouTube video ID (11 chars) or Apple Music ID (am:<id>)",
        400
      );
      return;
    }

    try {
      if (req.method === "GET") {
        await handleGetMetadata(ctx);
        return;
      }

      if (req.method === "POST") {
        const bodyObj =
          baseCtx.body && typeof baseCtx.body === "object" && !Array.isArray(baseCtx.body)
            ? baseCtx.body
            : null;
        if (!bodyObj) {
          errorResponse("Invalid JSON body", 400);
          return;
        }

        const action = bodyObj?.action;

        logger.info(`POST action=${action || "update-metadata"}`, {
          hasLyricsSource: !!bodyObj?.lyricsSource,
          language: bodyObj?.language,
          force: bodyObj?.force,
          query: bodyObj?.query,
        });

        switch (action) {
          case "search-lyrics":
            await handleSearchLyrics(ctx, bodyObj);
            return;
          case "fetch-lyrics":
            await handleFetchLyrics(ctx, bodyObj);
            return;
          case "translate":
            await handleTranslate(ctx, bodyObj);
            return;
          case "translate-stream":
            await handleTranslateStream(ctx, bodyObj);
            return;
          case "furigana-stream":
            await handleFuriganaStream(ctx, bodyObj);
            return;
          case "soramimi-stream":
            await handleSoramimiStream(ctx, bodyObj);
            return;
          case "clear-cached-data":
            await handleClearCachedData(ctx, bodyObj);
            return;
          case "unshare":
            await handleUnshare(ctx, bodyObj);
            return;
          default:
            await handleUpdateMetadata(ctx, bodyObj);
            return;
        }
      }

      if (req.method === "DELETE") {
        await handleDeleteMetadata(ctx);
        return;
      }

      logger.warn("Method not allowed", { method: req.method });
      errorResponse("Method not allowed", 405);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Internal server error";
      logger.error("Song API error", error);
      errorResponse(errorMessage, 500);
    }
  }
);
