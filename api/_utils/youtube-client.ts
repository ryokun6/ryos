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

export interface YouTubeApiErrorBody {
  code?: number;
  message?: string;
  status?: string;
  errors?: Array<{ reason?: string; domain?: string; message?: string }>;
  details?: Array<{ "@type"?: string; reason?: string }>;
}

export interface YouTubeApiSearchResponse {
  items?: YouTubeApiSearchItem[];
  error?: YouTubeApiErrorBody;
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

/**
 * How a single key's failure is treated:
 * - `quota`: the key's project is out of quota / rate-limited; try the next key.
 * - `key_rejected`: the key itself is unusable (invalid, referrer/IP restricted,
 *   API not enabled in its project); try the next key.
 * - `request`: the request is bad regardless of key; stop.
 */
export type YouTubeKeyFailureKind = "quota" | "key_rejected" | "request";

export interface YouTubeKeyAttemptFailure {
  keyIndex: number;
  keyLabel: string;
  kind: YouTubeKeyFailureKind | "network_error" | "aborted";
  status?: number;
  googleReason?: string;
}

export interface YouTubeClientOptions {
  apiKeys: string[];
  fetch?: typeof fetch;
  timeoutMs?: number;
  onKeyAttempt?: (info: { keyIndex: number; keyLabel: string }) => void;
  /** Never receives the key itself, only its index/label and the failure class. */
  onKeyFailure?: (info: YouTubeKeyAttemptFailure) => void;
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
  failedAttempts: YouTubeKeyAttemptFailure[];
}

export interface YouTubeSearchFailure {
  ok: false;
  reason: YouTubeClientFailureReason;
  status?: number;
  googleCode?: number;
  googleReason?: string;
  /** Raw upstream message; for server logs only, never show it to users. */
  message: string;
  lastKeyLabel?: string;
  failedAttempts: YouTubeKeyAttemptFailure[];
}

export type YouTubeSearchResult = YouTubeSearchSuccess | YouTubeSearchFailure;

export const YOUTUBE_QUOTA_EXHAUSTED_CODE = "youtube_quota_exhausted";
export const YOUTUBE_UNAVAILABLE_CODE = "youtube_unavailable";

export function getYouTubeApiKeys(
  env: Record<string, string | undefined>
): string[] {
  const keys = [
    env.YOUTUBE_API_KEY,
    env.YOUTUBE_API_KEY_2,
    env.YOUTUBE_API_KEY_3,
  ]
    .map((key) => key?.trim())
    .filter((key): key is string => Boolean(key));
  return [...new Set(keys)];
}

const QUOTA_REASONS = new Set([
  "quotaexceeded",
  "dailylimitexceeded",
  "dailylimitexceededunreg",
  "ratelimitexceeded",
  "userratelimitexceeded",
  "resource_exhausted",
  "rate_limit_exceeded",
]);

const KEY_REJECTED_REASONS = new Set([
  "keyinvalid",
  "keyexpired",
  "accessnotconfigured",
  "forbidden",
  "iprefererblocked",
  "api_key_invalid",
  "api_key_expired",
  "api_key_http_referrer_blocked",
  "api_key_ip_address_blocked",
  "api_key_android_app_blocked",
  "api_key_ios_app_blocked",
  "api_key_service_blocked",
  "service_disabled",
  "consumer_invalid",
  "permission_denied",
  "unauthenticated",
]);

function collectGoogleReasons(error: YouTubeApiErrorBody | undefined): string[] {
  if (!error) return [];
  const reasons: string[] = [];
  for (const detail of error.details ?? []) {
    if (detail.reason) reasons.push(detail.reason);
  }
  for (const item of error.errors ?? []) {
    if (item.reason) reasons.push(item.reason);
  }
  if (error.status) reasons.push(error.status);
  return reasons;
}

export function classifyYouTubeError(
  status: number,
  error: YouTubeApiErrorBody | undefined,
  message: string
): { kind: YouTubeKeyFailureKind; googleReason?: string } {
  const reasons = collectGoogleReasons(error);
  const normalized = reasons.map((r) => r.toLowerCase());
  const quotaReason = reasons.find((_, i) => QUOTA_REASONS.has(normalized[i]));
  if (quotaReason) return { kind: "quota", googleReason: quotaReason };
  if (status === 429 || isYouTubeQuotaError(status, message)) {
    return { kind: "quota", googleReason: reasons[0] };
  }

  const keyReason = reasons.find((_, i) =>
    KEY_REJECTED_REASONS.has(normalized[i])
  );
  if (keyReason || status === 401 || status === 403) {
    return { kind: "key_rejected", googleReason: keyReason ?? reasons[0] };
  }
  if (status === 400 && /api key/i.test(message)) {
    return { kind: "key_rejected", googleReason: reasons[0] };
  }
  return { kind: "request", googleReason: reasons[0] };
}

export function isYouTubeQuotaError(status: number, message: string): boolean {
  return (
    (status === 403 || status === 429) &&
    /(quota|exceeded|limit)/i.test(message)
  );
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
  const failedAttempts: YouTubeKeyAttemptFailure[] = [];
  if (apiKeys.length === 0) {
    return {
      ok: false,
      reason: "not_configured",
      message: "No YouTube API keys configured",
      failedAttempts,
    };
  }

  const fetchImpl = options.fetch ?? fetch;
  let lastFailure: YouTubeSearchFailure | null = null;
  let sawQuota = false;

  const recordFailure = (failure: YouTubeKeyAttemptFailure) => {
    failedAttempts.push(failure);
    options.onKeyFailure?.(failure);
  };

  for (let keyIndex = 0; keyIndex < apiKeys.length; keyIndex++) {
    const apiKey = apiKeys[keyIndex];
    const keyLabel = keyLabelForIndex(keyIndex);
    const isLastKey = keyIndex === apiKeys.length - 1;
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

      if (!response.ok || data.error) {
        const message =
          data.error?.message || text || `YouTube API error (${response.status})`;
        const googleCode = data.error?.code || response.status;
        const { kind, googleReason } = classifyYouTubeError(
          response.status,
          data.error,
          message
        );
        if (kind === "quota") sawQuota = true;
        recordFailure({
          keyIndex,
          keyLabel,
          kind,
          status: response.status,
          googleReason,
        });

        lastFailure = {
          ok: false,
          reason: kind === "quota" ? "quota_exhausted" : "api_error",
          status: response.status,
          googleCode,
          googleReason,
          message,
          lastKeyLabel: keyLabel,
          failedAttempts,
        };

        if (kind !== "request" && !isLastKey) {
          continue;
        }

        break;
      }

      return {
        ok: true,
        hits: mapYouTubeSearchItems(data.items),
        keyLabel,
        failedAttempts,
      };
    } catch (error) {
      const aborted =
        error instanceof Error &&
        (error.name === "AbortError" || Boolean(controller?.signal.aborted));
      recordFailure({
        keyIndex,
        keyLabel,
        kind: aborted ? "aborted" : "network_error",
      });
      lastFailure = {
        ok: false,
        reason: aborted ? "aborted" : "network_error",
        message:
          error instanceof Error
            ? error.message
            : "Failed to search YouTube",
        lastKeyLabel: keyLabel,
        failedAttempts,
      };

      if (!isLastKey) {
        continue;
      }
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  const failure: YouTubeSearchFailure = lastFailure ?? {
    ok: false,
    reason: "quota_exhausted",
    status: 429,
    googleCode: 429,
    message: "All YouTube API keys have exceeded their quota",
    failedAttempts,
  };

  // A quota hit on an earlier key should win over a later key that was
  // merely misconfigured, so callers can show the "try again later" message.
  if (sawQuota && failure.reason === "api_error") {
    const allKeyScoped = failedAttempts.every(
      (attempt) => attempt.kind === "quota" || attempt.kind === "key_rejected"
    );
    if (allKeyScoped) {
      return { ...failure, reason: "quota_exhausted" };
    }
  }

  return failure;
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
