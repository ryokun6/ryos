import { describe, expect, test } from "bun:test";
import {
  buildYouTubeSearchUrl,
  getYouTubeApiKeys,
  isYouTubeQuotaError,
  mapYouTubeSearchItems,
  toSearchSongsResult,
  toYoutubeSearchRouteItem,
  youtubeSearch,
} from "../../../api/_utils/youtube-client.js";

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
  });

  test("detects quota errors only on 403 quota-like responses", () => {
    expect(isYouTubeQuotaError(403, "quota exceeded")).toBe(true);
    expect(isYouTubeQuotaError(403, "daily limit reached")).toBe(true);
    expect(isYouTubeQuotaError(403, "forbidden")).toBe(false);
    expect(isYouTubeQuotaError(500, "quota exceeded")).toBe(false);
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

  test("rotates API keys on quota errors", async () => {
    const attemptedUrls: string[] = [];
    const result = await youtubeSearch(
      { query: "lofi", maxResults: 1 },
      {
        apiKeys: ["primary", "backup"],
        fetch: async (input) => {
          attemptedUrls.push(String(input));
          const key = new URL(String(input)).searchParams.get("key");
          if (key === "primary") {
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
                  id: { videoId: "yt_ok" },
                  snippet: {
                    title: "OK",
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

    expect(attemptedUrls).toHaveLength(2);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.keyLabel).toBe("backup-1");
      expect(result.hits[0]?.videoId).toBe("yt_ok");
    }
  });

  test("reports quota exhaustion when every key is exhausted", async () => {
    const result = await youtubeSearch(
      { query: "lofi", maxResults: 1 },
      {
        apiKeys: ["primary"],
        fetch: async () =>
          new Response(
            JSON.stringify({
              error: { code: 403, message: "quota exceeded" },
            }),
            { status: 403, headers: { "Content-Type": "application/json" } }
          ),
      }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("quota_exhausted");
      expect(result.status).toBe(403);
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
