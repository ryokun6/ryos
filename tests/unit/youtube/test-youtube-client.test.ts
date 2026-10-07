import { describe, expect, test } from "bun:test";
import {
  buildYouTubeSearchUrl,
  classifyYouTubeError,
  getYouTubeApiKeys,
  isYouTubeQuotaError,
  mapYouTubeSearchItems,
  toSearchSongsResult,
  toYoutubeSearchRouteItem,
  youtubeSearch,
} from "../../../api/_utils/youtube-client.js";

const PROJECT_QUOTA_429 = {
  error: {
    code: 429,
    message:
      "Quota exceeded for quota metric 'Search Queries' and limit 'Search Queries per day' of service 'youtube.googleapis.com' for consumer 'project_number:864406575630'.",
    errors: [
      {
        message:
          "Quota exceeded for quota metric 'Search Queries' and limit 'Search Queries per day' of service 'youtube.googleapis.com' for consumer 'project_number:864406575630'.",
        domain: "global",
        reason: "rateLimitExceeded",
      },
    ],
    status: "RESOURCE_EXHAUSTED",
    details: [
      {
        "@type": "type.googleapis.com/google.rpc.ErrorInfo",
        reason: "RATE_LIMIT_EXCEEDED",
      },
    ],
  },
};

const REFERRER_BLOCKED_403 = {
  error: {
    code: 403,
    message: "Requests from referer <empty> are blocked.",
    errors: [
      {
        message: "Requests from referer <empty> are blocked.",
        domain: "global",
        reason: "forbidden",
      },
    ],
    status: "PERMISSION_DENIED",
    details: [
      {
        "@type": "type.googleapis.com/google.rpc.ErrorInfo",
        reason: "API_KEY_HTTP_REFERRER_BLOCKED",
      },
    ],
  },
};

const KEY_INVALID_400 = {
  error: {
    code: 400,
    message: "API key not valid. Please pass a valid API key.",
    errors: [
      {
        message: "API key not valid. Please pass a valid API key.",
        domain: "global",
        reason: "badRequest",
      },
    ],
    status: "INVALID_ARGUMENT",
    details: [
      {
        "@type": "type.googleapis.com/google.rpc.ErrorInfo",
        reason: "API_KEY_INVALID",
      },
    ],
  },
};

const BAD_PARAM_400 = {
  error: {
    code: 400,
    message: "Invalid value for maxResults.",
    errors: [
      {
        message: "Invalid value for maxResults.",
        domain: "youtube.parameter",
        reason: "invalidParameter",
      },
    ],
    status: "INVALID_ARGUMENT",
  },
};

function legacy403(reason: string, message: string) {
  return {
    error: {
      code: 403,
      message,
      errors: [{ message, domain: "youtube.quota", reason }],
    },
  };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const OK_BODY = {
  items: [
    {
      id: { videoId: "yt_ok" },
      snippet: {
        title: "OK",
        channelTitle: "Artist",
        publishedAt: "2024-01-01T00:00:00Z",
      },
    },
  ],
};

/** Keys without a scripted handler succeed. */
function scriptedFetch(handlers: Record<string, () => Response>) {
  const attempted: string[] = [];
  const fetch = (async (input: RequestInfo | URL) => {
    const key = new URL(String(input)).searchParams.get("key") || "";
    attempted.push(key);
    const handler = handlers[key];
    return handler ? handler() : json(200, OK_BODY);
  }) as typeof globalThis.fetch;
  return { fetch, attempted };
}

describe("youtube-client", () => {
  test("collects configured API keys in primary/fallback order", () => {
    expect(
      getYouTubeApiKeys({
        YOUTUBE_API_KEY: "primary",
        YOUTUBE_API_KEY_2: "backup",
      })
    ).toEqual(["primary", "backup"]);

    expect(
      getYouTubeApiKeys({
        YOUTUBE_API_KEY: "",
        YOUTUBE_API_KEY_2: "backup",
      })
    ).toEqual(["backup"]);

    expect(
      getYouTubeApiKeys({
        YOUTUBE_API_KEY: "primary",
        YOUTUBE_API_KEY_2: "backup",
        YOUTUBE_API_KEY_3: "backup-2",
      })
    ).toEqual(["primary", "backup", "backup-2"]);

    expect(
      getYouTubeApiKeys({
        YOUTUBE_API_KEY: "primary",
        YOUTUBE_API_KEY_3: "backup-2",
      })
    ).toEqual(["primary", "backup-2"]);

    expect(
      getYouTubeApiKeys({
        YOUTUBE_API_KEY: " primary ",
        YOUTUBE_API_KEY_2: "primary",
        YOUTUBE_API_KEY_3: "   ",
      })
    ).toEqual(["primary"]);
  });

  test("falls through to the third API key when the first two are exhausted", async () => {
    const attemptedKeys: string[] = [];
    const result = await youtubeSearch(
      { query: "lofi", maxResults: 1 },
      {
        apiKeys: getYouTubeApiKeys({
          YOUTUBE_API_KEY: "primary",
          YOUTUBE_API_KEY_2: "backup",
          YOUTUBE_API_KEY_3: "backup-2",
        }),
        fetch: async (input) => {
          const key = new URL(String(input)).searchParams.get("key") || "";
          attemptedKeys.push(key);
          if (key !== "backup-2") {
            return new Response(
              JSON.stringify({
                error: { code: 403, message: "quota exceeded" },
              }),
              { status: 403, headers: { "Content-Type": "application/json" } }
            );
          }

          return new Response(
            JSON.stringify({
              items: [
                {
                  id: { videoId: "yt_third" },
                  snippet: {
                    title: "Third",
                    channelTitle: "Artist",
                    publishedAt: "2024-01-01T00:00:00Z",
                  },
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        },
      }
    );

    expect(attemptedKeys).toEqual(["primary", "backup", "backup-2"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.keyLabel).toBe("backup-2");
      expect(result.hits[0]?.videoId).toBe("yt_third");
    }
  });

  test("detects quota errors only on 403/429 quota-like responses", () => {
    expect(isYouTubeQuotaError(403, "quota exceeded")).toBe(true);
    expect(isYouTubeQuotaError(403, "daily limit reached")).toBe(true);
    expect(isYouTubeQuotaError(429, "Quota exceeded for quota metric")).toBe(
      true
    );
    expect(isYouTubeQuotaError(403, "forbidden")).toBe(false);
    expect(isYouTubeQuotaError(500, "quota exceeded")).toBe(false);
  });

  test("classifies Google errors by reason, not just status", () => {
    expect(
      classifyYouTubeError(429, PROJECT_QUOTA_429.error, PROJECT_QUOTA_429.error.message)
        .kind
    ).toBe("quota");
    for (const reason of [
      "quotaExceeded",
      "dailyLimitExceeded",
      "rateLimitExceeded",
      "userRateLimitExceeded",
    ]) {
      const body = legacy403(reason, "The request cannot be completed.");
      expect(classifyYouTubeError(403, body.error, body.error.message)).toEqual({
        kind: "quota",
        googleReason: reason,
      });
    }
    expect(
      classifyYouTubeError(403, REFERRER_BLOCKED_403.error, REFERRER_BLOCKED_403.error.message)
        .kind
    ).toBe("key_rejected");
    expect(
      classifyYouTubeError(400, KEY_INVALID_400.error, KEY_INVALID_400.error.message).kind
    ).toBe("key_rejected");
    expect(
      classifyYouTubeError(400, BAD_PARAM_400.error, BAD_PARAM_400.error.message).kind
    ).toBe("request");
  });

  test("builds search URLs with caller-specific params", () => {
    const music = buildYouTubeSearchUrl(
      { query: "plastic love", maxResults: 5, category: "music" },
      "key"
    );
    expect(music.searchParams.get("videoCategoryId")).toBe("10");
    expect(music.searchParams.get("videoEmbeddable")).toBe("true");
    expect(music.searchParams.get("q")).toBe("plastic love");
    expect(music.searchParams.get("maxResults")).toBe("5");

    const tv = buildYouTubeSearchUrl(
      {
        query: "skate videos",
        maxResults: 8,
        category: "all",
        safeSearch: "moderate",
      },
      "key"
    );
    expect(tv.searchParams.has("videoCategoryId")).toBe(false);
    expect(tv.searchParams.get("videoEmbeddable")).toBe("true");
    expect(tv.searchParams.get("safeSearch")).toBe("moderate");

    const songs = buildYouTubeSearchUrl(
      {
        query: "city pop",
        maxResults: 3,
        category: "music",
        videoEmbeddable: false,
      },
      "key"
    );
    expect(songs.searchParams.get("videoCategoryId")).toBe("10");
    expect(songs.searchParams.has("videoEmbeddable")).toBe(false);
  });

  test("maps search items and skips non-video results", () => {
    expect(
      mapYouTubeSearchItems([
        {
          id: { videoId: "yt_1" },
          snippet: {
            title: "Song",
            channelTitle: "Artist",
            publishedAt: "2024-01-01T00:00:00Z",
            thumbnails: { medium: { url: "medium.jpg" } },
          },
        },
        {
          id: {},
          snippet: {
            title: "Channel",
            channelTitle: "Someone",
            publishedAt: "2024-01-02T00:00:00Z",
          },
        },
        {
          id: { videoId: "yt_2" },
          snippet: {
            title: "Fallback",
            channelTitle: "Fallback Artist",
            publishedAt: "2024-01-03T00:00:00Z",
            thumbnails: { default: { url: "default.jpg" } },
          },
        },
      ])
    ).toEqual([
      {
        videoId: "yt_1",
        title: "Song",
        channelTitle: "Artist",
        publishedAt: "2024-01-01T00:00:00Z",
        thumbnailUrl: "medium.jpg",
      },
      {
        videoId: "yt_2",
        title: "Fallback",
        channelTitle: "Fallback Artist",
        publishedAt: "2024-01-03T00:00:00Z",
        thumbnailUrl: "default.jpg",
      },
    ]);
  });

  test("rolls over to key 2 on the production 429 RESOURCE_EXHAUSTED quota error", async () => {
    const { fetch, attempted } = scriptedFetch({
      primary: () => json(429, PROJECT_QUOTA_429),
    });
    const result = await youtubeSearch(
      { query: "lofi", maxResults: 1 },
      { apiKeys: ["primary", "backup"], fetch }
    );

    expect(attempted).toEqual(["primary", "backup"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.keyLabel).toBe("backup-1");
      expect(result.hits[0]?.videoId).toBe("yt_ok");
      expect(result.failedAttempts).toEqual([
        {
          keyIndex: 0,
          keyLabel: "primary",
          kind: "quota",
          status: 429,
          googleReason: "RATE_LIMIT_EXCEEDED",
        },
      ]);
    }
  });

  test("rolls over to key 3 when keys 1 and 2 hit quotaExceeded / dailyLimitExceeded", async () => {
    const { fetch, attempted } = scriptedFetch({
      "secret-key-1": () => json(403, legacy403("quotaExceeded", "The request cannot be completed because you have exceeded your quota.")),
      "secret-key-2": () => json(403, legacy403("dailyLimitExceeded", "Daily Limit Exceeded.")),
    });
    const failures: unknown[] = [];
    const result = await youtubeSearch(
      { query: "lofi", maxResults: 1 },
      {
        apiKeys: ["secret-key-1", "secret-key-2", "secret-key-3"],
        fetch,
        onKeyFailure: (failure) => failures.push(failure),
      }
    );

    expect(attempted).toEqual(["secret-key-1", "secret-key-2", "secret-key-3"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.keyLabel).toBe("backup-2");
    }
    expect(failures).toHaveLength(2);
    expect(JSON.stringify(failures)).not.toContain("secret-key");
  });

  test("skips a referrer-restricted or invalid key instead of stopping", async () => {
    const { fetch, attempted } = scriptedFetch({
      primary: () => json(429, PROJECT_QUOTA_429),
      backup: () => json(403, REFERRER_BLOCKED_403),
    });
    const result = await youtubeSearch(
      { query: "lofi", maxResults: 1 },
      { apiKeys: ["primary", "backup", "third"], fetch }
    );
    expect(attempted).toEqual(["primary", "backup", "third"]);
    expect(result.ok).toBe(true);

    const invalid = scriptedFetch({
      primary: () => json(400, KEY_INVALID_400),
    });
    const invalidResult = await youtubeSearch(
      { query: "lofi", maxResults: 1 },
      { apiKeys: ["primary", "backup"], fetch: invalid.fetch }
    );
    expect(invalid.attempted).toEqual(["primary", "backup"]);
    expect(invalidResult.ok).toBe(true);
  });

  test("rolls over on network errors", async () => {
    const { fetch, attempted } = scriptedFetch({
      primary: () => {
        throw new TypeError("fetch failed");
      },
    });
    const result = await youtubeSearch(
      { query: "lofi", maxResults: 1 },
      { apiKeys: ["primary", "backup"], fetch }
    );
    expect(attempted).toEqual(["primary", "backup"]);
    expect(result.ok).toBe(true);
  });

  test("does not burn other keys on a request error that no key can fix", async () => {
    const { fetch, attempted } = scriptedFetch({
      primary: () => json(400, BAD_PARAM_400),
    });
    const result = await youtubeSearch(
      { query: "lofi", maxResults: 1 },
      { apiKeys: ["primary", "backup", "third"], fetch }
    );
    expect(attempted).toEqual(["primary"]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("api_error");
    }
  });

  test("reports quota exhaustion only after every key has been tried", async () => {
    const { fetch, attempted } = scriptedFetch({
      primary: () => json(429, PROJECT_QUOTA_429),
      backup: () => json(403, legacy403("quotaExceeded", "quota exceeded")),
      third: () => json(429, PROJECT_QUOTA_429),
    });
    const result = await youtubeSearch(
      { query: "lofi", maxResults: 1 },
      { apiKeys: ["primary", "backup", "third"], fetch }
    );

    expect(attempted).toEqual(["primary", "backup", "third"]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("quota_exhausted");
      expect(result.status).toBe(429);
      expect(result.lastKeyLabel).toBe("backup-2");
      expect(result.failedAttempts.map((a) => a.kind)).toEqual([
        "quota",
        "quota",
        "quota",
      ]);
    }
  });

  test("still reports quota exhaustion when the last key is merely misconfigured", async () => {
    const { fetch } = scriptedFetch({
      primary: () => json(429, PROJECT_QUOTA_429),
      backup: () => json(403, REFERRER_BLOCKED_403),
    });
    const result = await youtubeSearch(
      { query: "lofi", maxResults: 1 },
      { apiKeys: ["primary", "backup"], fetch }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("quota_exhausted");
    }
  });

  test("reports a rejected-key api_error when no key hit quota", async () => {
    const { fetch } = scriptedFetch({
      primary: () => json(403, REFERRER_BLOCKED_403),
      backup: () => json(400, KEY_INVALID_400),
    });
    const result = await youtubeSearch(
      { query: "lofi", maxResults: 1 },
      { apiKeys: ["primary", "backup"], fetch }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("api_error");
    }
  });

  test("maps hits to route and chat result shapes", () => {
    const hit = {
      videoId: "yt_1",
      title: "Song",
      channelTitle: "Artist",
      publishedAt: "2024-01-01T00:00:00Z",
      thumbnailUrl: "thumb.jpg",
    };

    expect(toYoutubeSearchRouteItem(hit)).toEqual({
      videoId: "yt_1",
      title: "Song",
      channelTitle: "Artist",
      publishedAt: "2024-01-01T00:00:00Z",
      thumbnail: "thumb.jpg",
    });
    expect(toSearchSongsResult(hit)).toEqual({
      videoId: "yt_1",
      title: "Song",
      channelTitle: "Artist",
      publishedAt: "2024-01-01T00:00:00Z",
    });
  });
});
