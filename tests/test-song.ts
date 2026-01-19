#!/usr/bin/env bun
/**
 * Tests for /api/songs endpoints (unified song API)
 * Tests: GET song, fetch-lyrics, translate, furigana, search-lyrics
 */

import {
  BASE_URL,
  runTest,
  assert,
  assertEq,
  printSummary,
  clearResults,
  fetchWithOrigin,
  section,
} from "./test-utils";

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

// ============================================================================
// GET /api/songs/{id} Tests
// ============================================================================

async function testGetNonexistentSong(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/songs/nonexistent123xyz`);
  assertEq(res.status, 404, `Expected 404 for non-existent song, got ${res.status}`);
  const data = await res.json();
  assert(data.error, "Expected error in response");
}

async function testGetOptionsRequest(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/songs/${TEST_SONG_ID}`, {
    method: "OPTIONS",
  });
  assert(res.status === 200 || res.status === 204, `Expected 200 or 204, got ${res.status}`);
}

async function testGetMissingId(): Promise<void> {
  // The index endpoint should handle this
  const res = await fetchWithOrigin(`${BASE_URL}/api/songs`);
  // This could return 405 (method not allowed for GET on index) or list songs
  assert(res.status === 200 || res.status === 405, `Expected 200 or 405, got ${res.status}`);
}

// ============================================================================
// POST /api/songs/{id} action: fetch-lyrics Tests
// ============================================================================

async function testFetchLyricsInvalidBody(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/songs/${TEST_SONG_ID}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "invalid json",
  });
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
}

async function testFetchLyricsMissingSource(): Promise<void> {
  // When song doesn't exist and no lyricsSource provided, should return 400
  const res = await fetchWithOrigin(`${BASE_URL}/api/songs/nonexistent_no_source`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "fetch-lyrics",
      // Missing lyricsSource - should fail because song doesn't exist
    }),
  });
  assertEq(res.status, 400, `Expected 400 for missing lyricsSource on non-existent song, got ${res.status}`);
}

async function testFetchLyricsWithSearchedSource(): Promise<void> {
  // First, search for lyrics to get a valid hash/albumId
  const searchRes = await fetchWithOrigin(`${BASE_URL}/api/songs/${TEST_SONG_ID}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "search-lyrics",
      query: `${TEST_SONG_TITLE} ${TEST_SONG_ARTIST}`,
    }),
  });
  assertEq(searchRes.status, 200, `Search failed with ${searchRes.status}`);
  const searchData = await searchRes.json();
  assert(searchData.results?.length > 0, "Expected search results");
  
  // Cache the source for later tests
  cachedLyricsSource = searchData.results[0];
  
  // Now fetch lyrics using the search result
  const res = await fetchWithOrigin(`${BASE_URL}/api/songs/${TEST_SONG_ID}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "fetch-lyrics",
      lyricsSource: cachedLyricsSource,
    }),
  });
  assert(res.status === 200 || res.status === 404, `Expected 200 or 404, got ${res.status}`);
  if (res.status === 200) {
    const data = await res.json();
    assert(data.lyrics, "Expected lyrics in response");
    assert(data.lyrics.lrc || data.lyrics.krc, "Expected LRC or KRC lyrics");
  }
}

async function testFetchLyricsResponseStructure(): Promise<void> {
  // Use cached source if available, otherwise skip
  if (!cachedLyricsSource) {
    // Try to fetch without source (will auto-search if song has title/artist)
    const res = await fetchWithOrigin(`${BASE_URL}/api/songs/${TEST_SONG_ID}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "fetch-lyrics",
      }),
    });
    if (res.status === 200) {
      const data = await res.json();
      assert("lyrics" in data, "Response should have lyrics object");
      if (data.lyrics) {
        assert("lrc" in data.lyrics || "krc" in data.lyrics, "lyrics should have lrc or krc");
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
    assert("lyrics" in data, "Response should have lyrics object");
    if (data.lyrics) {
      assert("lrc" in data.lyrics || "krc" in data.lyrics, "lyrics should have lrc or krc");
    }
  }
}

async function testFetchLyricsCacheHit(): Promise<void> {
  if (!cachedLyricsSource) return; // Skip if no source available
  
  // First request
  const res1 = await fetchWithOrigin(`${BASE_URL}/api/songs/${TEST_SONG_ID}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "fetch-lyrics",
      lyricsSource: cachedLyricsSource,
    }),
  });

  if (res1.status === 200) {
    // Second request should hit cache (check via 'cached' field in response)
    const res2 = await fetchWithOrigin(`${BASE_URL}/api/songs/${TEST_SONG_ID}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "fetch-lyrics",
        lyricsSource: cachedLyricsSource,
      }),
    });
    assertEq(res2.status, 200, `Expected 200, got ${res2.status}`);
    const data = await res2.json();
    // New API uses 'cached' field in response body instead of header
    assertEq(data.cached, true, "Expected cached=true for second request");
  }
}

async function testFetchLyricsForceRefresh(): Promise<void> {
  if (!cachedLyricsSource) return; // Skip if no source available
  
  const res = await fetchWithOrigin(`${BASE_URL}/api/songs/${TEST_SONG_ID}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "fetch-lyrics",
      lyricsSource: cachedLyricsSource,
      force: true,
    }),
  });
  assert(res.status === 200 || res.status === 404, `Expected 200 or 404, got ${res.status}`);
  if (res.status === 200) {
    const cacheHeader = res.headers.get("X-Lyrics-Cache");
    assert(cacheHeader !== "HIT", "Expected cache to be bypassed");
  }
}

// ============================================================================
// POST /api/songs/{id} action: search-lyrics Tests
// ============================================================================

async function testSearchLyricsMissingQuery(): Promise<void> {
  // When no query is provided but song exists with title/artist, API auto-generates query
  // Test with a non-existent song that has no metadata
  const res = await fetchWithOrigin(`${BASE_URL}/api/songs/nonexistent_empty_song`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "search-lyrics",
      // Missing query - and song doesn't exist, so no auto-search
    }),
  });
  assertEq(res.status, 400, `Expected 400 for missing query on non-existent song, got ${res.status}`);
}

async function testSearchLyricsBasic(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/songs/${TEST_SONG_ID}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "search-lyrics",
      query: `${TEST_SONG_TITLE} ${TEST_SONG_ARTIST}`,
    }),
  });
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(Array.isArray(data.results), "Expected results array");
}

async function testSearchLyricsResultStructure(): Promise<void> {
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
      assert("title" in result, "Result should have title");
      assert("artist" in result, "Result should have artist");
      assert("hash" in result || "albumId" in result, "Result should have hash or albumId");
    }
  }
}

// ============================================================================
// POST /api/songs/{id} action: translate Tests
// ============================================================================

async function testTranslateMissingLanguage(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/songs/${TEST_SONG_ID}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "translate",
      // Missing language
    }),
  });
  assertEq(res.status, 400, `Expected 400 for missing language, got ${res.status}`);
}

async function testTranslateNoLyrics(): Promise<void> {
  // Test with a song that has no lyrics stored
  const res = await fetchWithOrigin(`${BASE_URL}/api/songs/nonexistentsong123`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "translate",
      language: "Spanish",
    }),
  });
  // Should return 404 (song not found) or 400 (no lyrics)
  assert(res.status === 400 || res.status === 404, `Expected 400 or 404, got ${res.status}`);
}

async function testTranslateBasic(): Promise<void> {
  // Skip if no cached source (lyrics weren't fetched)
  if (!cachedLyricsSource) {
    // Try to translate without prior lyrics fetch - expect 404
    const res = await fetchWithOrigin(`${BASE_URL}/api/songs/${TEST_SONG_ID}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "translate",
        language: "Spanish",
      }),
    });
    // Without lyrics, should return 404
    assert(res.status === 200 || res.status === 404, `Expected 200 or 404, got ${res.status}`);
    return;
  }

  // Ensure lyrics are fetched first
  await fetchWithOrigin(`${BASE_URL}/api/songs/${TEST_SONG_ID}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "fetch-lyrics",
      lyricsSource: cachedLyricsSource,
    }),
  });

  // Now request translation
  const res = await fetchWithOrigin(`${BASE_URL}/api/songs/${TEST_SONG_ID}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "translate",
      language: "Spanish",
    }),
  });
  // May return 200 (translated) or 404 (no lyrics found)
  assert(res.status === 200 || res.status === 404, `Expected 200 or 404, got ${res.status}`);
  if (res.status === 200) {
    const data = await res.json();
    // API returns 'translation' field (not 'translatedLrc')
    assert(data.translation, "Expected translation in response");
    // Check LRC format
    const hasTimestamps = /\[\d{2}:\d{2}\.\d{2}\]/.test(data.translation);
    assert(hasTimestamps, "Translation should be in LRC format");
  }
}

async function testTranslateCacheHit(): Promise<void> {
  // First request
  const res1 = await fetchWithOrigin(`${BASE_URL}/api/songs/${TEST_SONG_ID}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "translate",
      language: "French",
    }),
  });

  if (res1.status === 200) {
    // Second request should hit cache (check via 'cached' field in response)
    const res2 = await fetchWithOrigin(`${BASE_URL}/api/songs/${TEST_SONG_ID}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "translate",
        language: "French",
      }),
    });
    assertEq(res2.status, 200, `Expected 200, got ${res2.status}`);
    const data = await res2.json();
    // New API uses 'cached' field in response body instead of header
    assertEq(data.cached, true, "Expected cached=true for second request");
  }
}

// ============================================================================
// POST /api/songs/{id} action: furigana Tests
// ============================================================================

async function testFuriganaNoLyrics(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/songs/nonexistentsong456`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "furigana",
    }),
  });
  // Should return 404 (song not found) or 400 (no lyrics)
  assert(res.status === 400 || res.status === 404, `Expected 400 or 404, got ${res.status}`);
}

async function testFuriganaResponseStructure(): Promise<void> {
  // Need a Japanese song for this test
  const japaneseSongId = "test_japanese_song";
  
  // First, try to fetch lyrics for a Japanese song
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
  
  // May succeed or fail depending on whether lyrics exist
  if (res.status === 200) {
    const data = await res.json();
    assert(Array.isArray(data.furigana), "Expected furigana array");
    if (data.furigana.length > 0) {
      // Each line should be an array of segments
      assert(Array.isArray(data.furigana[0]), "Each furigana line should be an array");
    }
  }
}

// ============================================================================
// POST /api/songs (index) Tests
// ============================================================================

async function testIndexGetAllowed(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/songs`, {
    method: "GET",
  });
  // GET lists all songs (200)
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(Array.isArray(data.songs), "Expected songs array in response");
}

async function testIndexPostRequiresAuth(): Promise<void> {
  // POST to index requires authentication
  const res = await fetchWithOrigin(`${BASE_URL}/api/songs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "test_auth",
      title: "Test Song",
    }),
  });
  // Should return 401 without auth
  assertEq(res.status, 401, `Expected 401 for unauthenticated POST, got ${res.status}`);
}

async function testIndexInvalidBodyReturnsError(): Promise<void> {
  // Even with invalid JSON, should return auth error first (401) since auth is checked before body parsing
  const res = await fetchWithOrigin(`${BASE_URL}/api/songs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "invalid json",
  });
  // Without auth, returns 401 before checking body
  assertEq(res.status, 401, `Expected 401, got ${res.status}`);
}

// ============================================================================
// GET /api/songs/{id} Tests (using existing song)
// ============================================================================

async function testGetSongWithLyrics(): Promise<void> {
  // If we've fetched lyrics for TEST_SONG_ID, we should be able to get it
  if (!cachedLyricsSource) return; // Skip if no lyrics were fetched
  
  const res = await fetchWithOrigin(`${BASE_URL}/api/songs/${TEST_SONG_ID}`);
  // May or may not exist depending on prior tests
  if (res.status === 200) {
    const data = await res.json();
    assert("id" in data, "Response should have id");
    assertEq(data.id, TEST_SONG_ID, "Expected song ID to match");
  }
}

async function testGetSongResponseStructure(): Promise<void> {
  // Try to get any existing song from the index
  const indexRes = await fetchWithOrigin(`${BASE_URL}/api/songs`);
  if (indexRes.status !== 200) return;
  
  const indexData = await indexRes.json();
  if (!indexData.songs || indexData.songs.length === 0) return;
  
  const existingSong = indexData.songs[0];
  const res = await fetchWithOrigin(`${BASE_URL}/api/songs/${existingSong.id}`);
  if (res.status === 200) {
    const data = await res.json();
    assert("id" in data, "Response should have id");
    assert("title" in data, "Response should have title");
  }
}

// ============================================================================
// Main
// ============================================================================

export async function runSongTests(): Promise<{ passed: number; failed: number }> {
  console.log(section("song (unified API)"));
  clearResults();

  console.log("\n  GET /api/songs/{id}\n");
  await runTest("GET non-existent song returns 404", testGetNonexistentSong);
  await runTest("OPTIONS request (CORS preflight)", testGetOptionsRequest);
  await runTest("GET without ID (index)", testGetMissingId);

  console.log("\n  POST /api/songs/{id} action: search-lyrics\n");
  // Run search first to populate cachedLyricsSource
  await runTest("Missing query", testSearchLyricsMissingQuery);
  await runTest("Basic search", testSearchLyricsBasic);
  await runTest("Result structure", testSearchLyricsResultStructure);

  console.log("\n  POST /api/songs/{id} action: fetch-lyrics\n");
  await runTest("Invalid JSON body", testFetchLyricsInvalidBody);
  await runTest("Missing lyricsSource (non-existent song)", testFetchLyricsMissingSource);
  await runTest("Fetch lyrics with searched source", testFetchLyricsWithSearchedSource);
  await runTest("Response structure", testFetchLyricsResponseStructure);
  await runTest("Cache hit", testFetchLyricsCacheHit);
  await runTest("Force refresh", testFetchLyricsForceRefresh);

  console.log("\n  POST /api/songs/{id} action: translate\n");
  await runTest("Missing language", testTranslateMissingLanguage);
  await runTest("Translate non-existent song", testTranslateNoLyrics);
  await runTest("Basic translation", testTranslateBasic);
  await runTest("Translation cache hit", testTranslateCacheHit);

  console.log("\n  POST /api/songs/{id} action: furigana\n");
  await runTest("Furigana non-existent song", testFuriganaNoLyrics);
  await runTest("Furigana response structure", testFuriganaResponseStructure);

  console.log("\n  POST /api/songs (index)\n");
  await runTest("GET method returns songs list", testIndexGetAllowed);
  await runTest("POST requires authentication", testIndexPostRequiresAuth);
  await runTest("Invalid body returns auth error", testIndexInvalidBodyReturnsError);

  console.log("\n  GET /api/songs/{id} (existing songs)\n");
  await runTest("Get song with lyrics", testGetSongWithLyrics);
  await runTest("Response structure", testGetSongResponseStructure);

  return printSummary();
}

if (import.meta.main) {
  runSongTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error("Test runner error:", error);
      process.exit(1);
    });
}
