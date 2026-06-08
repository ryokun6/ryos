export interface YouTubeApiSearchItem {
  id?: {
    kind?: string;
    videoId?: string;
  };
  snippet?: {
    title?: string;
    channelTitle?: string;
    publishedAt?: string;
    thumbnails?: {
      default?: { url?: string };
      medium?: { url?: string };
      high?: { url?: string };
    };
  };
}

export interface YouTubeApiSearchResponse {
  items?: YouTubeApiSearchItem[];
  error?: {
    code?: number;
    message?: string;
  };
}

export interface YouTubeSearchHit {
  videoId: string;
  title: string;
  channelTitle: string;
  publishedAt: string;
  thumbnailUrl: string;
}

export type YouTubeSearchCategory = "music" | "all";
export type YouTubeSafeSearch = "none" | "moderate" | "strict";

export interface YouTubeSearchParams {
  query: string;
  maxResults: number;
  category?: YouTubeSearchCategory;
  videoEmbeddable?: boolean;
  safeSearch?: YouTubeSafeSearch;
}

export interface YouTubeClientOptions {
  apiKeys: string[];
  fetch?: typeof fetch;
  timeoutMs?: number;
  onKeyAttempt?: (info: { keyIndex: number; keyLabel: string }) => void;
}

export type YouTubeClientFailureReason =
  | "not_configured"
  | "quota_exhausted"
  | "api_error"
  | "network_error"
  | "aborted";

export interface YouTubeSearchSuccess {
  ok: true;
  hits: YouTubeSearchHit[];
  keyLabel: string;
}

export interface YouTubeSearchFailure {
  ok: false;
  reason: YouTubeClientFailureReason;
  status?: number;
  googleCode?: number;
  message: string;
  lastKeyLabel?: string;
}

export type YouTubeSearchResult = YouTubeSearchSuccess | YouTubeSearchFailure;

export function getYouTubeApiKeys(
  env: Record<string, string | undefined>
): string[] {
  return [env.YOUTUBE_API_KEY, env.YOUTUBE_API_KEY_2].filter(
    (key): key is string => Boolean(key)
  );
}

export function isYouTubeQuotaError(status: number, message: string): boolean {
  return status === 403 && /(quota|exceeded|limit)/i.test(message);
}

export function buildYouTubeSearchUrl(
  params: YouTubeSearchParams,
  apiKey: string
): URL {
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "video");

  if (params.videoEmbeddable ?? true) {
    url.searchParams.set("videoEmbeddable", "true");
  }

  if ((params.category ?? "music") === "music") {
    url.searchParams.set("videoCategoryId", "10");
  }

  if (params.safeSearch) {
    url.searchParams.set("safeSearch", params.safeSearch);
  }

  url.searchParams.set("q", params.query);
  url.searchParams.set("maxResults", String(params.maxResults));
  url.searchParams.set("key", apiKey);
  return url;
}

export function mapYouTubeSearchItems(
  items: YouTubeApiSearchItem[] | undefined
): YouTubeSearchHit[] {
  return (items ?? []).reduce<YouTubeSearchHit[]>((acc, item) => {
    const videoId = item.id?.videoId;
    if (!videoId) {
      return acc;
    }

    acc.push({
      videoId,
      title: item.snippet?.title ?? "",
      channelTitle: item.snippet?.channelTitle ?? "",
      publishedAt: item.snippet?.publishedAt ?? "",
      thumbnailUrl:
        item.snippet?.thumbnails?.medium?.url ||
        item.snippet?.thumbnails?.default?.url ||
        "",
    });
    return acc;
  }, []);
}

function keyLabelForIndex(index: number): string {
  return index === 0 ? "primary" : `backup-${index}`;
}

async function readYouTubeResponse(response: Response): Promise<{
  data: YouTubeApiSearchResponse;
  text: string;
}> {
  const text = await response.text();
  if (!text) {
    return { data: {}, text };
  }

  try {
    return { data: JSON.parse(text) as YouTubeApiSearchResponse, text };
  } catch {
    return { data: {}, text };
  }
}

export async function youtubeSearch(
  params: YouTubeSearchParams,
  options: YouTubeClientOptions
): Promise<YouTubeSearchResult> {
  const apiKeys = options.apiKeys.filter(Boolean);
  if (apiKeys.length === 0) {
    return {
      ok: false,
      reason: "not_configured",
      message: "No YouTube API keys configured",
    };
  }

  const fetchImpl = options.fetch ?? fetch;
  let lastFailure: YouTubeSearchFailure | null = null;

  for (let keyIndex = 0; keyIndex < apiKeys.length; keyIndex++) {
    const apiKey = apiKeys[keyIndex];
    const keyLabel = keyLabelForIndex(keyIndex);
    options.onKeyAttempt?.({ keyIndex, keyLabel });

    const controller =
      options.timeoutMs !== undefined ? new AbortController() : null;
    const timeoutId =
      controller && options.timeoutMs !== undefined
        ? setTimeout(() => controller.abort(), options.timeoutMs)
        : null;

    try {
      const url = buildYouTubeSearchUrl(params, apiKey);
      const response = await fetchImpl(url.toString(), {
        signal: controller?.signal,
      });
      const { data, text } = await readYouTubeResponse(response);
      const message =
        data.error?.message || text || `YouTube API error (${response.status})`;
      const googleCode = data.error?.code || response.status;

      if (!response.ok || data.error) {
        const quota = isYouTubeQuotaError(response.status, message);
        lastFailure = {
          ok: false,
          reason: quota ? "quota_exhausted" : "api_error",
          status: response.status,
          googleCode,
          message,
          lastKeyLabel: keyLabel,
        };

        if (quota && keyIndex < apiKeys.length - 1) {
          continue;
        }

        return lastFailure;
      }

      return {
        ok: true,
        hits: mapYouTubeSearchItems(data.items),
        keyLabel,
      };
    } catch (error) {
      const aborted =
        error instanceof Error &&
        (error.name === "AbortError" || controller?.signal.aborted);
      lastFailure = {
        ok: false,
        reason: aborted ? "aborted" : "network_error",
        message:
          error instanceof Error
            ? error.message
            : "Failed to search YouTube",
        lastKeyLabel: keyLabel,
      };

      if (keyIndex < apiKeys.length - 1) {
        continue;
      }

      return lastFailure;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  return (
    lastFailure ?? {
      ok: false,
      reason: "quota_exhausted",
      status: 403,
      googleCode: 403,
      message: "All YouTube API keys have exceeded their quota",
    }
  );
}

export function toYoutubeSearchRouteItem(hit: YouTubeSearchHit): {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  publishedAt: string;
} {
  return {
    videoId: hit.videoId,
    title: hit.title,
    channelTitle: hit.channelTitle,
    thumbnail: hit.thumbnailUrl,
    publishedAt: hit.publishedAt,
  };
}

export function toSearchSongsResult(hit: YouTubeSearchHit): {
  videoId: string;
  title: string;
  channelTitle: string;
  publishedAt: string;
} {
  return {
    videoId: hit.videoId,
    title: hit.title,
    channelTitle: hit.channelTitle,
    publishedAt: hit.publishedAt,
  };
}
