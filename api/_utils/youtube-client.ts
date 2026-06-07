/**
 * Shared YouTube Data API v3 search client with key rotation and quota handling.
 */

export interface YouTubeApiKeysSource {
  YOUTUBE_API_KEY?: string;
  YOUTUBE_API_KEY_2?: string;
}

export interface YouTubeSearchItem {
  id: {
    kind?: string;
    videoId?: string;
  };
  snippet: {
    title: string;
    description?: string;
    channelTitle: string;
    thumbnails?: {
      default?: { url: string; width?: number; height?: number };
      medium?: { url: string; width?: number; height?: number };
      high?: { url: string; width?: number; height?: number };
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

export interface YouTubeMappedResult {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  publishedAt: string;
}

export interface YouTubeSearchOptions {
  query: string;
  maxResults: number;
  apiKeys?: string[];
  /** "music" sets videoCategoryId=10; "all" performs unrestricted search. */
  category?: "music" | "all";
  videoEmbeddable?: boolean;
  safeSearch?: "moderate" | "none" | "strict";
  timeoutMs?: number;
  log?: (message: string, data?: unknown) => void;
}

export interface YouTubeSearchSuccess {
  ok: true;
  items: YouTubeMappedResult[];
  keyLabel: string;
}

export interface YouTubeSearchFailure {
  ok: false;
  status: number;
  message: string;
  code: number;
  exhausted: boolean;
}

export type YouTubeSearchOutcome = YouTubeSearchSuccess | YouTubeSearchFailure;

export function getYouTubeApiKeys(
  source: YouTubeApiKeysSource = process.env
): string[] {
  return [source.YOUTUBE_API_KEY, source.YOUTUBE_API_KEY_2].filter(
    (key): key is string => Boolean(key)
  );
}

export function isYouTubeQuotaError(
  status: number,
  message: string
): boolean {
  if (status !== 403) return false;
  const lower = message.toLowerCase();
  return (
    lower.includes("quota") ||
    lower.includes("exceeded") ||
    lower.includes("limit")
  );
}

export function mapYouTubeSearchItems(
  items: YouTubeSearchItem[] | undefined
): YouTubeMappedResult[] {
  return (items ?? []).reduce<YouTubeMappedResult[]>((acc, item) => {
    if (!item.id?.videoId) return acc;
    acc.push({
      videoId: item.id.videoId,
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,
      thumbnail:
        item.snippet.thumbnails?.medium?.url ||
        item.snippet.thumbnails?.default?.url ||
        "",
      publishedAt: item.snippet.publishedAt,
    });
    return acc;
  }, []);
}

/**
 * Search YouTube with API key rotation on quota errors.
 */
export async function searchYouTube(
  options: YouTubeSearchOptions
): Promise<YouTubeSearchOutcome> {
  const {
    query,
    maxResults,
    category = "music",
    videoEmbeddable = true,
    safeSearch,
    timeoutMs,
    log,
  } = options;

  const apiKeys = options.apiKeys ?? getYouTubeApiKeys();
  if (apiKeys.length === 0) {
    return {
      ok: false,
      status: 500,
      message: "YouTube API is not configured",
      code: 500,
      exhausted: false,
    };
  }

  let lastError: { status: number; message: string; code: number } | null =
    null;

  for (let keyIndex = 0; keyIndex < apiKeys.length; keyIndex++) {
    const apiKey = apiKeys[keyIndex];
    const keyLabel = keyIndex === 0 ? "primary" : `backup-${keyIndex}`;

    try {
      log?.(`Trying API key`, {
        keyLabel,
        keyIndex: keyIndex + 1,
        totalKeys: apiKeys.length,
      });

      const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
      searchUrl.searchParams.set("part", "snippet");
      searchUrl.searchParams.set("type", "video");
      if (videoEmbeddable) {
        searchUrl.searchParams.set("videoEmbeddable", "true");
      }
      if (category === "music") {
        searchUrl.searchParams.set("videoCategoryId", "10");
      }
      if (safeSearch) {
        searchUrl.searchParams.set("safeSearch", safeSearch);
      }
      searchUrl.searchParams.set("q", query);
      searchUrl.searchParams.set("maxResults", String(maxResults));
      searchUrl.searchParams.set("key", apiKey);

      let response: Response;
      if (timeoutMs) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
          response = await fetch(searchUrl.toString(), {
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeoutId);
        }
      } else {
        response = await fetch(searchUrl.toString());
      }

      const outcome = await handleYouTubeResponse(
        response,
        keyLabel,
        keyIndex,
        apiKeys.length
      );
      if (outcome.type === "success") {
        return { ok: true, items: outcome.items, keyLabel };
      }
      if (outcome.type === "rotate") {
        lastError = outcome.lastError;
        continue;
      }
      return outcome.failure;
    } catch (error) {
      log?.(`Error with ${keyLabel} key`, error);
      if (keyIndex < apiKeys.length - 1) {
        log?.(`Retrying with next API key`);
        continue;
      }
      return {
        ok: false,
        status: 500,
        message: "Failed to search YouTube",
        code: 500,
        exhausted: true,
      };
    }
  }

  return {
    ok: false,
    status: lastError?.status || 403,
    message:
      lastError?.message ||
      "All YouTube API keys have exceeded their quota",
    code: lastError?.code || 403,
    exhausted: true,
  };
}

type HandleOutcome =
  | { type: "success"; items: YouTubeMappedResult[] }
  | {
      type: "rotate";
      lastError: { status: number; message: string; code: number };
    }
  | { type: "failure"; failure: YouTubeSearchFailure };

async function handleYouTubeResponse(
  response: Response,
  _keyLabel: string,
  keyIndex: number,
  totalKeys: number
): Promise<HandleOutcome> {
  const data = (await response.json()) as YouTubeSearchResponse;

  if (!response.ok || data.error) {
    const errorCode = data.error?.code || response.status;
    const errorMessage =
      data.error?.message || `YouTube API error (${response.status})`;

    if (
      isYouTubeQuotaError(response.status, errorMessage) &&
      keyIndex < totalKeys - 1
    ) {
      return {
        type: "rotate",
        lastError: {
          status: response.status,
          message: errorMessage,
          code: errorCode,
        },
      };
    }

    return {
      type: "failure",
      failure: {
        ok: false,
        status: response.status,
        message: errorMessage,
        code: errorCode,
        exhausted: false,
      },
    };
  }

  return {
    type: "success",
    items: mapYouTubeSearchItems(data.items),
  };
}
