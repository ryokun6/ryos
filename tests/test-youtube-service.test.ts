import { describe, expect, test } from "bun:test";

import {
  getYouTubeApiKeys,
  searchYouTubeVideos,
  YouTubeApiError,
} from "../api/_utils/youtube-service";

describe("youtube-service", () => {
  test("collects configured API keys in primary/backup order", () => {
    expect(
      getYouTubeApiKeys({
        YOUTUBE_API_KEY: "primary",
        YOUTUBE_API_KEY_2: "backup",
      })
    ).toEqual(["primary", "backup"]);
  });

  test("maps YouTube search items into normalized video results", async () => {
    const urls: string[] = [];
    const fetchImpl = async (url: string) => {
      urls.push(url);
      return new Response(
        JSON.stringify({
          items: [
            {
              id: { videoId: "abc12345678" },
              snippet: {
                title: "Title",
                channelTitle: "Channel",
                thumbnails: { medium: { url: "thumb.jpg" } },
                publishedAt: "2026-01-01T00:00:00Z",
              },
            },
          ],
        }),
        { status: 200 }
      );
    };

    const { results, keyLabel } = await searchYouTubeVideos({
      query: "lofi",
      maxResults: 3,
      apiKeys: ["key"],
      musicOnly: true,
      safeSearch: "moderate",
      fetchImpl,
    });

    expect(keyLabel).toBe("primary");
    expect(results).toEqual([
      {
        videoId: "abc12345678",
        title: "Title",
        channelTitle: "Channel",
        thumbnail: "thumb.jpg",
        publishedAt: "2026-01-01T00:00:00Z",
      },
    ]);
    const searchUrl = new URL(urls[0]);
    expect(searchUrl.searchParams.get("videoCategoryId")).toBe("10");
    expect(searchUrl.searchParams.get("safeSearch")).toBe("moderate");
  });

  test("rotates to the backup key on quota errors", async () => {
    const keys: string[] = [];
    const fetchImpl = async (url: string) => {
      keys.push(new URL(url).searchParams.get("key") || "");
      if (keys.length === 1) {
        return new Response(
          JSON.stringify({ error: { code: 403, message: "quota exceeded" } }),
          { status: 403 }
        );
      }

      return new Response(JSON.stringify({ items: [] }), { status: 200 });
    };

    const { keyLabel, results } = await searchYouTubeVideos({
      query: "city pop",
      maxResults: 2,
      apiKeys: ["primary", "backup"],
      fetchImpl,
    });

    expect(keys).toEqual(["primary", "backup"]);
    expect(keyLabel).toBe("backup-1");
    expect(results).toEqual([]);
  });

  test("throws structured errors for non-quota provider failures", async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({ error: { code: 400, message: "bad request" } }),
        { status: 400 }
      );

    await expect(
      searchYouTubeVideos({
        query: "bad",
        maxResults: 1,
        apiKeys: ["key"],
        fetchImpl,
      })
    ).rejects.toMatchObject({
      name: "YouTubeApiError",
      status: 400,
      code: 400,
      message: "bad request",
    } satisfies Partial<YouTubeApiError>);
  });
});
