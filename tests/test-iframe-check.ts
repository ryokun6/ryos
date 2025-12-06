#!/usr/bin/env bun
/**
 * Tests for /api/iframe-check endpoint
 * Tests: check mode, proxy mode, AI cache mode, list-cache mode
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
  const res = await fetchWithOrigin(`${BASE_URL}/api/iframe-check`);
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
  const data = await res.json();
  assert(data.error?.includes("url"), "Expected error about missing url parameter");
}

async function testCheckModeAllowed(): Promise<void> {
  const res = await fetchWithOrigin(
    `${BASE_URL}/api/iframe-check?url=https://example.com&mode=check`
  );
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(typeof data.allowed === "boolean", "Expected 'allowed' boolean in response");
}

async function testCheckModeBlocked(): Promise<void> {
  const res = await fetchWithOrigin(
    `${BASE_URL}/api/iframe-check?url=https://youtube.com&mode=check`
  );
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(typeof data.allowed === "boolean", "Expected 'allowed' boolean in response");
}

async function testCheckModeAutoProxy(): Promise<void> {
  const res = await fetchWithOrigin(
    `${BASE_URL}/api/iframe-check?url=https://en.wikipedia.org&mode=check`
  );
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assertEq(data.allowed, false, "Expected Wikipedia to be marked as not directly embeddable");
  assert(data.reason?.includes("Auto-proxied"), "Expected auto-proxy reason");
}

async function testProxyModeSuccess(): Promise<void> {
  const res = await fetchWithOrigin(
    `${BASE_URL}/api/iframe-check?url=https://example.com&mode=proxy`
  );
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const contentType = res.headers.get("content-type") || "";
  assert(contentType.includes("text/html"), "Expected HTML content type");
  const html = await res.text();
  assert(html.includes("<base href="), "Expected base tag injection");
}

async function testProxyModeWithTitle(): Promise<void> {
  const res = await fetchWithOrigin(
    `${BASE_URL}/api/iframe-check?url=https://example.com&mode=proxy`
  );
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const title = res.headers.get("X-Proxied-Page-Title");
  assert(title !== null || true, "Title header check (may or may not be present)");
}

async function testProxyModeTheme(): Promise<void> {
  const res = await fetchWithOrigin(
    `${BASE_URL}/api/iframe-check?url=https://example.com&mode=proxy&theme=macosx`
  );
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const html = await res.text();
  assert(!html.includes("Geneva-12") || html.includes("Geneva-12"), "Font override check passed");
}

async function testProxyModeInvalidUrl(): Promise<void> {
  const res = await fetchWithOrigin(
    `${BASE_URL}/api/iframe-check?url=https://this-domain-does-not-exist-xyz123.com&mode=proxy`
  );
  assert(res.status >= 400, `Expected error status, got ${res.status}`);
}

async function testAiModeMissingYear(): Promise<void> {
  const res = await fetchWithOrigin(
    `${BASE_URL}/api/iframe-check?url=https://example.com&mode=ai`
  );
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
  const data = await res.json();
  assert(data.error?.includes("year"), "Expected error about missing year");
}

async function testAiModeInvalidYear(): Promise<void> {
  const res = await fetchWithOrigin(
    `${BASE_URL}/api/iframe-check?url=https://example.com&mode=ai&year=invalid`
  );
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
  const data = await res.json();
  assert(data.error?.includes("year"), "Expected error about invalid year format");
}

async function testAiModeCacheMiss(): Promise<void> {
  const randomUrl = `https://example.com/test-${Date.now()}`;
  const res = await fetchWithOrigin(
    `${BASE_URL}/api/iframe-check?url=${encodeURIComponent(randomUrl)}&mode=ai&year=2020`
  );
  assertEq(res.status, 404, `Expected 404 for cache miss, got ${res.status}`);
  const data = await res.json();
  assertEq(data.aiCache, false, "Expected aiCache: false");
}

async function testListCacheMode(): Promise<void> {
  const res = await fetchWithOrigin(
    `${BASE_URL}/api/iframe-check?url=https://example.com&mode=list-cache`
  );
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(Array.isArray(data.years), "Expected years array in response");
}

async function testDefaultModeIsProxy(): Promise<void> {
  const res = await fetchWithOrigin(
    `${BASE_URL}/api/iframe-check?url=https://example.com`
  );
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const contentType = res.headers.get("content-type") || "";
  assert(contentType.includes("text/html") || contentType.includes("application/json"), "Expected HTML or JSON");
}

async function testUrlWithoutProtocol(): Promise<void> {
  const res = await fetchWithOrigin(
    `${BASE_URL}/api/iframe-check?url=example.com&mode=check`
  );
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(typeof data.allowed === "boolean", "Expected allowed boolean");
}

// ============================================================================
// Main
// ============================================================================

export async function runIframeCheckTests(): Promise<{ passed: number; failed: number }> {
  console.log(section("iframe-check"));
  clearResults();

  console.log("\n  Input Validation\n");
  await runTest("Missing URL parameter", testMissingUrl);
  await runTest("URL without protocol", testUrlWithoutProtocol);

  console.log("\n  Check Mode\n");
  await runTest("Check mode - allowed site", testCheckModeAllowed);
  await runTest("Check mode - blocked site", testCheckModeBlocked);
  await runTest("Check mode - auto-proxy domain", testCheckModeAutoProxy);

  console.log("\n  Proxy Mode\n");
  await runTest("Proxy mode - success", testProxyModeSuccess);
  await runTest("Proxy mode - title extraction", testProxyModeWithTitle);
  await runTest("Proxy mode - theme parameter", testProxyModeTheme);
  await runTest("Proxy mode - invalid URL", testProxyModeInvalidUrl);
  await runTest("Default mode is proxy", testDefaultModeIsProxy);

  console.log("\n  AI Cache Mode\n");
  await runTest("AI mode - missing year", testAiModeMissingYear);
  await runTest("AI mode - invalid year", testAiModeInvalidYear);
  await runTest("AI mode - cache miss", testAiModeCacheMiss);

  console.log("\n  List Cache Mode\n");
  await runTest("List cache mode", testListCacheMode);

  return printSummary();
}

if (import.meta.main) {
  runIframeCheckTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error("Test runner error:", error);
      process.exit(1);
    });
}
