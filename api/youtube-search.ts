import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import {
  getOriginFromVercel,
  isOriginAllowed,
  handlePreflight,
  getClientIpFromRequest,
} from "./_utils/middleware.js";
import * as RateLimit from "./_utils/_rate-limit.js";

// Vercel Function configuration (runs on Bun via bunVersion in vercel.json)

export const config = {
  runtime: "nodejs",
};

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

// ------------------------------------------------------------------
// Basic logging helpers
// ------------------------------------------------------------------
const logRequest = (method: string, url: string, id: string) => {
  console.log(`[${id}] ${method} ${url}`);
};

const logInfo = (id: string, message: string, data?: unknown) => {
  console.log(`[${id}] INFO: ${message}`, data ?? "");
};

const logError = (id: string, message: string, error: unknown) => {
  console.error(`[${id}] ERROR: ${message}`, error);
};

const generateRequestId = (): string =>
  Math.random().toString(36).substring(2, 10);

/**
 * Main handler
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const requestId = generateRequestId();
  logRequest(req.method || "GET", req.url || "", requestId);

  const effectiveOrigin = getOriginFromVercel(req);
  logInfo(requestId, "Request details", { 
    method: req.method, 
    effectiveOrigin,
    youtubeKeyCount: [process.env.YOUTUBE_API_KEY, process.env.YOUTUBE_API_KEY_2].filter(Boolean).length,
    vercelEnv: process.env.VERCEL_ENV || "not set"
  });

  if (req.method === "OPTIONS") {
    const handled = handlePreflight(req, res, ["POST", "OPTIONS"]);
    if (handled) return;
  }

  if (req.method !== "POST") {
    logError(requestId, "Method not allowed", null);
    res.status(405).end("Method not allowed");
    return;
  }

  // Check origin - be more permissive in development
  const vercelEnv = process.env.VERCEL_ENV;
  const isDev = !vercelEnv || vercelEnv === "development";
  
  if (!isDev && !isOriginAllowed(effectiveOrigin)) {
    logError(requestId, "Origin not allowed", { effectiveOrigin, vercelEnv });
    res.setHeader("Content-Type", "application/json");
    if (effectiveOrigin) {
      res.setHeader("Access-Control-Allow-Origin", effectiveOrigin);
    }
    res.status(403).json({ error: "Origin not allowed" });
    return;
  }

  // Rate limiting: 20 searches/min/IP, 200/day/IP
  try {
    const ip = getClientIpFromRequest(req);
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
      logInfo(requestId, "Rate limit exceeded (burst)", { ip });
      res.setHeader("Retry-After", String(burst.resetSeconds ?? BURST_WINDOW));
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Access-Control-Allow-Origin", effectiveOrigin || "*");
      res.status(429).json({ error: "rate_limit_exceeded", scope: "burst" });
      return;
    }

    const daily = await RateLimit.checkCounterLimit({
      key: dailyKey,
      windowSeconds: DAILY_WINDOW,
      limit: DAILY_LIMIT,
    });
    if (!daily.allowed) {
      logInfo(requestId, "Rate limit exceeded (daily)", { ip });
      res.setHeader("Retry-After", String(daily.resetSeconds ?? DAILY_WINDOW));
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Access-Control-Allow-Origin", effectiveOrigin || "*");
      res.status(429).json({ error: "rate_limit_exceeded", scope: "daily" });
      return;
    }
  } catch (err) {
    // Log but don't block if rate limit check fails
    logError(requestId, "Rate limit check failed", err);
  }

  // Collect all available API keys for rotation
  const apiKeys = [
    process.env.YOUTUBE_API_KEY,
    process.env.YOUTUBE_API_KEY_2,
  ].filter((key): key is string => !!key);

  if (apiKeys.length === 0) {
    logError(requestId, "No YOUTUBE_API_KEY configured", { 
      envKeys: Object.keys(process.env).filter(k => k.includes("YOUTUBE") || k.includes("API")).join(", ") || "none found"
    });
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", effectiveOrigin || "*");
    res.status(500).json({ 
      error: "YouTube API is not configured",
      hint: "Add YOUTUBE_API_KEY to your .env.local file and restart vercel dev"
    });
    return;
  }

  logInfo(requestId, "Available API keys", { count: apiKeys.length });

  // Parse and validate request body
  let body: YouTubeSearchRequest;
  try {
    body = YouTubeSearchRequestSchema.parse(req.body);
  } catch (err) {
    logError(requestId, "Invalid request body", err);
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", effectiveOrigin!);
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { query, maxResults } = body;
  logInfo(requestId, "Searching YouTube", { query, maxResults });

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
      logInfo(requestId, `Trying API key`, { keyLabel, keyIndex: keyIndex + 1, totalKeys: apiKeys.length });

      // Build YouTube Data API v3 search URL
      const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
      searchUrl.searchParams.set("part", "snippet");
      searchUrl.searchParams.set("type", "video");
      searchUrl.searchParams.set("videoCategoryId", "10"); // Music category
      searchUrl.searchParams.set("q", query);
      searchUrl.searchParams.set("maxResults", String(maxResults));
      searchUrl.searchParams.set("key", apiKey);

      const response = await fetch(searchUrl.toString());
      const data = (await response.json()) as YouTubeSearchResponse;

      if (!response.ok || data.error) {
        const errorCode = data.error?.code || response.status;
        const errorMessage = data.error?.message || `YouTube API error (${response.status})`;
        
        // Check if this is a quota error and we have more keys to try
        if (isQuotaError(response.status, data) && keyIndex < apiKeys.length - 1) {
          logInfo(requestId, `Quota exceeded for ${keyLabel} key, rotating to next key`, { 
            errorMessage,
            nextKeyIndex: keyIndex + 2 
          });
          lastError = { status: response.status, message: errorMessage, code: errorCode };
          continue; // Try next key
        }

        logError(requestId, "YouTube API error", { 
          status: response.status, 
          error: data.error,
          keyLabel,
          hint: errorCode === 403 
            ? "Check if YouTube Data API v3 is enabled in Google Cloud Console and API key has no restrictive referrer settings" 
            : undefined
        });
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Access-Control-Allow-Origin", effectiveOrigin || "*");
        res.status(response.status).json({ 
          error: errorMessage,
          code: errorCode,
          hint: errorCode === 403 
            ? "YouTube API access denied. Ensure the API key is valid and YouTube Data API v3 is enabled in Google Cloud Console."
            : undefined
        });
        return;
      }

      // Transform results
      const results: SearchResultItem[] = (data.items || [])
        .filter((item) => item.id.videoId) // Only include items with videoId
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

      logInfo(requestId, "Search completed", { resultsCount: results.length, keyLabel });

      res.setHeader("Content-Type", "application/json");
      res.setHeader("Access-Control-Allow-Origin", effectiveOrigin!);
      res.status(200).json({ results });
      return;
    } catch (error) {
      logError(requestId, `Error with ${keyLabel} key`, error);
      // If we have more keys, try the next one
      if (keyIndex < apiKeys.length - 1) {
        logInfo(requestId, `Retrying with next API key`);
        continue;
      }
      // No more keys to try
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Access-Control-Allow-Origin", effectiveOrigin!);
      res.status(500).json({ error: "Failed to search YouTube" });
      return;
    }
  }

  // All keys exhausted (quota exceeded on all)
  logError(requestId, "All API keys exhausted", { lastError });
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", effectiveOrigin || "*");
  res.status(lastError?.status || 403).json({ 
    error: lastError?.message || "All YouTube API keys have exceeded their quota",
    code: lastError?.code || 403,
    hint: "All configured API keys have exceeded their quota. Please try again later."
  });
}
