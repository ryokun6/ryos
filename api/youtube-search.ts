import { apiHandler } from "./_utils/api-handler.js";
import { z } from "zod";
import * as RateLimit from "./_utils/_rate-limit.js";
import { getClientIp } from "./_utils/_rate-limit.js";
import { getRuntimeEnv } from "./_utils/_cors.js";
import {
  getYouTubeApiKeys,
  toYoutubeSearchRouteItem,
  youtubeSearch,
} from "./_utils/youtube-client.js";

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
    const apiKeys = getYouTubeApiKeys(process.env);
    logger.info("Request details", {
      method: req.method,
      effectiveOrigin: origin,
      youtubeKeyCount: apiKeys.length,
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

    if (result.reason === "network_error" || result.reason === "aborted") {
      logger.error("YouTube search request failed", result);
      logger.response(500, Date.now() - startTime);
      res.status(500).json({ error: "Failed to search YouTube" });
      return;
    }

    const status = result.status || 403;
    const code = result.googleCode || status;
    logger.error("YouTube API error", {
      status,
      error: result.message,
      keyLabel: result.lastKeyLabel,
      hint: code === 403
        ? "Check if YouTube Data API v3 is enabled in Google Cloud Console and API key has no restrictive referrer settings"
        : undefined
    });
    logger.response(status, Date.now() - startTime);
    res.status(status).json({
      error: result.message,
      code,
      hint: code === 403
        ? result.reason === "quota_exhausted"
          ? "All configured API keys have exceeded their quota. Please try again later."
          : "YouTube API access denied. Ensure the API key is valid and YouTube Data API v3 is enabled in Google Cloud Console."
        : undefined
    });
  }
);
