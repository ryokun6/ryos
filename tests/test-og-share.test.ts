import { afterEach, describe, expect, mock, test } from "bun:test";
import {
  createOgShareResponse,
  createOgSongCoverResponse,
} from "../api/_utils/og-share";
import { UpdateSongSchema } from "../api/songs/_constants";

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

  test("uses stored iPod song metadata and ryOS-hosted cover proxy for OG tags", async () => {
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
        '<meta property="og:image" content="https://os.example.com/api/og-song-cover?app=ipod&amp;id=abc123DEF45">'
      );
      expect(body).not.toContain("imge.kugou.com");
      expect(body).not.toContain("i.ytimg.com");
      expect(fetchMock).not.toHaveBeenCalled();
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
      '<meta property="og:image" content="https://os.example.com/api/og-song-cover?app=karaoke&amp;id=am%3A1616228595">'
    );
    expect(body).not.toContain("mzstatic.com");
    expect(body).not.toContain("i.ytimg.com");
  });

  test("falls back to YouTube metadata when no song metadata exists", async () => {
    process.env.APP_PUBLIC_ORIGIN = "https://os.example.com";
    const originalFetch = globalThis.fetch;
    const fetchMock = mock(async () => {
      return new Response(
        JSON.stringify({ title: "Rick Astley - Never Gonna Give You Up" }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      const response = await createOgShareResponse(
        new Request("https://os.example.com/ipod/dQw4w9WgXcQ"),
        { getSong: async () => null }
      );

      expect(response).not.toBeNull();
      const body = await response!.text();
      expect(body).toContain(
        '<meta property="og:title" content="Never Gonna Give You Up - Rick Astley">'
      );
      expect(body).toContain(
        '<meta property="og:image" content="https://os.example.com/api/og-song-cover?app=ipod&amp;id=dQw4w9WgXcQ">'
      );
      expect(body).not.toContain("Shared Song - ryOS");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("keeps YouTube thumbnail proxy when iPod oEmbed metadata is unavailable", async () => {
    process.env.APP_PUBLIC_ORIGIN = "https://os.example.com";
    const originalFetch = globalThis.fetch;
    const fetchMock = mock(async () => {
      return new Response("unavailable", { status: 500 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      const response = await createOgShareResponse(
        new Request("https://os.example.com/ipod/dQw4w9WgXcQ"),
        { getSong: async () => null }
      );

      expect(response).not.toBeNull();
      const body = await response!.text();
      expect(body).toContain(
        '<meta property="og:image" content="https://os.example.com/api/og-song-cover?app=ipod&amp;id=dQw4w9WgXcQ">'
      );
      expect(body).not.toContain("/icons/macosx/ipod.png");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("song cover proxy serves formatted Kugou artwork through ryOS", async () => {
    const fetchImage = mock(async (url: string) => {
      expect(url).toBe("https://imge.kugou.com/stdmusic/600/album.jpg");
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: {
          "content-type": "image/jpeg",
          "content-length": "3",
        },
      });
    });

    const response = await createOgSongCoverResponse(
      new Request(
        "https://os.example.com/api/og-song-cover?app=ipod&id=abc123DEF45"
      ),
      {
        getSong: async () => ({
          title: "七里香",
          artist: "周杰倫",
          cover: "http://imge.kugou.com/stdmusic/{size}/album.jpg",
        }),
        fetchImage,
      }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3])
    );
    expect(fetchImage).toHaveBeenCalledTimes(1);
  });

  test("song cover proxy falls back to YouTube thumbnail for uncached YouTube songs", async () => {
    const fetchImage = mock(async (url: string) => {
      expect(url).toBe("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
      return new Response(new Uint8Array([4, 5]), {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      });
    });

    const response = await createOgSongCoverResponse(
      new Request(
        "https://os.example.com/api/og-song-cover?app=karaoke&id=dQw4w9WgXcQ"
      ),
      { getSong: async () => null, fetchImage }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(fetchImage).toHaveBeenCalledTimes(1);
  });

  test("song cover proxy falls back to YouTube thumbnail when stored cover fails", async () => {
    const attempts: string[] = [];
    const fetchImage = mock(async (url: string) => {
      attempts.push(url);
      if (url.includes("kugou.com")) {
        return new Response("missing", { status: 404 });
      }
      return new Response(new Uint8Array([6, 7]), {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      });
    });

    const response = await createOgSongCoverResponse(
      new Request(
        "https://os.example.com/api/og-song-cover?app=ipod&id=dQw4w9WgXcQ"
      ),
      {
        getSong: async () => ({
          title: "Never Gonna Give You Up",
          artist: "Rick Astley",
          cover: "https://imge.kugou.com/stdmusic/{size}/missing.jpg",
        }),
        fetchImage,
      }
    );

    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([6, 7])
    );
    expect(attempts).toEqual([
      "https://imge.kugou.com/stdmusic/600/missing.jpg",
      "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    ]);
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
