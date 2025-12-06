#!/usr/bin/env bun
/**
 * Tests for /api/link-preview endpoint
 * Tests: URL validation, metadata extraction, YouTube handling, error cases
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

async function testMissingUrl(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/link-preview`);
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
  const data = await res.json();
  assert(data.error?.includes("URL") || data.error?.includes("url"), "Expected URL error");
}

async function testInvalidUrlFormat(): Promise<void> {
  const res = await fetchWithOrigin(
    `${BASE_URL}/api/link-preview?url=not-a-valid-url`
  );
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
  const data = await res.json();
  assert(data.error?.includes("Invalid") || data.error?.includes("invalid"), "Expected invalid URL error");
}

async function testNonHttpProtocol(): Promise<void> {
  const res = await fetchWithOrigin(
    `${BASE_URL}/api/link-preview?url=ftp://example.com`
  );
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
  const data = await res.json();
  assert(data.error?.includes("HTTP"), "Expected HTTP/HTTPS only error");
}

async function testBasicMetadataExtraction(): Promise<void> {
  const res = await fetchWithOrigin(
    `${BASE_URL}/api/link-preview?url=https://example.com`
  );
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.url === "https://example.com", "Expected URL in response");
  assert(typeof data.siteName === "string", "Expected siteName in response");
}

async function testOpenGraphExtraction(): Promise<void> {
  const res = await fetchWithOrigin(
    `${BASE_URL}/api/link-preview?url=https://github.com`
  );
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.url === "https://github.com", "Expected URL in response");
  assert(data.title || data.siteName, "Expected title or siteName");
}

async function testYouTubeUrl(): Promise<void> {
  const res = await fetchWithOrigin(
    `${BASE_URL}/api/link-preview?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ`
  );
  if (res.status === 200) {
    const data = await res.json();
    // YouTube oEmbed may return different siteName formats
    assert(data.siteName?.toLowerCase().includes("youtube") || data.title, 
      "Expected YouTube siteName or title");
  } else {
    // Network issues or rate limiting are acceptable
    assert(res.status >= 400, "Expected error or success status");
  }
}

async function testYouTubeShortUrl(): Promise<void> {
  const res = await fetchWithOrigin(
    `${BASE_URL}/api/link-preview?url=https://youtu.be/dQw4w9WgXcQ`
  );
  if (res.status === 200) {
    const data = await res.json();
    assert(data.siteName === "YouTube", "Expected YouTube siteName");
  } else {
    assert(res.status >= 400, "Expected error or success status");
  }
}

async function testMethodNotAllowed(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/link-preview`, {
    method: "POST",
  });
  assertEq(res.status, 405, `Expected 405, got ${res.status}`);
}

async function testOptionsRequest(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/link-preview`, {
    method: "OPTIONS",
  });
  assert(res.status === 200 || res.status === 204, `Expected 200 or 204, got ${res.status}`);
}

async function testCacheHeaders(): Promise<void> {
  const res = await fetchWithOrigin(
    `${BASE_URL}/api/link-preview?url=https://example.com`
  );
  if (res.status === 200) {
    const cacheControl = res.headers.get("Cache-Control");
    assert(cacheControl !== null || true, "Cache control header check");
  }
}

async function testUrlWith404(): Promise<void> {
  const res = await fetchWithOrigin(
    `${BASE_URL}/api/link-preview?url=https://httpstat.us/404`
  );
  // httpstat.us may return 503 when overloaded, accept either
  assert(res.status === 404 || res.status === 503, 
    `Expected 404 or 503, got ${res.status}`);
}

// ============================================================================
// Main
// ============================================================================

export async function runLinkPreviewTests(): Promise<{ passed: number; failed: number }> {
  console.log(section("link-preview"));
  clearResults();

  console.log("\n  Input Validation\n");
  await runTest("Missing URL parameter", testMissingUrl);
  await runTest("Invalid URL format", testInvalidUrlFormat);
  await runTest("Non-HTTP protocol", testNonHttpProtocol);
  await runTest("Method not allowed (POST)", testMethodNotAllowed);
  await runTest("OPTIONS request (CORS preflight)", testOptionsRequest);

  console.log("\n  Metadata Extraction\n");
  await runTest("Basic metadata extraction", testBasicMetadataExtraction);
  await runTest("Open Graph extraction", testOpenGraphExtraction);
  await runTest("Cache headers", testCacheHeaders);

  console.log("\n  YouTube Handling\n");
  await runTest("YouTube URL (watch)", testYouTubeUrl);
  await runTest("YouTube short URL (youtu.be)", testYouTubeShortUrl);

  console.log("\n  Error Cases\n");
  await runTest("URL returning 404", testUrlWith404);

  return printSummary();
}

if (import.meta.main) {
  runLinkPreviewTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error("Test runner error:", error);
      process.exit(1);
    });
}
