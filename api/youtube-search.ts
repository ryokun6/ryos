import { apiHandler } from "./_utils/api-handler.js";
import { z } from "zod";
import * as RateLimit from "./_utils/_rate-limit.js";
import { getClientIp } from "./_utils/_rate-limit.js";
import { getRuntimeEnv } from "./_utils/_cors.js";
import {
  getYouTubeApiKeys,
  searchYouTubeVideos,
  YouTubeApiError,
} from "./_utils/youtube-service.js";

export const runtime = "nodejs";
export const maxDuration = 30;

const YouTubeSearchRequestSchema = z.object({
  query: z.string().min(1, "Query is required"),
  maxResults: z.number().min(1).max(25).optional().default(10),
  // "music" preserves karaoke / iPod song-search behavior (videoCategoryId=10);
  // "all" performs an unrestricted video search (used by TV channel creation).
  category: z.enum(["music", "all"]).optional().default("music"),
});

type YouTubeSearchRequest = z.infer<typeof YouTubeSearchRequestSchema>;

export default apiHandler(
  { methods: ["POST"] },
  async ({ req, res, logger, startTime, origin }) => {
    logger.info("Request details", {
      method: req.method,
      effectiveOrigin: origin,
      youtubeKeyCount: [process.env.YOUTUBE_API_KEY, process.env.YOUTUBE_API_KEY_2].filter(Boolean).length,
      runtimeEnv: getRuntimeEnv(),
      vercelEnv: process.env.VERCEL_ENV || "not set",
      nodeEnv: process.env.NODE_ENV || "not set",
    });

    try {
      const ip = getClientIp(req);
      const BURST_WINDOW = 60;
      const DAILY_WINDOW = 60 * 60 * 24;

      const rl = await RateLimit.checkBurstAndDailyLimits({
        namespace: "youtube-search",
        identifierParts: ["ip", ip],
        burst: { windowSeconds: BURST_WINDOW, limit: 20 },
        daily: { windowSeconds: DAILY_WINDOW, limit: 200 },
      });
      if (!rl.ok) {
        const fallbackWindow = rl.scope === "burst" ? BURST_WINDOW : DAILY_WINDOW;
        logger.info(`Rate limit exceeded (${rl.scope})`, { ip });
        logger.response(429, Date.now() - startTime);
        res.setHeader("Retry-After", String(rl.result?.resetSeconds ?? fallbackWindow));
        res.status(429).json({ error: "rate_limit_exceeded", scope: rl.scope });
        return;
      }
    } catch (err) {
      logger.error("Rate limit check failed", err);
    }

    const apiKeys = getYouTubeApiKeys();

    if (apiKeys.length === 0) {
      logger.error("No YOUTUBE_API_KEY configured", {
        envKeys: Object.keys(process.env).filter(k => k.includes("YOUTUBE") || k.includes("API")).join(", ") || "none found"
      });
      logger.response(500, Date.now() - startTime);
      res.status(500).json({
        error: "YouTube API is not configured",
        hint: "Add YOUTUBE_API_KEY to your .env.local file and restart the API server"
      });
      return;
    }

    logger.info("Available API keys", { count: apiKeys.length });

    let body: YouTubeSearchRequest;
    try {
      body = YouTubeSearchRequestSchema.parse(req.body);
    } catch (err) {
      logger.error("Invalid request body", err);
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Invalid request body" });
      return;
    }

    const { query, maxResults, category } = body;
    logger.info("Searching YouTube", { query, maxResults, category });

    try {
      const { results, keyLabel } = await searchYouTubeVideos({
        query,
        maxResults,
        apiKeys,
        musicOnly: category === "music",
        onAttempt: ({ keyLabel, keyIndex, totalKeys }) => {
          logger.info(`Trying API key`, { keyLabel, keyIndex, totalKeys });
        },
        onQuotaRotation: ({ keyLabel, errorMessage, nextKeyIndex }) => {
          logger.info(`Quota exceeded for ${keyLabel} key, rotating to next key`, {
            errorMessage,
            nextKeyIndex,
          });
        },
      });

      logger.info("Search completed", { resultsCount: results.length, keyLabel });
      logger.response(200, Date.now() - startTime);
      res.status(200).json({ results });
    } catch (error) {
      if (error instanceof YouTubeApiError) {
        logger.error("YouTube API error", {
          status: error.status,
          keyLabel: error.keyLabel,
          hint:
            error.code === 403
              ? "Check if YouTube Data API v3 is enabled in Google Cloud Console and API key has no restrictive referrer settings"
              : undefined,
        });
        logger.response(error.status, Date.now() - startTime);
        res.status(error.status).json({
          error: error.message,
          code: error.code,
          hint:
            error.code === 403
              ? "YouTube API access denied. Ensure the API key is valid and YouTube Data API v3 is enabled in Google Cloud Console."
              : undefined,
        });
        return;
      }

      logger.error("YouTube search failed", error);
      logger.response(500, Date.now() - startTime);
      res.status(500).json({ error: "Failed to search YouTube" });
    }
  }
);
