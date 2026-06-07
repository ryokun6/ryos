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
    publishedAt?: string;
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

export interface YouTubeVideoSearchResult {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  publishedAt: string;
}

export class YouTubeApiError extends Error {
  status: number;
  code: number;
  keyLabel?: string;

  constructor(message: string, status: number, code = status, keyLabel?: string) {
    super(message);
    this.name = "YouTubeApiError";
    this.status = status;
    this.code = code;
    this.keyLabel = keyLabel;
  }
}

export function getYouTubeApiKeys(
  env: Pick<NodeJS.ProcessEnv, "YOUTUBE_API_KEY" | "YOUTUBE_API_KEY_2"> = process.env
): string[] {
  return [env.YOUTUBE_API_KEY, env.YOUTUBE_API_KEY_2].filter(
    (key): key is string => !!key
  );
}

export function isYouTubeQuotaError(
  status: number,
  dataOrMessage: YouTubeSearchResponse | string
): boolean {
  if (status !== 403) {
    return false;
  }

  const message =
    typeof dataOrMessage === "string"
      ? dataOrMessage.toLowerCase()
      : dataOrMessage.error?.message?.toLowerCase() || "";

  return (
    message.includes("quota") ||
    message.includes("exceeded") ||
    message.includes("limit")
  );
}

export interface SearchYouTubeVideosOptions {
  query: string;
  maxResults: number;
  apiKeys?: string[];
  musicOnly?: boolean;
  safeSearch?: "none" | "moderate" | "strict";
  videoEmbeddable?: boolean;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  onAttempt?: (details: {
    keyLabel: string;
    keyIndex: number;
    totalKeys: number;
  }) => void;
  onQuotaRotation?: (details: {
    keyLabel: string;
    errorMessage: string;
    nextKeyIndex: number;
  }) => void;
}

export async function searchYouTubeVideos({
  query,
  maxResults,
  apiKeys = getYouTubeApiKeys(),
  musicOnly = false,
  safeSearch,
  videoEmbeddable = true,
  timeoutMs,
  fetchImpl = fetch,
  onAttempt,
  onQuotaRotation,
}: SearchYouTubeVideosOptions): Promise<{
  results: YouTubeVideoSearchResult[];
  keyLabel: string;
}> {
  let lastError: YouTubeApiError | null = null;

  for (let keyIndex = 0; keyIndex < apiKeys.length; keyIndex++) {
    const apiKey = apiKeys[keyIndex];
    const keyLabel = keyIndex === 0 ? "primary" : `backup-${keyIndex}`;

    try {
      onAttempt?.({ keyLabel, keyIndex: keyIndex + 1, totalKeys: apiKeys.length });

      const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
      searchUrl.searchParams.set("part", "snippet");
      searchUrl.searchParams.set("type", "video");
      if (videoEmbeddable) {
        searchUrl.searchParams.set("videoEmbeddable", "true");
      }
      if (safeSearch) {
        searchUrl.searchParams.set("safeSearch", safeSearch);
      }
      if (musicOnly) {
        searchUrl.searchParams.set("videoCategoryId", "10");
      }
      searchUrl.searchParams.set("q", query);
      searchUrl.searchParams.set("maxResults", String(maxResults));
      searchUrl.searchParams.set("key", apiKey);

      const controller = timeoutMs ? new AbortController() : null;
      const timeoutId = controller
        ? setTimeout(() => controller.abort(), timeoutMs)
        : null;
      let response: Response;
      try {
        response = await fetchImpl(searchUrl.toString(), {
          signal: controller?.signal,
        });
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
      const data = (await response.json()) as YouTubeSearchResponse;

      if (!response.ok || data.error) {
        const code = data.error?.code || response.status;
        const message =
          data.error?.message || `YouTube API error (${response.status})`;

        if (
          isYouTubeQuotaError(response.status, data) &&
          keyIndex < apiKeys.length - 1
        ) {
          onQuotaRotation?.({
            keyLabel,
            errorMessage: message,
            nextKeyIndex: keyIndex + 2,
          });
          lastError = new YouTubeApiError(message, response.status, code, keyLabel);
          continue;
        }

        throw new YouTubeApiError(message, response.status, code, keyLabel);
      }

      const results = (data.items || []).reduce<YouTubeVideoSearchResult[]>(
        (acc, item) => {
          if (!item.id.videoId) {
            return acc;
          }

          acc.push({
            videoId: item.id.videoId,
            title: item.snippet.title,
            channelTitle: item.snippet.channelTitle,
            thumbnail:
              item.snippet.thumbnails?.medium?.url ||
              item.snippet.thumbnails?.default?.url ||
              "",
            publishedAt: item.snippet.publishedAt || "",
          });
          return acc;
        },
        []
      );

      return { results, keyLabel };
    } catch (error) {
      if (error instanceof YouTubeApiError) {
        throw error;
      }

      if (keyIndex < apiKeys.length - 1) {
        continue;
      }

      throw new YouTubeApiError(
        error instanceof Error ? error.message : "Failed to search YouTube",
        500,
        500,
        keyLabel
      );
    }
  }

  throw (
    lastError ||
    new YouTubeApiError(
      "All YouTube API keys have exceeded their quota",
      403,
      403
    )
  );
}
