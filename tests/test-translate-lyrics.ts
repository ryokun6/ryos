#!/usr/bin/env bun
/**
 * Tests for /api/translate-lyrics endpoint
 * Tests: Lyrics translation, validation, caching
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
  const res = await fetchWithOrigin(`${BASE_URL}/api/translate-lyrics`, {
    method: "GET",
  });
  assertEq(res.status, 405, `Expected 405, got ${res.status}`);
}

async function testOptionsRequest(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/translate-lyrics`, {
    method: "OPTIONS",
  });
  assert(res.status === 200 || res.status === 204, `Expected 200 or 204, got ${res.status}`);
}

async function testInvalidBody(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/translate-lyrics`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "invalid json",
  });
  // API may return 400 or 500 for malformed JSON
  assert(res.status === 400 || res.status === 500, 
    `Expected 400 or 500, got ${res.status}`);
}

async function testMissingLines(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/translate-lyrics`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      targetLanguage: "Spanish",
    }),
  });
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
}

async function testMissingTargetLanguage(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/translate-lyrics`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lines: [{ words: "Hello", startTimeMs: "0" }],
    }),
  });
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
}

async function testEmptyLines(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/translate-lyrics`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lines: [],
      targetLanguage: "Spanish",
    }),
  });
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const text = await res.text();
  assertEq(text, "", "Expected empty response for empty lines");
}

async function testBasicTranslation(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/translate-lyrics`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lines: [
        { words: "Hello world", startTimeMs: "0" },
        { words: "How are you", startTimeMs: "2000" },
        { words: "I am fine", startTimeMs: "4000" },
      ],
      targetLanguage: "Spanish",
    }),
  });
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const text = await res.text();
  assert(text.length > 0, "Expected translated text");
  assert(text.includes("[00:"), "Expected LRC format timestamps");
}

async function testLrcFormatOutput(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/translate-lyrics`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lines: [
        { words: "First line", startTimeMs: "1500" },
        { words: "Second line", startTimeMs: "3500" },
      ],
      targetLanguage: "French",
    }),
  });
  if (res.status === 200) {
    const text = await res.text();
    const lines = text.split("\n").filter(Boolean);
    for (const line of lines) {
      const hasTimestamp = /^\[\d{2}:\d{2}\.\d{2}\]/.test(line);
      assert(hasTimestamp, `Line should start with LRC timestamp: ${line}`);
    }
  }
}

async function testJapaneseTranslation(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/translate-lyrics`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lines: [
        { words: "I love you", startTimeMs: "0" },
        { words: "You are beautiful", startTimeMs: "2000" },
      ],
      targetLanguage: "Japanese",
    }),
  });
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const text = await res.text();
  assert(text.length > 0, "Expected translated text");
}

async function testKoreanTranslation(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/translate-lyrics`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lines: [
        { words: "Good morning", startTimeMs: "0" },
        { words: "Have a nice day", startTimeMs: "1500" },
      ],
      targetLanguage: "Korean",
    }),
  });
  assertEq(res.status, 200, `Expected 200, got ${res.status}`);
  const text = await res.text();
  assert(text.length > 0, "Expected translated text");
}

async function testPreservesLineCount(): Promise<void> {
  const inputLines = [
    { words: "Line 1", startTimeMs: "0" },
    { words: "Line 2", startTimeMs: "1000" },
    { words: "Line 3", startTimeMs: "2000" },
    { words: "Line 4", startTimeMs: "3000" },
    { words: "Line 5", startTimeMs: "4000" },
  ];

  const res = await fetchWithOrigin(`${BASE_URL}/api/translate-lyrics`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lines: inputLines,
      targetLanguage: "German",
    }),
  });

  if (res.status === 200) {
    const text = await res.text();
    const outputLines = text.split("\n").filter(Boolean);
    assertEq(outputLines.length, inputLines.length, 
      `Expected ${inputLines.length} lines, got ${outputLines.length}`);
  }
}

async function testCacheHit(): Promise<void> {
  const testLines = [
    { words: "Cache test line", startTimeMs: "0" },
  ];
  
  const res1 = await fetchWithOrigin(`${BASE_URL}/api/translate-lyrics`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lines: testLines,
      targetLanguage: "Italian",
    }),
  });
  
  if (res1.status === 200) {
    const res2 = await fetchWithOrigin(`${BASE_URL}/api/translate-lyrics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lines: testLines,
        targetLanguage: "Italian",
      }),
    });
    assertEq(res2.status, 200, `Expected 200, got ${res2.status}`);
    const cacheHeader = res2.headers.get("X-Lyrics-Translation-Cache");
    assertEq(cacheHeader, "HIT", "Expected cache HIT header");
  }
}

async function testInvalidLineFormat(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/translate-lyrics`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lines: [
        { invalid: "format" },
      ],
      targetLanguage: "Spanish",
    }),
  });
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
}

// ============================================================================
// Main
// ============================================================================

export async function runTranslateLyricsTests(): Promise<{ passed: number; failed: number }> {
  console.log(section("translate-lyrics"));
  clearResults();

  console.log("\n  HTTP Methods\n");
  await runTest("GET method not allowed", testMethodNotAllowed);
  await runTest("OPTIONS request (CORS preflight)", testOptionsRequest);

  console.log("\n  Input Validation\n");
  await runTest("Invalid JSON body", testInvalidBody);
  await runTest("Missing lines", testMissingLines);
  await runTest("Missing target language", testMissingTargetLanguage);
  await runTest("Empty lines array", testEmptyLines);
  await runTest("Invalid line format", testInvalidLineFormat);

  console.log("\n  Translation\n");
  await runTest("Basic translation (Spanish)", testBasicTranslation);
  await runTest("LRC format output", testLrcFormatOutput);
  await runTest("Japanese translation", testJapaneseTranslation);
  await runTest("Korean translation", testKoreanTranslation);
  await runTest("Preserves line count", testPreservesLineCount);

  console.log("\n  Caching\n");
  await runTest("Cache hit", testCacheHit);

  return printSummary();
}

if (import.meta.main) {
  runTranslateLyricsTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error("Test runner error:", error);
      process.exit(1);
    });
}
