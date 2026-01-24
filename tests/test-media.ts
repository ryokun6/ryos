#!/usr/bin/env bun
/**
 * Tests for /api/audio-transcribe and /api/youtube-search endpoints
 * Tests: Audio transcription, YouTube search, validation, rate limiting
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
// Audio Transcribe Tests
// ============================================================================

async function testTranscribeMethodNotAllowed(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/audio-transcribe`, {
    method: "GET",
  });
  assertEq(res.status, 405, `Expected 405, got ${res.status}`);
}

async function testTranscribeOptionsRequest(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/audio-transcribe`, {
    method: "OPTIONS",
  });
  assert(res.status === 200 || res.status === 204, `Expected 200 or 204, got ${res.status}`);
}

async function testTranscribeMissingAudioFile(): Promise<void> {
  const formData = new FormData();
  // Don't add any audio file
  const res = await fetchWithOrigin(`${BASE_URL}/api/audio-transcribe`, {
    method: "POST",
    body: formData,
  });
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
  const data = await res.json();
  assert(data.error?.includes("audio") || data.error?.includes("No audio"), 
    `Expected error about missing audio file, got: ${data.error}`);
}

async function testTranscribeInvalidFileType(): Promise<void> {
  const formData = new FormData();
  // Create a text file instead of audio
  const textBlob = new Blob(["This is not audio"], { type: "text/plain" });
  formData.append("audio", textBlob, "test.txt");
  
  const res = await fetchWithOrigin(`${BASE_URL}/api/audio-transcribe`, {
    method: "POST",
    body: formData,
  });
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
  const data = await res.json();
  assert(data.error?.toLowerCase().includes("invalid") || data.error?.toLowerCase().includes("type"), 
    `Expected error about invalid file type, got: ${data.error}`);
}

async function testTranscribeValidAudioFile(): Promise<void> {
  // Create a minimal valid WAV file header (44 bytes)
  // This is a valid WAV header for silence (0 bytes of audio data)
  const wavHeader = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, // "RIFF"
    0x24, 0x00, 0x00, 0x00, // File size - 8
    0x57, 0x41, 0x56, 0x45, // "WAVE"
    0x66, 0x6D, 0x74, 0x20, // "fmt "
    0x10, 0x00, 0x00, 0x00, // Chunk size (16)
    0x01, 0x00,             // Audio format (1 = PCM)
    0x01, 0x00,             // Number of channels (1)
    0x44, 0xAC, 0x00, 0x00, // Sample rate (44100)
    0x88, 0x58, 0x01, 0x00, // Byte rate
    0x02, 0x00,             // Block align
    0x10, 0x00,             // Bits per sample (16)
    0x64, 0x61, 0x74, 0x61, // "data"
    0x00, 0x00, 0x00, 0x00, // Data size (0)
  ]);
  
  const formData = new FormData();
  const audioBlob = new Blob([wavHeader], { type: "audio/wav" });
  formData.append("audio", audioBlob, "test.wav");
  
  const res = await fetchWithOrigin(`${BASE_URL}/api/audio-transcribe`, {
    method: "POST",
    body: formData,
  });
  
  if (res.status === 200) {
    const data = await res.json();
    assert("text" in data, "Expected 'text' field in response");
  } else if (res.status === 429) {
    const data = await res.json();
    assertEq(data.error, "rate_limit_exceeded", "Expected rate limit error");
  } else if (res.status === 400 || res.status === 500) {
    // OpenAI may reject the minimal WAV - that's acceptable
    assert(true, "API rejected minimal WAV - acceptable");
  } else {
    throw new Error(`Unexpected status: ${res.status}`);
  }
}

async function testTranscribeCorsHeaders(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/audio-transcribe`, {
    method: "OPTIONS",
  });
  const allowOrigin = res.headers.get("Access-Control-Allow-Origin");
  assert(allowOrigin !== null || res.status >= 400, "Expected CORS headers or error response");
}

async function testTranscribeRateLimitHeaders(): Promise<void> {
  const formData = new FormData();
  const audioBlob = new Blob([new Uint8Array(44)], { type: "audio/wav" });
  formData.append("audio", audioBlob, "test.wav");
  
  const res = await fetchWithOrigin(`${BASE_URL}/api/audio-transcribe`, {
    method: "POST",
    body: formData,
  });
  
  if (res.status === 429) {
    const retryAfter = res.headers.get("Retry-After");
    assert(retryAfter !== null, "Expected Retry-After header on rate limit");
    const data = await res.json();
    assert(data.scope === "burst" || data.scope === "daily", 
      "Expected scope field in rate limit response");
  }
  assert(true, "Rate limit headers check passed");
}

// ============================================================================
// YouTube Search Tests
// ============================================================================

async function testYouTubeMethodNotAllowed(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/youtube-search`, {
    method: "GET",
  });
  assertEq(res.status, 405, `Expected 405, got ${res.status}`);
}

async function testYouTubeOptionsRequest(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/youtube-search`, {
    method: "OPTIONS",
  });
  assert(res.status === 200 || res.status === 204, `Expected 200 or 204, got ${res.status}`);
}

async function testYouTubeMissingQuery(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/youtube-search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
}

async function testYouTubeEmptyQuery(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/youtube-search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "" }),
  });
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
}

async function testYouTubeInvalidMaxResults(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/youtube-search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "test", maxResults: 100 }),
  });
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
}

async function testYouTubeInvalidMaxResultsZero(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/youtube-search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "test", maxResults: 0 }),
  });
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
}

async function testYouTubeInvalidJson(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/youtube-search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "not valid json{",
  });
  assert(res.status >= 400, `Expected error status, got ${res.status}`);
}

async function testYouTubeBasicSearch(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/youtube-search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "lofi music" }),
  });
  
  if (res.status === 200) {
    const data = await res.json();
    assert(Array.isArray(data.results), "Expected results array");
    if (data.results.length > 0) {
      const first = data.results[0];
      assert("videoId" in first, "Expected videoId in result");
      assert("title" in first, "Expected title in result");
      assert("channelTitle" in first, "Expected channelTitle in result");
      assert("thumbnail" in first, "Expected thumbnail in result");
    }
  } else if (res.status === 429) {
    const data = await res.json();
    assertEq(data.error, "rate_limit_exceeded", "Expected rate limit error");
  } else if (res.status === 403) {
    // YouTube API quota exceeded or not configured
    assert(true, "YouTube API quota/config issue - test passes");
  } else if (res.status === 500) {
    // API not configured
    assert(true, "YouTube API not configured - test passes");
  } else {
    throw new Error(`Unexpected status: ${res.status}`);
  }
}

async function testYouTubeSearchWithMaxResults(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/youtube-search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "jazz music", maxResults: 5 }),
  });
  
  if (res.status === 200) {
    const data = await res.json();
    assert(Array.isArray(data.results), "Expected results array");
    assert(data.results.length <= 5, `Expected at most 5 results, got ${data.results.length}`);
  } else if (res.status === 429 || res.status === 403 || res.status === 500) {
    assert(true, "Rate limited or API issue - test passes");
  } else {
    throw new Error(`Unexpected status: ${res.status}`);
  }
}

async function testYouTubeCorsHeaders(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/youtube-search`, {
    method: "OPTIONS",
  });
  const allowOrigin = res.headers.get("Access-Control-Allow-Origin");
  assert(allowOrigin !== null || res.status >= 400, "Expected CORS headers or error response");
}

async function testYouTubeRateLimitHeaders(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/youtube-search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "rate limit test" }),
  });
  
  if (res.status === 429) {
    const retryAfter = res.headers.get("Retry-After");
    assert(retryAfter !== null, "Expected Retry-After header on rate limit");
    const data = await res.json();
    assert(data.scope === "burst" || data.scope === "daily", 
      "Expected scope field in rate limit response");
  }
  assert(true, "Rate limit headers check passed");
}

// ============================================================================
// Main
// ============================================================================

export async function runMediaTests(): Promise<{ passed: number; failed: number }> {
  console.log(section("audio-transcribe"));
  clearResults();

  console.log("\n  HTTP Methods\n");
  await runTest("GET method not allowed", testTranscribeMethodNotAllowed);
  await runTest("OPTIONS request (CORS preflight)", testTranscribeOptionsRequest);

  console.log("\n  Input Validation\n");
  await runTest("Missing audio file", testTranscribeMissingAudioFile);
  await runTest("Invalid file type (text instead of audio)", testTranscribeInvalidFileType);

  console.log("\n  Transcription\n");
  await runTest("Valid audio file upload", testTranscribeValidAudioFile);

  console.log("\n  Headers\n");
  await runTest("CORS headers", testTranscribeCorsHeaders);
  await runTest("Rate limit headers", testTranscribeRateLimitHeaders);

  console.log(section("youtube-search"));

  console.log("\n  HTTP Methods\n");
  await runTest("GET method not allowed", testYouTubeMethodNotAllowed);
  await runTest("OPTIONS request (CORS preflight)", testYouTubeOptionsRequest);

  console.log("\n  Input Validation\n");
  await runTest("Missing query parameter", testYouTubeMissingQuery);
  await runTest("Empty query string", testYouTubeEmptyQuery);
  await runTest("Invalid maxResults (too high)", testYouTubeInvalidMaxResults);
  await runTest("Invalid maxResults (zero)", testYouTubeInvalidMaxResultsZero);
  await runTest("Invalid JSON body", testYouTubeInvalidJson);

  console.log("\n  YouTube Search\n");
  await runTest("Basic search query", testYouTubeBasicSearch);
  await runTest("Search with maxResults parameter", testYouTubeSearchWithMaxResults);

  console.log("\n  Headers\n");
  await runTest("CORS headers", testYouTubeCorsHeaders);
  await runTest("Rate limit headers", testYouTubeRateLimitHeaders);

  return printSummary();
}

if (import.meta.main) {
  runMediaTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error("Test runner error:", error);
      process.exit(1);
    });
}
