import { afterEach, describe, expect, mock, test } from "bun:test";
import {
  createOgShareResponse,
  getSongShareMetadataFromRaw,
  resolveSongShareId,
} from "../../../api/_utils/og-share";
import { UpdateSongSchema } from "../../../api/songs/_constants";

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
  test("uses configured public origin for Coolify/self-host share pages", async () => {
    process.env.APP_PUBLIC_ORIGIN = "https://coolify.example.com";

    const response = await createOgShareResponse(
      new Request("http://127.0.0.1:4010/finder")
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

  test("serves app icon OG previews for newer app routes", async () => {
    process.env.APP_PUBLIC_ORIGIN = "https://os.example.com";

    const appCases = [
      {
        id: "calendar",
        title: "Calendar on ryOS",
        description: "Calendar with events",
        icon: "calendar.png",
      },
      {
        id: "contacts",
        title: "Contacts on ryOS",
        description: "Address book with vCard import",
        icon: "contacts.png",
      },
      {
        id: "maps",
        title: "Maps on ryOS",
        description: "Find places with Apple Maps",
        icon: "maps.png",
      },
      {
        id: "books",
        title: "Books on ryOS",
        description: "Read EPUB books",
        icon: "books.png",
      },
    ];

    for (const app of appCases) {
      const response = await createOgShareResponse(
        new Request(`https://os.example.com/${app.id}`)
      );

      expect(response).not.toBeNull();
      const body = await response!.text();
      expect(body).toContain(
        `<meta property="og:title" content="${app.title}">`
      );
      expect(body).toContain(
        `<meta property="og:description" content="${app.description}">`
      );
      expect(body).toContain(
        `<meta property="og:image" content="https://os.example.com/icons/macosx/${app.icon}">`
      );
      expect(body).toContain(
        `location.replace("https://os.example.com/${app.id}?_ryo=1")`
      );
    }
  });

  test("skips requests that already include the bypass query", async () => {
    const response = await createOgShareResponse(
      new Request("https://coolify.example.com/finder?_ryo=1")
    );

    expect(response).toBeNull();
  });

  test("skips unrelated routes", async () => {
    const response = await createOgShareResponse(
      new Request("https://coolify.example.com/api/health")
    );

    expect(response).toBeNull();
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
        new Request("https://os.example.com/ipod/abc123DEF45"),
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
      // Rich Redis-backed metadata is stable, so it can be CDN-cached longer.
      expect(response?.headers.get("cache-control")).toBe(
        "no-store, s-maxage=3600"
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("uses decoded Apple Music song ids and artwork templates for Karaoke OG tags", async () => {
    process.env.APP_PUBLIC_ORIGIN = "https://os.example.com";

    const response = await createOgShareResponse(
      new Request("https://os.example.com/karaoke/am%3A1616228595"),
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
      new Request(`https://os.example.com/karaoke/${encodedUrl}`),
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

  test("falls back to YouTube metadata for Karaoke OG when song is not in Redis", async () => {
    process.env.APP_PUBLIC_ORIGIN = "https://os.example.com";
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      const requestUrl = typeof input === "string" ? input : input.toString();
      expect(requestUrl).toContain("youtube.com/oembed");
      expect(requestUrl).toContain("abc123DEF45");
      return new Response(
        JSON.stringify({ title: "Queen - Bohemian Rhapsody (Official Video)" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      const response = await createOgShareResponse(
        new Request("https://os.example.com/karaoke/abc123DEF45"),
        { getSong: async () => null }
      );

      expect(response).not.toBeNull();
      const body = await response!.text();
      expect(body).toContain(
        '<meta property="og:title" content="Sing Bohemian Rhapsody - Queen on ryOS">'
      );
      expect(body).toContain(
        '<meta property="og:image" content="https://i.ytimg.com/vi/abc123DEF45/hqdefault.jpg">'
      );
      expect(body).not.toContain("Sing on ryOS Karaoke");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      // YouTube fallback metadata may be superseded by a Redis save that is
      // still in flight, so the preview must not be pinned for an hour.
      expect(response?.headers.get("cache-control")).toBe(
        "no-store, s-maxage=60"
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("falls back to YouTube metadata for iPod OG when song is not in Redis", async () => {
    process.env.APP_PUBLIC_ORIGIN = "https://os.example.com";
    const fetchMock = mock(async () => {
      return new Response(
        JSON.stringify({ title: "Queen - Bohemian Rhapsody" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      const response = await createOgShareResponse(
        new Request("https://os.example.com/ipod/abc123DEF45"),
        { getSong: async () => null }
      );

      expect(response).not.toBeNull();
      const body = await response!.text();
      expect(body).toContain(
        '<meta property="og:title" content="Bohemian Rhapsody - Queen">'
      );
      expect(body).toContain(
        '<meta property="og:image" content="https://i.ytimg.com/vi/abc123DEF45/hqdefault.jpg">'
      );
      expect(body).not.toContain("Shared Song - ryOS");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("uses generic Karaoke fallback when song is missing and not a YouTube id", async () => {
    process.env.APP_PUBLIC_ORIGIN = "https://os.example.com";
    const fetchMock = mock(() => {
      throw new Error("oEmbed should not be fetched for non-YouTube song ids");
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      const response = await createOgShareResponse(
        new Request("https://os.example.com/karaoke/am%3A1616228595"),
        { getSong: async () => null }
      );

      expect(response).not.toBeNull();
      const body = await response!.text();
      expect(body).toContain(
        '<meta property="og:title" content="Sing on ryOS Karaoke">'
      );
      expect(body).toContain(
        '<meta property="og:image" content="https://os.example.com/icons/macosx/karaoke.png">'
      );
      expect(fetchMock).not.toHaveBeenCalled();
      expect(response?.headers.get("cache-control")).toBe(
        "no-store, s-maxage=60"
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
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
