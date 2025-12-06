#!/usr/bin/env bun
/**
 * Tests for /api/lyrics endpoint
 * Tests: Lyrics search, caching, validation
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

// ============================================================================
// Test Functions
// ============================================================================

async function testMethodNotAllowed(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/lyrics`, {
    method: "GET",
  });
  assertEq(res.status, 405, `Expected 405, got ${res.status}`);
}

async function testOptionsRequest(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/lyrics`, {
    method: "OPTIONS",
  });
  assert(res.status === 200 || res.status === 204, `Expected 200 or 204, got ${res.status}`);
}

async function testInvalidBody(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/lyrics`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "invalid json",
  });
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
}

async function testMissingTitleAndArtist(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/lyrics`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
  const data = await res.json();
  assert(data.error?.includes("title") || data.error?.includes("artist"), "Expected validation error");
}

async function testSearchByTitle(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/lyrics`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Bohemian Rhapsody",
    }),
  });
  assert(res.status === 200 || res.status === 404, `Expected 200 or 404, got ${res.status}`);
}

async function testSearchByTitleAndArtist(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/lyrics`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Bohemian Rhapsody",
      artist: "Queen",
    }),
  });
  assert(res.status === 200 || res.status === 404, `Expected 200 or 404, got ${res.status}`);
  if (res.status === 200) {
    const data = await res.json();
    assert(data.lyrics, "Expected lyrics in response");
    assert(data.title, "Expected title in response");
  }
}

async function testSearchWithAlbum(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/lyrics`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Blank Space",
      artist: "Taylor Swift",
      album: "1989",
    }),
  });
  assert(res.status === 200 || res.status === 404, `Expected 200 or 404, got ${res.status}`);
}

async function testCacheHit(): Promise<void> {
  const res1 = await fetchWithOrigin(`${BASE_URL}/api/lyrics`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Never Gonna Give You Up",
      artist: "Rick Astley",
    }),
  });

  if (res1.status === 200) {
    const res2 = await fetchWithOrigin(`${BASE_URL}/api/lyrics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Never Gonna Give You Up",
        artist: "Rick Astley",
      }),
    });
    assertEq(res2.status, 200, `Expected 200, got ${res2.status}`);
    const cacheHeader = res2.headers.get("X-Lyrics-Cache");
    assertEq(cacheHeader, "HIT", "Expected cache HIT header");
  }
}

async function testForceRefresh(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/lyrics`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Bohemian Rhapsody",
      artist: "Queen",
      force: true,
    }),
  });
  assert(res.status === 200 || res.status === 404, `Expected 200 or 404, got ${res.status}`);
  if (res.status === 200) {
    const cacheHeader = res.headers.get("X-Lyrics-Cache");
    assert(cacheHeader !== "HIT", "Expected cache to be bypassed");
  }
}

async function testResponseStructure(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/lyrics`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Shape of You",
      artist: "Ed Sheeran",
    }),
  });
  if (res.status === 200) {
    const data = await res.json();
    assert("title" in data, "Response should have title");
    assert("artist" in data, "Response should have artist");
    assert("lyrics" in data, "Response should have lyrics");
  }
}

async function testLrcFormat(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/lyrics`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Hello",
      artist: "Adele",
    }),
  });
  if (res.status === 200) {
    const data = await res.json();
    if (data.lyrics) {
      const hasTimestamps = /\[\d{2}:\d{2}\.\d{2}\]/.test(data.lyrics);
      assert(hasTimestamps, "Lyrics should be in LRC format with timestamps");
    }
  }
}

async function testNoResultsFound(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/lyrics`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "xyznonexistentsong123456789",
      artist: "NotARealArtist999888777",
    }),
  });
  assertEq(res.status, 404, `Expected 404 for non-existent song, got ${res.status}`);
  const data = await res.json();
  assert(data.error, "Expected error in response");
}

// ============================================================================
// Main
// ============================================================================

export async function runLyricsTests(): Promise<{ passed: number; failed: number }> {
  console.log(section("lyrics"));
  clearResults();

  console.log("\n  HTTP Methods\n");
  await runTest("GET method not allowed", testMethodNotAllowed);
  await runTest("OPTIONS request (CORS preflight)", testOptionsRequest);

  console.log("\n  Input Validation\n");
  await runTest("Invalid JSON body", testInvalidBody);
  await runTest("Missing title and artist", testMissingTitleAndArtist);

  console.log("\n  Lyrics Search\n");
  await runTest("Search by title only", testSearchByTitle);
  await runTest("Search by title and artist", testSearchByTitleAndArtist);
  await runTest("Search with album", testSearchWithAlbum);
  await runTest("No results found", testNoResultsFound);

  console.log("\n  Response Format\n");
  await runTest("Response structure", testResponseStructure);
  await runTest("LRC format validation", testLrcFormat);

  console.log("\n  Caching\n");
  await runTest("Cache hit", testCacheHit);
  await runTest("Force refresh", testForceRefresh);

  return printSummary();
}

if (import.meta.main) {
  runLyricsTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error("Test runner error:", error);
      process.exit(1);
    });
}
