#!/usr/bin/env bun
/**
 * Tests for /api/parse-title endpoint
 * Tests: Title parsing, validation, AI-powered metadata extraction
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
  const res = await fetchWithOrigin(`${BASE_URL}/api/parse-title`, {
    method: "GET",
  });
  assertEq(res.status, 405, `Expected 405, got ${res.status}`);
}

async function testOptionsRequest(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/parse-title`, {
    method: "OPTIONS",
  });
  assert(res.status === 200 || res.status === 204, `Expected 200 or 204, got ${res.status}`);
}

async function testMissingTitle(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/parse-title`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
  const data = await res.json();
  assert(data.error?.toLowerCase().includes("title"), "Expected title error");
}

async function testEmptyTitle(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/parse-title`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "" }),
  });
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
}

async function testInvalidBody(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/parse-title`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "not valid json",
  });
  assert(res.status >= 400, `Expected error status, got ${res.status}`);
}

async function testBasicTitleParsing(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/parse-title`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Taylor Swift - Blank Space (Official Video)",
    }),
  });
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.title, "Expected parsed title");
  assert(data.artist || data.title, "Expected artist or title to be present");
}

async function testTitleWithChannel(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/parse-title`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "How Sweet Official MV",
      author_name: "HYBE LABELS",
    }),
  });
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.title, "Expected parsed title");
}

async function testKoreanTitle(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/parse-title`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "NewJeans (뉴진스) 'How Sweet' Official MV",
      author_name: "HYBE LABELS",
    }),
  });
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.title, "Expected parsed title");
  if (data.artist) {
    assert(data.artist.includes("뉴진스"), "Should prefer original language artist name");
  }
}

async function testAmbiguousTitle(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/parse-title`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Lofi Hip Hop Radio - Beats to Relax/Study to",
      author_name: "ChillHop Music",
    }),
  });
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.title, "Expected title in response");
}

async function testResponseStructure(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/parse-title`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Artist - Song Title",
    }),
  });
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert("title" in data, "Response should have title field");
}

// ============================================================================
// Main
// ============================================================================

export async function runParseTitleTests(): Promise<{ passed: number; failed: number }> {
  console.log(section("parse-title"));
  clearResults();

  console.log("\n  HTTP Methods\n");
  await runTest("GET method not allowed", testMethodNotAllowed);
  await runTest("OPTIONS request (CORS preflight)", testOptionsRequest);

  console.log("\n  Input Validation\n");
  await runTest("Missing title", testMissingTitle);
  await runTest("Empty title", testEmptyTitle);
  await runTest("Invalid JSON body", testInvalidBody);

  console.log("\n  Title Parsing\n");
  await runTest("Basic title parsing", testBasicTitleParsing);
  await runTest("Title with channel name", testTitleWithChannel);
  await runTest("Korean/English title", testKoreanTitle);
  await runTest("Ambiguous title", testAmbiguousTitle);
  await runTest("Response structure", testResponseStructure);

  return printSummary();
}

if (import.meta.main) {
  runParseTitleTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error("Test runner error:", error);
      process.exit(1);
    });
}
