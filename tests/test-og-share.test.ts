import { afterEach, describe, expect, mock, test } from "bun:test";
import {
  createOgShareResponse,
  getSongShareMetadataFromRaw,
  isSocialPreviewCrawler,
  resolveSongShareId,
} from "../api/_utils/og-share";
import { UpdateSongSchema } from "../api/songs/_constants";

const CRAWLER_UA = "Mozilla/5.0 (compatible; Twitterbot/1.0)";
const BROWSER_UA =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }

  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    process.env[key] = value;
  }
});

describe("og share response", () => {
  test("isSocialPreviewCrawler detects link-preview bots", () => {
    expect(isSocialPreviewCrawler(CRAWLER_UA)).toBe(true);
    expect(isSocialPreviewCrawler(BROWSER_UA)).toBe(false);
    expect(isSocialPreviewCrawler(null)).toBe(false);
  });

  test("skips OG HTML for normal browsers (SPA loads directly)", async () => {
    const response = await createOgShareResponse(
      new Request("https://coolify.example.com/standalone/ipod", {
        headers: { "User-Agent": BROWSER_UA },
      })
    );

    expect(response).toBeNull();
  });

  test("uses configured public origin for Coolify/self-host share pages", async () => {
    process.env.APP_PUBLIC_ORIGIN = "https://coolify.example.com";

    const response = await createOgShareResponse(
      new Request("http://127.0.0.1:4010/finder", {
        headers: { "User-Agent": CRAWLER_UA },
      })
    );

    expect(response).not.toBeNull();
    expect(response?.headers.get("content-type")).toContain("text/html");

    const body = await response!.text();
    expect(body).toContain(
      '<meta property="og:url" content="https://coolify.example.com/finder">'
    );
    expect(body).toContain(
      '<meta property="og:image" content="https://coolify.example.com/icons/macosx/mac.png">'
    );
    expect(body).toContain(
      'location.replace("https://coolify.example.com/finder?_ryo=1")'
    );
  });

  test("skips requests that already include the bypass query", async () => {
    const response = await createOgShareResponse(
      new Request("https://coolify.example.com/finder?_ryo=1", {
        headers: { "User-Agent": CRAWLER_UA },
      })
    );

    expect(response).toBeNull();
  });

  test("skips unrelated routes", async () => {
    const response = await createOgShareResponse(
      new Request("https://coolify.example.com/api/health", {
        headers: { "User-Agent": CRAWLER_UA },
      })
    );

    expect(response).toBeNull();
  });

  test("serves OG HTML for standalone iPod routes when requested by crawlers", async () => {
    process.env.APP_PUBLIC_ORIGIN = "https://os.example.com";

    const response = await createOgShareResponse(
      new Request("https://os.example.com/standalone/ipod/track-1", {
        headers: { "User-Agent": CRAWLER_UA },
      }),
      {
        getSong: async (songId) => {
          expect(songId).toBe("track-1");
          return { title: "Test Song", artist: "Test Artist", cover: "" };
        },
      }
    );

    expect(response).not.toBeNull();
    const body = await response!.text();
    expect(body).toContain("Test Song - Test Artist");
    expect(body).toContain("/standalone/ipod/track-1?_ryo=1");
  });

  test("uses stored iPod song metadata and formatted Kugou cover for OG tags", async () => {
    process.env.APP_PUBLIC_ORIGIN = "https://os.example.com";
    const fetchMock = mock(() => {
      throw new Error("YouTube metadata should not be fetched for song OG");
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      const response = await createOgShareResponse(
        new Request("https://os.example.com/ipod/abc123DEF45", {
          headers: { "User-Agent": CRAWLER_UA },
        }),
        {
          getSong: async (songId) => {
            expect(songId).toBe("abc123DEF45");
            return {
              title: "七里香",
              artist: "周杰倫",
              cover: "http://imge.kugou.com/stdmusic/{size}/album.jpg",
            };
          },
        }
      );

      expect(response).not.toBeNull();
      const body = await response!.text();
      expect(body).toContain(
        '<meta property="og:title" content="七里香 - 周杰倫">'
      );
      expect(body).toContain(
        '<meta property="og:image" content="https://imge.kugou.com/stdmusic/400/album.jpg">'
      );
      expect(body).not.toContain("i.ytimg.com");
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("uses decoded Apple Music song ids and artwork templates for Karaoke OG tags", async () => {
    process.env.APP_PUBLIC_ORIGIN = "https://os.example.com";

    const response = await createOgShareResponse(
      new Request("https://os.example.com/karaoke/am%3A1616228595", {
        headers: { "User-Agent": CRAWLER_UA },
      }),
      {
        getSong: async (songId) => {
          expect(songId).toBe("am:1616228595");
          return {
            title: "Bohemian Rhapsody",
            artist: "Queen",
            cover: "https://is1-ssl.mzstatic.com/image/{w}x{h}bb.jpg",
          };
        },
      }
    );

    expect(response).not.toBeNull();
    const body = await response!.text();
    expect(body).toContain(
      '<meta property="og:title" content="Sing Bohemian Rhapsody - Queen on ryOS">'
    );
    expect(body).toContain(
      '<meta property="og:image" content="https://is1-ssl.mzstatic.com/image/400x400bb.jpg">'
    );
    expect(body).not.toContain("i.ytimg.com");
  });

  test("uses the YouTube id from encoded share URL routes for song OG lookups", async () => {
    process.env.APP_PUBLIC_ORIGIN = "https://os.example.com";
    const encodedUrl = encodeURIComponent(
      "https://www.youtube.com/watch?v=abc123DEF45"
    );

    const response = await createOgShareResponse(
      new Request(`https://os.example.com/karaoke/${encodedUrl}`, {
        headers: { "User-Agent": CRAWLER_UA },
      }),
      {
        getSong: async (songId) => {
          expect(songId).toBe("abc123DEF45");
          return {
            title: "Stored Song",
            artist: "Stored Artist",
            cover: "https://example.com/album-art.jpg",
          };
        },
      }
    );

    expect(response).not.toBeNull();
    const body = await response!.text();
    expect(body).toContain(
      '<meta property="og:title" content="Sing Stored Song - Stored Artist on ryOS">'
    );
    expect(body).toContain(
      '<meta property="og:image" content="https://example.com/album-art.jpg">'
    );
  });

  test("normalizes supported song share route IDs", () => {
    expect(resolveSongShareId("abc123DEF45")).toBe("abc123DEF45");
    expect(resolveSongShareId("am%3A1616228595")).toBe("am:1616228595");
    expect(
      resolveSongShareId(
        "https%3A%2F%2Fyoutu.be%2Fabc123DEF45%3Fsi%3Dshare"
      )
    ).toBe("abc123DEF45");
    expect(
      resolveSongShareId(
        "https%3A%2F%2Fmusic.apple.com%2Fus%2Falbum%2Falbum%2F123%3Fi%3D1616228595"
      )
    ).toBe("am:1616228595");
  });

  test("extracts album artwork fields from stored song metadata", () => {
    expect(
      getSongShareMetadataFromRaw({
        title: "Album Track",
        artist: "Album Artist",
        albumArtworkUrl: "https://example.com/album-artwork.jpg",
      })
    ).toEqual({
      title: "Album Track",
      artist: "Album Artist",
      cover: "https://example.com/album-artwork.jpg",
    });

    expect(
      getSongShareMetadataFromRaw(
        JSON.stringify({
          title: "Artwork Track",
          artist: "Artwork Artist",
          artwork: "https://example.com/artwork.jpg",
        })
      )
    ).toEqual({
      title: "Artwork Track",
      artist: "Artwork Artist",
      cover: "https://example.com/artwork.jpg",
    });
  });

  test("song metadata updates accept cover art for share-backed OG pages", () => {
    expect(
      UpdateSongSchema.parse({
        title: "Song",
        cover: "https://example.com/cover.jpg",
      }).cover
    ).toBe("https://example.com/cover.jpg");
  });
});
