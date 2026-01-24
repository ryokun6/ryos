import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import * as RateLimit from "./_utils/_rate-limit.js";
import { getClientIp } from "./_utils/_rate-limit.js";
import { isAllowedOrigin, getEffectiveOrigin, setCorsHeaders } from "./_utils/_cors.js";
import { initLogger } from "./_utils/_logging.js";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Expected request body
 */
const YouTubeSearchRequestSchema = z.object({
  query: z.string().min(1, "Query is required"),
  maxResults: z.number().min(1).max(25).optional().default(10),
});

type YouTubeSearchRequest = z.infer<typeof YouTubeSearchRequestSchema>;

/**
 * YouTube Data API v3 search result item
 */
interface YouTubeSearchItem {
  id: {
    kind: string;
    videoId: string;
  };
  snippet: {
    title: string;
    description: string;
    channelTitle: string;
    thumbnails: {
      default?: { url: string; width: number; height: number };
      medium?: { url: string; width: number; height: number };
      high?: { url: string; width: number; height: number };
    };
    publishedAt: string;
  };
}

interface YouTubeSearchResponse {
  items?: YouTubeSearchItem[];
  pageInfo?: {
    totalResults: number;
    resultsPerPage: number;
  };
  error?: {
    code: number;
    message: string;
  };
}

/**
 * Result item returned to the client
 */
interface SearchResultItem {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  publishedAt: string;
}

/**
 * Main handler
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const { requestId: _requestId, logger } = initLogger();
  const startTime = Date.now();
  const effectiveOrigin = getEffectiveOrigin(req);

  logger.request(req.method || "POST", req.url || "/api/youtube-search", "youtube-search");
  logger.info("Request details", { 
    method: req.method, 
    effectiveOrigin,
    youtubeKeyCount: [process.env.YOUTUBE_API_KEY, process.env.YOUTUBE_API_KEY_2].filter(Boolean).length,
    vercelEnv: process.env.VERCEL_ENV || "not set"
  });

  if (req.method === "OPTIONS") {
    res.setHeader("Content-Type", "application/json");
    setCorsHeaders(res, effectiveOrigin, { methods: ["POST", "OPTIONS"], headers: ["Content-Type"] });
    logger.response(204, Date.now() - startTime);
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    logger.error("Method not allowed");
    logger.response(405, Date.now() - startTime);
    res.status(405).send("Method not allowed");
    return;
  }

  res.setHeader("Content-Type", "application/json");
  setCorsHeaders(res, effectiveOrigin, { methods: ["POST", "OPTIONS"], headers: ["Content-Type"] });

  // Check origin - be more permissive in development
  const vercelEnv = process.env.VERCEL_ENV;
  const isDev = !vercelEnv || vercelEnv === "development";
  
  if (!isDev && !isAllowedOrigin(effectiveOrigin)) {
    logger.error("Origin not allowed", { effectiveOrigin, vercelEnv });
    logger.response(403, Date.now() - startTime);
    res.status(403).json({ error: "Origin not allowed" });
    return;
  }

  // Rate limiting: 20 searches/min/IP, 200/day/IP
  try {
    const ip = getClientIp(req);
    const BURST_WINDOW = 60;
    const BURST_LIMIT = 20;
    const DAILY_WINDOW = 60 * 60 * 24;
    const DAILY_LIMIT = 200;

    const burstKey = RateLimit.makeKey(["rl", "youtube-search", "burst", "ip", ip]);
    const dailyKey = RateLimit.makeKey(["rl", "youtube-search", "daily", "ip", ip]);

    const burst = await RateLimit.checkCounterLimit({
      key: burstKey,
      windowSeconds: BURST_WINDOW,
      limit: BURST_LIMIT,
    });
    if (!burst.allowed) {
      logger.info("Rate limit exceeded (burst)", { ip });
      logger.response(429, Date.now() - startTime);
      res.setHeader("Retry-After", String(burst.resetSeconds ?? BURST_WINDOW));
      res.status(429).json({ error: "rate_limit_exceeded", scope: "burst" });
      return;
    }

    const daily = await RateLimit.checkCounterLimit({
      key: dailyKey,
      windowSeconds: DAILY_WINDOW,
      limit: DAILY_LIMIT,
    });
    if (!daily.allowed) {
      logger.info("Rate limit exceeded (daily)", { ip });
      logger.response(429, Date.now() - startTime);
      res.setHeader("Retry-After", String(daily.resetSeconds ?? DAILY_WINDOW));
      res.status(429).json({ error: "rate_limit_exceeded", scope: "daily" });
      return;
    }
  } catch (err) {
    logger.error("Rate limit check failed", err);
  }

  // Collect all available API keys for rotation
  const apiKeys = [
    process.env.YOUTUBE_API_KEY,
    process.env.YOUTUBE_API_KEY_2,
  ].filter((key): key is string => !!key);

  if (apiKeys.length === 0) {
    logger.error("No YOUTUBE_API_KEY configured", { 
      envKeys: Object.keys(process.env).filter(k => k.includes("YOUTUBE") || k.includes("API")).join(", ") || "none found"
    });
    logger.response(500, Date.now() - startTime);
    res.status(500).json({ 
      error: "YouTube API is not configured",
      hint: "Add YOUTUBE_API_KEY to your .env.local file and restart vercel dev"
    });
    return;
  }

  logger.info("Available API keys", { count: apiKeys.length });

  // Parse and validate request body
  let body: YouTubeSearchRequest;
  try {
    body = YouTubeSearchRequestSchema.parse(req.body);
  } catch (err) {
    logger.error("Invalid request body", err);
    logger.response(400, Date.now() - startTime);
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { query, maxResults } = body;
  logger.info("Searching YouTube", { query, maxResults });

  // Helper to check if error is a quota exceeded error
  const isQuotaError = (status: number, data: YouTubeSearchResponse): boolean => {
    if (status === 403) {
      const message = data.error?.message?.toLowerCase() || "";
      return message.includes("quota") || message.includes("exceeded") || message.includes("limit");
    }
    return false;
  };

  // Try each API key until one works
  let lastError: { status: number; message: string; code: number } | null = null;

  for (let keyIndex = 0; keyIndex < apiKeys.length; keyIndex++) {
    const apiKey = apiKeys[keyIndex];
    const keyLabel = keyIndex === 0 ? "primary" : `backup-${keyIndex}`;

    try {
      logger.info(`Trying API key`, { keyLabel, keyIndex: keyIndex + 1, totalKeys: apiKeys.length });

      const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
      searchUrl.searchParams.set("part", "snippet");
      searchUrl.searchParams.set("type", "video");
      searchUrl.searchParams.set("videoCategoryId", "10");
      searchUrl.searchParams.set("q", query);
      searchUrl.searchParams.set("maxResults", String(maxResults));
      searchUrl.searchParams.set("key", apiKey);

      const response = await fetch(searchUrl.toString());
      const data = (await response.json()) as YouTubeSearchResponse;

      if (!response.ok || data.error) {
        const errorCode = data.error?.code || response.status;
        const errorMessage = data.error?.message || `YouTube API error (${response.status})`;
        
        if (isQuotaError(response.status, data) && keyIndex < apiKeys.length - 1) {
          logger.info(`Quota exceeded for ${keyLabel} key, rotating to next key`, { 
            errorMessage,
            nextKeyIndex: keyIndex + 2 
          });
          lastError = { status: response.status, message: errorMessage, code: errorCode };
          continue;
        }

        logger.error("YouTube API error", { 
          status: response.status, 
          error: data.error,
          keyLabel,
          hint: errorCode === 403 
            ? "Check if YouTube Data API v3 is enabled in Google Cloud Console and API key has no restrictive referrer settings" 
            : undefined
        });
        logger.response(response.status, Date.now() - startTime);
        res.status(response.status).json({ 
          error: errorMessage,
          code: errorCode,
          hint: errorCode === 403 
            ? "YouTube API access denied. Ensure the API key is valid and YouTube Data API v3 is enabled in Google Cloud Console."
            : undefined
        });
        return;
      }

      const results: SearchResultItem[] = (data.items || [])
        .filter((item) => item.id.videoId)
        .map((item) => ({
          videoId: item.id.videoId,
          title: item.snippet.title,
          channelTitle: item.snippet.channelTitle,
          thumbnail:
            item.snippet.thumbnails.medium?.url ||
            item.snippet.thumbnails.default?.url ||
            "",
          publishedAt: item.snippet.publishedAt,
        }));

      logger.info("Search completed", { resultsCount: results.length, keyLabel });
      logger.response(200, Date.now() - startTime);
      res.status(200).json({ results });
      return;

    } catch (error) {
      logger.error(`Error with ${keyLabel} key`, error);
      if (keyIndex < apiKeys.length - 1) {
        logger.info(`Retrying with next API key`);
        continue;
      }
      logger.response(500, Date.now() - startTime);
      res.status(500).json({ error: "Failed to search YouTube" });
      return;
    }
  }

  // All keys exhausted (quota exceeded on all)
  logger.error("All API keys exhausted", { lastError });
  logger.response(lastError?.status || 403, Date.now() - startTime);
  res.status(lastError?.status || 403).json({ 
    error: lastError?.message || "All YouTube API keys have exceeded their quota",
    code: lastError?.code || 403,
    hint: "All configured API keys have exceeded their quota. Please try again later."
  });
}
