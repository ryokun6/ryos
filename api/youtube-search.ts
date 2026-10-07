import { apiHandler } from "./_utils/api-handler.js";
import { z } from "zod";
import * as RateLimit from "./_utils/_rate-limit.js";
import { getClientIp } from "./_utils/_rate-limit.js";
import { getRuntimeEnv } from "./_utils/_cors.js";
import {
  getYouTubeApiKeys,
  toYoutubeSearchRouteItem,
  YOUTUBE_QUOTA_EXHAUSTED_CODE,
  YOUTUBE_UNAVAILABLE_CODE,
  youtubeSearch,
} from "./_utils/youtube-client.js";

const YouTubeSearchRequestSchema = z.object({
  query: z.string().min(1, "Query is required"),
  maxResults: z.number().min(1).max(25).optional().default(10),
  // "music" preserves karaoke / iPod song-search behavior (videoCategoryId=10);
  // "all" performs an unrestricted video search (used by TV channel creation).
  category: z.enum(["music", "all"]).optional().default("music"),
});

type YouTubeSearchRequest = z.infer<typeof YouTubeSearchRequestSchema>;

export default apiHandler<YouTubeSearchRequest>(
  { methods: ["POST"], parseJsonBody: true, bodySchema: YouTubeSearchRequestSchema },
  async ({ req, res, logger, startTime, origin, body }) => {
    const apiKeys = getYouTubeApiKeys(process.env);
    logger.info("Request details", {
      method: req.method,
      effectiveOrigin: origin,
      youtubeKeyCount: apiKeys.length,
      runtimeEnv: getRuntimeEnv(),
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

    // Body is validated at the handler boundary via `bodySchema`.
    const { query, maxResults, category } = body!;
    logger.info("Searching YouTube", { query, maxResults, category });

    const result = await youtubeSearch(
      { query, maxResults, category, videoEmbeddable: true },
      {
        apiKeys,
        onKeyAttempt: ({ keyIndex, keyLabel }) => {
          logger.info(`Trying API key`, {
            keyLabel,
            keyIndex: keyIndex + 1,
            totalKeys: apiKeys.length,
          });
        },
        onKeyFailure: (failure) => {
          logger.warn("YouTube API key attempt failed", {
            ...failure,
            keyIndex: failure.keyIndex + 1,
            totalKeys: apiKeys.length,
          });
        },
      }
    );

    if (result.ok) {
      const results = result.hits.map(toYoutubeSearchRouteItem);
      logger.info("Search completed", {
        resultsCount: results.length,
        keyLabel: result.keyLabel,
      });
      logger.response(200, Date.now() - startTime);
      res.status(200).json({ results });
      return;
    }

    logger.error("YouTube search failed", {
      reason: result.reason,
      status: result.status,
      googleReason: result.googleReason,
      upstreamMessage: result.message,
      lastKeyLabel: result.lastKeyLabel,
      failedAttempts: result.failedAttempts,
      totalKeys: apiKeys.length,
    });

    if (result.reason === "quota_exhausted") {
      logger.response(503, Date.now() - startTime);
      res.setHeader("Retry-After", "3600");
      res.status(503).json({
        error: "All YouTube API keys have exceeded their daily quota",
        code: YOUTUBE_QUOTA_EXHAUSTED_CODE,
      });
      return;
    }

    if (result.reason === "network_error" || result.reason === "aborted") {
      logger.response(500, Date.now() - startTime);
      res.status(500).json({
        error: "Failed to search YouTube",
        code: YOUTUBE_UNAVAILABLE_CODE,
      });
      return;
    }

    logger.response(502, Date.now() - startTime);
    res.status(502).json({
      error: "YouTube search is unavailable",
      code: YOUTUBE_UNAVAILABLE_CODE,
    });
  }
);
