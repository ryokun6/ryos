/**
 * Tests for /api/songs endpoints (unified song API)
 * Tests: GET song, fetch-lyrics, translate, furigana, search-lyrics,
 * clear-cached-data auth
 */

import { describe, test, expect } from "bun:test";
import {
  BASE_URL,
  ensureUserAuth,
  fetchWithAuth,
  fetchWithOrigin,
  makeRateLimitBypassHeaders,
  uniqueTestUsername,
} from "../../helpers/test-utils";

// Test song ID (a known YouTube video)
const TEST_SONG_ID = "dQw4w9WgXcQ"; // Rick Astley - Never Gonna Give You Up
const TEST_SONG_TITLE = "Never Gonna Give You Up";
const TEST_SONG_ARTIST = "Rick Astley";

// Cached search result (populated by first search test)
let cachedLyricsSource: {
  hash: string;
  albumId: string | number;
  title: string;
  artist: string;
  album?: string;
} | null = null;

describe("GET /api/songs/{id}", () => {
  test("GET non-existent song returns 404", async () => {
    const res = await fetchWithOrigin(`${BASE_URL}/api/songs/nonexistent123xyz`);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBeTruthy();
  });

  test("OPTIONS request (CORS preflight)", async () => {
    const res = await fetchWithOrigin(`${BASE_URL}/api/songs/${TEST_SONG_ID}`, {
      method: "OPTIONS",
    });
    expect(res.status === 200 || res.status === 204).toBe(true);
  });

  test("GET without ID (index)", async () => {
    const res = await fetchWithOrigin(`${BASE_URL}/api/songs`);
    expect(res.status === 200 || res.status === 405).toBe(true);
  });

  test("GET list succeeds with stale auth cookie (anonymous)", async () => {
    const res = await fetchWithOrigin(`${BASE_URL}/api/songs?include=version`, {
      headers: {
        Cookie: "ryos_auth=staleuser%3Anot-a-valid-session-token",
      },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(typeof data.version).toBe("number");
  });

  test("GET metadata ignores partial stale auth (anonymous)", async () => {
    const res = await fetchWithOrigin(
      `${BASE_URL}/api/songs/${TEST_SONG_ID}?include=metadata`,
      {
        headers: {
          Authorization: "Bearer stale-session-token",
        },
      }
    );
    expect(res.status).not.toBe(400);
    expect(res.status).not.toBe(401);
    expect([200, 404]).toContain(res.status);
  });
});

describe("POST /api/songs/{id} action: search-lyrics", () => {
  test("Missing query", async () => {
    const res = await fetchWithOrigin(`${BASE_URL}/api/songs/nonexistent_empty_song`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "search-lyrics",
      }),
    });
    expect(res.status).toBe(400);
  });

  test("Basic search", async () => {
    const res = await fetchWithOrigin(`${BASE_URL}/api/songs/${TEST_SONG_ID}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "search-lyrics",
        query: `${TEST_SONG_TITLE} ${TEST_SONG_ARTIST}`,
      }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.results)).toBe(true);
  });

  test("Result structure", async () => {
    const res = await fetchWithOrigin(`${BASE_URL}/api/songs/${TEST_SONG_ID}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "search-lyrics",
        query: "Bohemian Rhapsody Queen",
      }),
    });
    if (res.status === 200) {
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        const result = data.results[0];
        expect("title" in result).toBe(true);
        expect("artist" in result).toBe(true);
        expect("hash" in result || "albumId" in result).toBe(true);
      }
    }
  });
});

describe("POST /api/songs/{id} action: fetch-lyrics", () => {
  test("Invalid JSON body", async () => {
    const res = await fetchWithOrigin(`${BASE_URL}/api/songs/${TEST_SONG_ID}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "invalid json",
    });
    expect(res.status).toBe(400);
  });

  test("Anonymous lyrics validation ignores partial stale auth", async () => {
    const res = await fetchWithOrigin(`${BASE_URL}/api/songs/${TEST_SONG_ID}`, {
      method: "POST",
      headers: {
        Authorization: "Bearer stale-session-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "fetch-lyrics",
        force: "not-a-boolean",
      }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid request body");
  });

  test("Missing lyricsSource (non-existent song)", async () => {
    const res = await fetchWithOrigin(`${BASE_URL}/api/songs/nonexistent_no_source`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "fetch-lyrics",
      }),
    });
    expect(res.status).toBe(400);
  });

  test("Fetch lyrics with searched source", async () => {
    // First, search for lyrics to get a valid hash/albumId
    const searchRes = await fetchWithOrigin(`${BASE_URL}/api/songs/${TEST_SONG_ID}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "search-lyrics",
        query: `${TEST_SONG_TITLE} ${TEST_SONG_ARTIST}`,
      }),
    });
    expect(searchRes.status).toBe(200);
    const searchData = await searchRes.json();
    expect(searchData.results?.length).toBeGreaterThan(0);

    // Cache the source for later tests
    cachedLyricsSource = searchData.results[0];

    const res = await fetchWithOrigin(`${BASE_URL}/api/songs/${TEST_SONG_ID}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "fetch-lyrics",
        lyricsSource: cachedLyricsSource,
      }),
    });
    expect(res.status === 200 || res.status === 404).toBe(true);
    if (res.status === 200) {
      const data = await res.json();
      expect(data.lyrics).toBeTruthy();
      expect(data.lyrics.lrc || data.lyrics.krc).toBeTruthy();
    }
  });

  test("Response structure", async () => {
    if (!cachedLyricsSource) {
      const res = await fetchWithOrigin(`${BASE_URL}/api/songs/${TEST_SONG_ID}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "fetch-lyrics",
        }),
      });
      if (res.status === 200) {
        const data = await res.json();
        expect("lyrics" in data).toBe(true);
        if (data.lyrics) {
          expect("lrc" in data.lyrics || "krc" in data.lyrics).toBe(true);
        }
      }
      return;
    }

    const res = await fetchWithOrigin(`${BASE_URL}/api/songs/${TEST_SONG_ID}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "fetch-lyrics",
        lyricsSource: cachedLyricsSource,
      }),
    });
    if (res.status === 200) {
      const data = await res.json();
      expect("lyrics" in data).toBe(true);
      if (data.lyrics) {
        expect("lrc" in data.lyrics || "krc" in data.lyrics).toBe(true);
      }
    }
  });

  test("Cache hit", async () => {
    if (!cachedLyricsSource) return;

    const res1 = await fetchWithOrigin(`${BASE_URL}/api/songs/${TEST_SONG_ID}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "fetch-lyrics",
        lyricsSource: cachedLyricsSource,
      }),
    });

    if (res1.status === 200) {
      const res2 = await fetchWithOrigin(`${BASE_URL}/api/songs/${TEST_SONG_ID}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "fetch-lyrics",
          lyricsSource: cachedLyricsSource,
        }),
      });
      expect(res2.status).toBe(200);
      const data = await res2.json();
      expect(data.cached).toBe(true);
    }
  });

  test("Force refresh", async () => {
    if (!cachedLyricsSource) return;

    const res = await fetchWithOrigin(`${BASE_URL}/api/songs/${TEST_SONG_ID}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "fetch-lyrics",
        lyricsSource: cachedLyricsSource,
        force: true,
      }),
    });
    expect(res.status === 200 || res.status === 404).toBe(true);
    if (res.status === 200) {
      const cacheHeader = res.headers.get("X-Lyrics-Cache");
      expect(cacheHeader).not.toBe("HIT");
    }
  });
});

describe("POST /api/songs/{id} action: translate", () => {
  test("Missing language", async () => {
    const res = await fetchWithOrigin(`${BASE_URL}/api/songs/${TEST_SONG_ID}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "translate",
      }),
    });
    expect(res.status).toBe(400);
  });

  test("Translate non-existent song", async () => {
    const res = await fetchWithOrigin(`${BASE_URL}/api/songs/nonexistentsong123`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "translate",
        language: "Spanish",
      }),
    });
    expect(res.status === 400 || res.status === 404).toBe(true);
  });

  test("Basic translation", async () => {
    if (!cachedLyricsSource) {
      const res = await fetchWithOrigin(`${BASE_URL}/api/songs/${TEST_SONG_ID}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "translate",
          language: "Spanish",
        }),
      });
      expect([200, 401, 404]).toContain(res.status);
      return;
    }

    await fetchWithOrigin(`${BASE_URL}/api/songs/${TEST_SONG_ID}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "fetch-lyrics",
        lyricsSource: cachedLyricsSource,
      }),
    });

    const res = await fetchWithOrigin(`${BASE_URL}/api/songs/${TEST_SONG_ID}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "translate",
        language: "Spanish",
      }),
    });
    // 401 = not cached yet and anonymous callers cannot trigger generation.
    expect([200, 401, 404]).toContain(res.status);
    if (res.status === 200) {
      const data = await res.json();
      expect(data.translation).toBeTruthy();
      const hasTimestamps = /\[\d{2}:\d{2}\.\d{2}\]/.test(data.translation);
      expect(hasTimestamps).toBe(true);
    }
  }, 30_000);

  test("Translation cache hit", async () => {
    const res1 = await fetchWithOrigin(`${BASE_URL}/api/songs/${TEST_SONG_ID}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "translate",
        language: "French",
      }),
    });

    if (res1.status === 200) {
      const res2 = await fetchWithOrigin(`${BASE_URL}/api/songs/${TEST_SONG_ID}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "translate",
          language: "French",
        }),
      });
      expect(res2.status).toBe(200);
      const data = await res2.json();
      expect(data.cached).toBe(true);
    }
  }, 30_000);
});

describe("POST /api/songs/{id} AI generation gate", () => {
  // A language code that is never cached, so every call is a cache miss.
  const uncachedLanguage = `x-${Math.random().toString(36).slice(2, 7)}`;

  const ensureLyrics = async () => {
    if (!cachedLyricsSource) return false;
    const res = await fetchWithOrigin(`${BASE_URL}/api/songs/${TEST_SONG_ID}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "fetch-lyrics",
        lyricsSource: cachedLyricsSource,
      }),
    });
    return res.status === 200;
  };

  for (const action of ["translate", "translate-stream"] as const) {
    test(`anonymous ${action} cache miss requires sign-in`, async () => {
      if (!(await ensureLyrics())) return;
      const res = await fetchWithOrigin(`${BASE_URL}/api/songs/${TEST_SONG_ID}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...makeRateLimitBypassHeaders(),
        },
        body: JSON.stringify({ action, language: uncachedLanguage }),
      });
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.code).toBe("lyrics_generation_requires_auth");
    }, 30_000);
  }

  test("anonymous soramimi-stream cache miss requires sign-in", async () => {
    if (!(await ensureLyrics())) return;
    const res = await fetchWithOrigin(`${BASE_URL}/api/songs/${TEST_SONG_ID}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...makeRateLimitBypassHeaders(),
      },
      body: JSON.stringify({ action: "soramimi-stream", targetLanguage: "en" }),
    });
    // Cached English soramimi is still served (200 SSE); a miss is gated.
    if (res.status === 200) {
      expect(res.headers.get("content-type")).toContain("text/event-stream");
      expect(await res.text()).toContain('"type":"cached"');
      return;
    }
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.code).toBe("lyrics_generation_requires_auth");
  }, 30_000);

  test("anonymous generation past the free song allowance requires sign-in", async () => {
    const { createRedis } = await import("../../../api/_utils/redis");
    const {
      anonKaraokeGenerationKey,
      claimAnonymousKaraokeSong,
    } = await import("../../../api/songs/_anon-generation");
    const redis = createRedis();
    const clientId = "quotatestclient01";
    const key = anonKaraokeGenerationKey(clientId);
    try {
      await redis.del(key);
      for (const id of ["quotaSongA01", "quotaSongB02", "quotaSongC03"]) {
        expect(await claimAnonymousKaraokeSong(redis, clientId, id)).toBe(true);
      }
      if (!cachedLyricsSource) {
        const searchRes = await fetchWithOrigin(`${BASE_URL}/api/songs/${TEST_SONG_ID}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "search-lyrics",
            query: `${TEST_SONG_TITLE} ${TEST_SONG_ARTIST}`,
          }),
        });
        if (searchRes.status === 200) {
          const searchData = await searchRes.json();
          cachedLyricsSource = searchData.results?.[0] ?? null;
        }
      }
      if (!(await ensureLyrics())) return;
      const res = await fetchWithOrigin(`${BASE_URL}/api/songs/${TEST_SONG_ID}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...makeRateLimitBypassHeaders(),
        },
        body: JSON.stringify({
          action: "translate-stream",
          language: uncachedLanguage,
          anonClientId: clientId,
        }),
      });
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.code).toBe("lyrics_generation_requires_auth");
    } finally {
      await redis.del(key);
    }
  }, 30_000);
});

describe("POST /api/songs/{id} action: furigana", () => {
  test("Furigana non-existent song", async () => {
    const res = await fetchWithOrigin(`${BASE_URL}/api/songs/nonexistentsong456`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "furigana",
      }),
    });
    expect(res.status === 400 || res.status === 404).toBe(true);
  });

  test("Furigana response structure", async () => {
    const japaneseSongId = "test_japanese_song";

    await fetchWithOrigin(`${BASE_URL}/api/songs/${japaneseSongId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "fetch-lyrics",
        lyricsSource: {
          title: "残酷な天使のテーゼ",
          artist: "高橋洋子",
        },
      }),
    });

    const res = await fetchWithOrigin(`${BASE_URL}/api/songs/${japaneseSongId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "furigana",
      }),
    });

    if (res.status === 200) {
      const data = await res.json();
      expect(Array.isArray(data.furigana)).toBe(true);
      if (data.furigana.length > 0) {
        expect(Array.isArray(data.furigana[0])).toBe(true);
      }
    }
  });
});

describe("POST /api/songs/{id} action: clear-cached-data", () => {
  const password = "TestPassword123!";

  /** Fresh YouTube-format 11-char id so catalog leftovers cannot collide. */
  const freshSongId = (prefix: string) => {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
    let id = prefix.slice(0, 3);
    while (id.length < 11) {
      id += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return id;
  };

  test("anonymous clear-cached-data returns 401", async () => {
    const res = await fetchWithOrigin(`${BASE_URL}/api/songs/${TEST_SONG_ID}`, {
      method: "POST",
      headers: makeRateLimitBypassHeaders(),
      body: JSON.stringify({
        action: "clear-cached-data",
        clearTranslations: true,
      }),
    });
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(String(data.error)).toMatch(/authentication required/i);
  });

  test("owner can clear cached data", async () => {
    const owner = uniqueTestUsername("h12own");
    const token = await ensureUserAuth(owner, password);
    expect(token).toBeTruthy();
    if (!token) return;

    const ownedSongId = freshSongId("h12");
    const createRes = await fetchWithAuth(
      `${BASE_URL}/api/songs`,
      owner,
      token,
      {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({
          id: ownedSongId,
          title: "H12 Clear Cache Owner Song",
          artist: "H12 Tests",
        }),
      }
    );
    expect(createRes.status).toBe(200);
    const created = await createRes.json();
    expect(created.success).toBe(true);
    expect(created.skipped).toBeFalsy();
    expect(String(created.createdBy).toLowerCase()).toBe(owner.toLowerCase());

    const clearRes = await fetchWithAuth(
      `${BASE_URL}/api/songs/${ownedSongId}`,
      owner,
      token,
      {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({
          action: "clear-cached-data",
          clearTranslations: true,
          clearFurigana: true,
          clearSoramimi: true,
          clearCoverColor: true,
        }),
      }
    );
    expect(clearRes.status).toBe(200);
    const cleared = await clearRes.json();
    expect(cleared.success).toBe(true);
    expect(Array.isArray(cleared.cleared)).toBe(true);
  });

  test("non-owner clear-cached-data returns 403", async () => {
    const owner = uniqueTestUsername("h12ownb");
    const other = uniqueTestUsername("h12oth");
    const ownerToken = await ensureUserAuth(owner, password);
    const otherToken = await ensureUserAuth(other, password);
    expect(ownerToken).toBeTruthy();
    expect(otherToken).toBeTruthy();
    if (!ownerToken || !otherToken) return;

    const otherOwnedId = freshSongId("h12");
    const createRes = await fetchWithAuth(
      `${BASE_URL}/api/songs`,
      owner,
      ownerToken,
      {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({
          id: otherOwnedId,
          title: "H12 Clear Cache Forbidden Song",
          artist: "H12 Tests",
        }),
      }
    );
    expect(createRes.status).toBe(200);
    const created = await createRes.json();
    expect(created.success).toBe(true);
    expect(created.skipped).toBeFalsy();
    expect(String(created.createdBy).toLowerCase()).toBe(owner.toLowerCase());

    const clearRes = await fetchWithAuth(
      `${BASE_URL}/api/songs/${otherOwnedId}`,
      other,
      otherToken,
      {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({
          action: "clear-cached-data",
          clearTranslations: true,
        }),
      }
    );
    expect(clearRes.status).toBe(403);
    const data = await clearRes.json();
    expect(data.error).toBeTruthy();
  });
});

describe("POST /api/songs (index)", () => {
  test("GET method returns songs list", async () => {
    const res = await fetchWithOrigin(`${BASE_URL}/api/songs`, {
      method: "GET",
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.songs)).toBe(true);
  });

  test("POST requires authentication", async () => {
    const res = await fetchWithOrigin(`${BASE_URL}/api/songs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "test_auth",
        title: "Test Song",
      }),
    });
    expect(res.status).toBe(401);
  });

  test("Invalid body returns auth error", async () => {
    const res = await fetchWithOrigin(`${BASE_URL}/api/songs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "invalid json",
    });
    expect(res.status).toBe(401);
  });
});

describe("GET /api/songs/{id} (existing songs)", () => {
  test("Get song with lyrics", async () => {
    if (!cachedLyricsSource) return;

    const res = await fetchWithOrigin(`${BASE_URL}/api/songs/${TEST_SONG_ID}`);
    if (res.status === 200) {
      const data = await res.json();
      expect("id" in data).toBe(true);
      expect(data.id).toBe(TEST_SONG_ID);
    }
  });

  test("Response structure", async () => {
    const indexRes = await fetchWithOrigin(`${BASE_URL}/api/songs`);
    if (indexRes.status !== 200) return;

    const indexData = await indexRes.json();
    if (!indexData.songs || indexData.songs.length === 0) return;

    const existingSong = indexData.songs[0];
    const res = await fetchWithOrigin(`${BASE_URL}/api/songs/${existingSong.id}`);
    if (res.status === 200) {
      const data = await res.json();
      expect("id" in data).toBe(true);
      expect("title" in data).toBe(true);
    }
  });
});
