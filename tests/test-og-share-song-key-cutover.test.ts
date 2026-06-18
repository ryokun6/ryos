import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { redisKeys } from "../src/shared/redisKeys";
import { FakeRedis } from "./fake-redis";

let fake: FakeRedis;

// og-share resolves song metadata through `createRedis()` from this module
// (dynamically imported inside createSongRedisClient). Point it at a fake so we
// exercise the real getSongFromRedis key-reading logic.
mock.module("../api/_utils/redis.js", () => ({
  createRedis: () => fake,
}));

let ogShare: typeof import("../api/_utils/og-share");

const ORIGINAL_ENV = { ...process.env };

beforeEach(async () => {
  fake = new FakeRedis();
  process.env.APP_PUBLIC_ORIGIN = "https://os.example.com";
  ogShare = await import("../api/_utils/og-share");
});

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    process.env[key] = value;
  }
});

describe("og share song-key canonical cutover", () => {
  test("reads song metadata from the canonical media:song key", async () => {
    const songId = "abc123DEF45";
    await fake.set(
      redisKeys.media.songMeta(songId),
      JSON.stringify({
        title: "Canonical Song",
        artist: "Canonical Artist",
        cover: "https://example.com/canonical.jpg",
      })
    );
    // A YouTube oEmbed fetch would indicate the canonical read missed.
    const fetchMock = mock(() => {
      throw new Error("should not fall back to YouTube when canonical exists");
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      const response = await ogShare.createOgShareResponse(
        new Request(`https://os.example.com/ipod/${songId}`)
      );
      const body = await response!.text();
      expect(body).toContain(
        '<meta property="og:title" content="Canonical Song - Canonical Artist">'
      );
      expect(body).toContain(
        '<meta property="og:image" content="https://example.com/canonical.jpg">'
      );
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("falls back to the legacy song:meta key for pre-cutover songs", async () => {
    const songId = "am:1616228595";
    await fake.set(
      `song:meta:${songId}`,
      JSON.stringify({
        title: "Legacy Song",
        artist: "Legacy Artist",
        cover: "https://example.com/legacy.jpg",
      })
    );

    const response = await ogShare.createOgShareResponse(
      new Request("https://os.example.com/karaoke/am%3A1616228595")
    );
    const body = await response!.text();
    expect(body).toContain(
      '<meta property="og:title" content="Sing Legacy Song - Legacy Artist on ryOS">'
    );
    expect(body).toContain(
      '<meta property="og:image" content="https://example.com/legacy.jpg">'
    );
  });
});
