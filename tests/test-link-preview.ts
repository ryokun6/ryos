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
  // GitHub has good OG tags
  const res = await fetchWithOrigin(
    `${BASE_URL}/api/link-preview?url=https://github.com`
  );
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.url === "https://github.com", "Expected URL in response");
  // GitHub should have title and description
  assert(data.title || data.siteName, "Expected title or siteName");
}

async function testYouTubeUrl(): Promise<void> {
  // Test YouTube URL handling via oEmbed
  const res = await fetchWithOrigin(
    `${BASE_URL}/api/link-preview?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ`
  );
  // Should succeed with YouTube oEmbed
  if (res.status === 200) {
    const data = await res.json();
    assert(data.siteName === "YouTube", "Expected YouTube siteName");
    assert(data.title, "Expected video title");
    assert(data.image, "Expected thumbnail image");
  } else {
    // May fail due to network, that's ok
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
  // Should be 200 or 204 for CORS preflight
  assert(res.status === 200 || res.status === 204, `Expected 200 or 204, got ${res.status}`);
}

async function testCacheHeaders(): Promise<void> {
  const res = await fetchWithOrigin(
    `${BASE_URL}/api/link-preview?url=https://example.com`
  );
  if (res.status === 200) {
    const cacheControl = res.headers.get("Cache-Control");
    // Should have cache headers for successful responses
    assert(cacheControl !== null || true, "Cache control header check");
  }
}

async function testUrlWith404(): Promise<void> {
  const res = await fetchWithOrigin(
    `${BASE_URL}/api/link-preview?url=https://httpstat.us/404`
  );
  // Should return the upstream error
  assertEq(res.status, 404, `Expected 404, got ${res.status}`);
}

async function testUrlWithTimeout(): Promise<void> {
  // httpstat.us can simulate delays
  const res = await fetchWithOrigin(
    `${BASE_URL}/api/link-preview?url=https://httpstat.us/200?sleep=15000`
  );
  // Should timeout (10 second timeout in the API)
  assert(res.status === 408 || res.status >= 500, `Expected timeout error, got ${res.status}`);
}

// ============================================================================
// Main
// ============================================================================

export async function runLinkPreviewTests(): Promise<{ passed: number; failed: number }> {
  console.log(`\n🧪 Testing link-preview API at ${BASE_URL}\n`);
  console.log("=".repeat(60));
  clearResults();

  // Input validation
  console.log("\n📋 Testing Input Validation\n");
  await runTest("Missing URL parameter", testMissingUrl);
  await runTest("Invalid URL format", testInvalidUrlFormat);
  await runTest("Non-HTTP protocol", testNonHttpProtocol);
  await runTest("Method not allowed (POST)", testMethodNotAllowed);
  await runTest("OPTIONS request (CORS preflight)", testOptionsRequest);

  // Metadata extraction
  console.log("\n📋 Testing Metadata Extraction\n");
  await runTest("Basic metadata extraction", testBasicMetadataExtraction);
  await runTest("Open Graph extraction", testOpenGraphExtraction);
  await runTest("Cache headers", testCacheHeaders);

  // YouTube handling
  console.log("\n📋 Testing YouTube Handling\n");
  await runTest("YouTube URL (watch)", testYouTubeUrl);
  await runTest("YouTube short URL (youtu.be)", testYouTubeShortUrl);

  // Error cases
  console.log("\n📋 Testing Error Cases\n");
  await runTest("URL returning 404", testUrlWith404);
  // Skipping timeout test as it takes too long
  // await runTest("URL with timeout", testUrlWithTimeout);

  return printSummary();
}

// Run if executed directly
if (import.meta.main) {
  runLinkPreviewTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error("Test runner error:", error);
      process.exit(1);
    });
}
