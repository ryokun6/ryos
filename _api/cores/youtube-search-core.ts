import { z } from "zod";
import * as RateLimit from "../_utils/_rate-limit.js";
import type { CoreResponse } from "../_runtime/core-types.js";

const YouTubeSearchRequestSchema = z.object({
  query: z.string().min(1, "Query is required"),
  maxResults: z.number().min(1).max(25).optional().default(10),
});

type YouTubeSearchRequest = z.infer<typeof YouTubeSearchRequestSchema>;

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

interface SearchResultItem {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  publishedAt: string;
}

interface ExecuteYoutubeSearchCoreInput {
  originAllowed: boolean;
  body: unknown;
  ip: string;
  apiKeys?: string[];
}

interface LoggerLike {
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
}

const noopLogger: LoggerLike = {
  info() {},
  warn() {},
  error() {},
};

function collectApiKeys(inputKeys?: string[]): string[] {
  if (inputKeys && inputKeys.length > 0) {
    return inputKeys;
  }
  return [process.env.YOUTUBE_API_KEY, process.env.YOUTUBE_API_KEY_2].filter(
    (key): key is string => !!key
  );
}

export async function executeYoutubeSearchCore(
  input: ExecuteYoutubeSearchCoreInput,
  logger: LoggerLike = noopLogger
): Promise<CoreResponse> {
  if (!input.originAllowed) {
    return { status: 403, body: { error: "Origin not allowed" } };
  }

  const BURST_WINDOW = 60;
  const BURST_LIMIT = 20;
  const DAILY_WINDOW = 60 * 60 * 24;
  const DAILY_LIMIT = 200;

  try {
    const burstKey = RateLimit.makeKey(["rl", "youtube-search", "burst", "ip", input.ip]);
    const dailyKey = RateLimit.makeKey(["rl", "youtube-search", "daily", "ip", input.ip]);

    const burst = await RateLimit.checkCounterLimit({
      key: burstKey,
      windowSeconds: BURST_WINDOW,
      limit: BURST_LIMIT,
    });
    if (!burst.allowed) {
      return {
        status: 429,
        headers: { "Retry-After": String(burst.resetSeconds ?? BURST_WINDOW) },
        body: { error: "rate_limit_exceeded", scope: "burst" },
      };
    }

    const daily = await RateLimit.checkCounterLimit({
      key: dailyKey,
      windowSeconds: DAILY_WINDOW,
      limit: DAILY_LIMIT,
    });
    if (!daily.allowed) {
      return {
        status: 429,
        headers: { "Retry-After": String(daily.resetSeconds ?? DAILY_WINDOW) },
        body: { error: "rate_limit_exceeded", scope: "daily" },
      };
    }
  } catch (error) {
    logger.error("Rate limit check failed", error);
  }

  const apiKeys = collectApiKeys(input.apiKeys);
  if (apiKeys.length === 0) {
    return {
      status: 500,
      body: {
        error: "YouTube API is not configured",
        hint: "Add YOUTUBE_API_KEY to your environment.",
      },
    };
  }

  let body: YouTubeSearchRequest;
  try {
    body = YouTubeSearchRequestSchema.parse(input.body);
  } catch (error) {
    logger.error("Invalid request body", error);
    return { status: 400, body: { error: "Invalid request body" } };
  }

  const { query, maxResults } = body;

  const isQuotaError = (status: number, data: YouTubeSearchResponse): boolean => {
    if (status === 403) {
      const message = data.error?.message?.toLowerCase() || "";
      return (
        message.includes("quota") ||
        message.includes("exceeded") ||
        message.includes("limit")
      );
    }
    return false;
  };

  let lastError: { status: number; message: string; code: number } | null = null;

  for (let keyIndex = 0; keyIndex < apiKeys.length; keyIndex += 1) {
    const apiKey = apiKeys[keyIndex];
    const keyLabel = keyIndex === 0 ? "primary" : `backup-${keyIndex}`;

    try {
      logger.info("Trying API key", {
        keyLabel,
        keyIndex: keyIndex + 1,
        totalKeys: apiKeys.length,
      });

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
          lastError = { status: response.status, message: errorMessage, code: errorCode };
          continue;
        }

        return {
          status: response.status,
          body: {
            error: errorMessage,
            code: errorCode,
            hint:
              errorCode === 403
                ? "YouTube API access denied. Ensure the API key is valid and YouTube Data API v3 is enabled in Google Cloud Console."
                : undefined,
          },
        };
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

      return { status: 200, body: { results } };
    } catch (error) {
      logger.error(`Error with ${keyLabel} key`, error);
      if (keyIndex >= apiKeys.length - 1) {
        return { status: 500, body: { error: "Failed to search YouTube" } };
      }
    }
  }

  return {
    status: lastError?.status || 403,
    body: {
      error: lastError?.message || "All YouTube API keys have exceeded their quota",
      code: lastError?.code || 403,
      hint: "All configured API keys have exceeded their quota. Please try again later.",
    },
  };
}
