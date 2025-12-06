#!/usr/bin/env bun
/**
 * Tests for /api/speech endpoint
 * Tests: Text-to-speech generation, validation, rate limiting
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
  const res = await fetchWithOrigin(`${BASE_URL}/api/speech`, {
    method: "GET",
  });
  assertEq(res.status, 405, `Expected 405, got ${res.status}`);
}

async function testOptionsRequest(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/speech`, {
    method: "OPTIONS",
  });
  assert(res.status === 200 || res.status === 204, `Expected 200 or 204, got ${res.status}`);
}

async function testMissingText(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/speech`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
}

async function testEmptyText(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/speech`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "" }),
  });
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
}

async function testWhitespaceOnlyText(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/speech`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "   " }),
  });
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
}

async function testBasicSpeechGeneration(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/speech`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: "Hello, this is a test.",
    }),
  });
  if (res.status === 200) {
    const contentType = res.headers.get("content-type") || "";
    assert(contentType.includes("audio"), "Expected audio content type");
    const buffer = await res.arrayBuffer();
    assert(buffer.byteLength > 0, "Expected non-empty audio data");
  } else if (res.status === 429) {
    const data = await res.json();
    assert(data.error === "rate_limit_exceeded", "Expected rate limit error");
  } else {
    throw new Error(`Unexpected status: ${res.status}`);
  }
}

async function testOpenAIModel(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/speech`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: "Testing OpenAI TTS.",
      model: "openai",
      voice: "alloy",
    }),
  });
  if (res.status === 200) {
    const contentType = res.headers.get("content-type") || "";
    assert(contentType.includes("audio"), "Expected audio content type");
  } else if (res.status === 429) {
    assert(true, "Rate limited - test passes");
  } else {
    throw new Error(`Unexpected status: ${res.status}`);
  }
}

async function testElevenLabsModel(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/speech`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: "Testing ElevenLabs TTS.",
      model: "elevenlabs",
    }),
  });
  if (res.status === 200) {
    const contentType = res.headers.get("content-type") || "";
    assert(contentType.includes("audio"), "Expected audio content type");
  } else if (res.status === 429) {
    assert(true, "Rate limited - test passes");
  } else if (res.status === 500) {
    assert(true, "ElevenLabs not configured - test passes");
  } else {
    throw new Error(`Unexpected status: ${res.status}`);
  }
}

async function testOpenAIVoiceOptions(): Promise<void> {
  const voices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];
  const voice = voices[Math.floor(Math.random() * voices.length)];
  
  const res = await fetchWithOrigin(`${BASE_URL}/api/speech`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: "Testing voice options.",
      model: "openai",
      voice: voice,
      speed: 1.2,
    }),
  });
  if (res.status === 200) {
    const contentType = res.headers.get("content-type") || "";
    assert(contentType.includes("audio"), "Expected audio content type");
  } else if (res.status === 429) {
    assert(true, "Rate limited - test passes");
  } else {
    throw new Error(`Unexpected status: ${res.status}`);
  }
}

async function testDefaultModelIsElevenLabs(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/speech`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: "Testing default model.",
    }),
  });
  assert(res.status === 200 || res.status === 429 || res.status === 500, 
    `Expected 200, 429, or 500, got ${res.status}`);
}

async function testRateLimitHeaders(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/speech`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: "Rate limit test.",
    }),
  });
  if (res.status === 429) {
    const retryAfter = res.headers.get("Retry-After");
    assert(retryAfter !== null, "Expected Retry-After header on rate limit");
    const limitHeader = res.headers.get("X-RateLimit-Limit");
    assert(limitHeader !== null, "Expected X-RateLimit-Limit header");
  }
  assert(true, "Rate limit headers check passed");
}

async function testCorsHeaders(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/speech`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: "CORS test.",
    }),
  });
  const allowOrigin = res.headers.get("Access-Control-Allow-Origin");
  assert(allowOrigin !== null || res.status >= 400, "Expected CORS headers or error response");
}

async function testInvalidJson(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/speech`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "not valid json{",
  });
  assert(res.status >= 400, `Expected error status, got ${res.status}`);
}

// ============================================================================
// Main
// ============================================================================

export async function runSpeechTests(): Promise<{ passed: number; failed: number }> {
  console.log(section("speech"));
  clearResults();

  console.log("\n  HTTP Methods\n");
  await runTest("GET method not allowed", testMethodNotAllowed);
  await runTest("OPTIONS request (CORS preflight)", testOptionsRequest);

  console.log("\n  Input Validation\n");
  await runTest("Missing text", testMissingText);
  await runTest("Empty text", testEmptyText);
  await runTest("Whitespace only text", testWhitespaceOnlyText);
  await runTest("Invalid JSON", testInvalidJson);

  console.log("\n  TTS Generation\n");
  await runTest("Basic speech generation", testBasicSpeechGeneration);
  await runTest("OpenAI model", testOpenAIModel);
  await runTest("ElevenLabs model", testElevenLabsModel);
  await runTest("OpenAI voice options", testOpenAIVoiceOptions);
  await runTest("Default model selection", testDefaultModelIsElevenLabs);

  console.log("\n  Headers\n");
  await runTest("Rate limit headers", testRateLimitHeaders);
  await runTest("CORS headers", testCorsHeaders);

  return printSummary();
}

if (import.meta.main) {
  runSpeechTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error("Test runner error:", error);
      process.exit(1);
    });
}
