import { apiHandler } from "./_utils/api-handler.js";
import { z } from "zod";
import * as RateLimit from "./_utils/_rate-limit.js";
import { getRuntimeEnv } from "./_utils/_cors.js";
import {
  getYouTubeApiKeys,
  searchYouTube,
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
    logger.info("Request details", {
      method: req.method,
      effectiveOrigin: origin,
      youtubeKeyCount: getYouTubeApiKeys().length,
      runtimeEnv: getRuntimeEnv(),
      vercelEnv: process.env.VERCEL_ENV || "not set",
      nodeEnv: process.env.NODE_ENV || "not set",
    });

    const rateLimited = await RateLimit.checkBurstDailyLimits(req, res, {
      prefix: "youtube-search",
      burstLimit: 20,
      burstWindow: 60,
      dailyLimit: 200,
      dailyWindow: 60 * 60 * 24,
      logger,
      startTime,
    });
    if (rateLimited) return;

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

    const result = await searchYouTube({
      query,
      maxResults,
      category,
      apiKeys,
      log: (message, data) => logger.info(message, data),
    });

    if (!result.ok) {
      if (result.exhausted) {
        logger.error("All API keys exhausted", {
          status: result.status,
          message: result.message,
        });
        logger.response(result.status, Date.now() - startTime);
        res.status(result.status).json({
          error: result.message,
          code: result.code,
          hint: "All configured API keys have exceeded their quota. Please try again later."
        });
        return;
      }

      logger.error("YouTube API error", {
        status: result.status,
        message: result.message,
        code: result.code,
        hint: result.code === 403
          ? "Check if YouTube Data API v3 is enabled in Google Cloud Console and API key has no restrictive referrer settings"
          : undefined
      });
      logger.response(result.status, Date.now() - startTime);
      res.status(result.status).json({
        error: result.message,
        code: result.code,
        hint: result.code === 403
          ? "YouTube API access denied. Ensure the API key is valid and YouTube Data API v3 is enabled in Google Cloud Console."
          : undefined
      });
      return;
    }

    logger.info("Search completed", {
      resultsCount: result.items.length,
      keyLabel: result.keyLabel,
    });
    logger.response(200, Date.now() - startTime);
    res.status(200).json({ results: result.items });
  }
);
