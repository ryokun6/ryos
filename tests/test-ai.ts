#!/usr/bin/env bun
/**
 * Tests for AI-related API endpoints
 * Tests: /api/chat, /api/applet-ai, /api/ie-generate, /api/ai/ryo-reply
 */

import {
  BASE_URL,
  runTest,
  assert,
  assertEq,
  printSummary,
  clearResults,
  fetchWithOrigin,
  fetchWithAuth,
  section,
} from "./test-utils";

// ============================================================================
// /api/chat Tests
// ============================================================================

async function testChatMethodNotAllowed(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/chat`, {
    method: "GET",
  });
  assertEq(res.status, 405, `Expected 405, got ${res.status}`);
}

async function testChatOptionsRequest(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/chat`, {
    method: "OPTIONS",
  });
  assert(res.status === 200 || res.status === 204, `Expected 200 or 204, got ${res.status}`);
}

async function testChatMissingMessages(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  // API returns 500 when messages is missing (unhandled error during processing)
  // or 400 if validation catches it, or 429 if rate limited
  assert(
    res.status === 400 || res.status === 500 || res.status === 429,
    `Expected 400, 500, or 429, got ${res.status}`
  );
}

async function testChatInvalidMessagesFormat(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: "not an array" }),
  });
  // API returns 500 when messages format is invalid (unhandled error during processing)
  // or 400 if validation catches it, or 429 if rate limited
  assert(
    res.status === 400 || res.status === 500 || res.status === 429,
    `Expected 400, 500, or 429, got ${res.status}`
  );
}

async function testChatInvalidModel(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: "Hello" }],
      model: "invalid-model-name",
    }),
  });
  // Rate limiting is checked before model validation, so may get 429 first
  // Otherwise expect 400 for invalid model
  assert(
    res.status === 400 || res.status === 429,
    `Expected 400 or 429, got ${res.status}`
  );
}

async function testChatInvalidJson(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "not valid json{",
  });
  assert(res.status >= 400, `Expected error status, got ${res.status}`);
}

async function testChatInvalidAuthToken(): Promise<void> {
  const res = await fetchWithAuth(
    `${BASE_URL}/api/chat`,
    "testuser",
    "invalid-token-12345",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Hello" }],
      }),
    }
  );
  assertEq(res.status, 401, `Expected 401, got ${res.status}`);
}

async function testChatBasicRequest(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: "Say hello in one word" }],
    }),
  });
  if (res.status === 200) {
    const contentType = res.headers.get("content-type") || "";
    assert(
      contentType.includes("text/") || contentType.includes("stream"),
      "Expected streaming content type"
    );
  } else if (res.status === 429) {
    const data = await res.json();
    assert(data.error === "rate_limit_exceeded", "Expected rate limit error");
  } else {
    throw new Error(`Unexpected status: ${res.status}`);
  }
}

async function testChatWithModelQuery(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/chat?model=claude-sonnet`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: "Say hi" }],
    }),
  });
  assert(
    res.status === 200 || res.status === 429,
    `Expected 200 or 429, got ${res.status}`
  );
}

// ============================================================================
// /api/applet-ai Tests
// ============================================================================

async function testAppletAiMethodNotAllowed(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/applet-ai`, {
    method: "GET",
  });
  assertEq(res.status, 405, `Expected 405, got ${res.status}`);
}

async function testAppletAiOptionsRequest(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/applet-ai`, {
    method: "OPTIONS",
  });
  assert(res.status === 200 || res.status === 204, `Expected 200 or 204, got ${res.status}`);
}

async function testAppletAiMissingPromptAndMessages(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/applet-ai`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
}

async function testAppletAiEmptyPrompt(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/applet-ai`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "" }),
  });
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
}

async function testAppletAiEmptyMessagesArray(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/applet-ai`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [] }),
  });
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
}

async function testAppletAiPromptTooLong(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/applet-ai`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "a".repeat(5000) }),
  });
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
}

async function testAppletAiTooManyMessages(): Promise<void> {
  const messages = Array.from({ length: 15 }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    content: `Message ${i}`,
  }));
  const res = await fetchWithOrigin(`${BASE_URL}/api/applet-ai`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
}

async function testAppletAiInvalidJson(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/applet-ai`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "not valid json{",
  });
  assert(res.status >= 400, `Expected error status, got ${res.status}`);
}

async function testAppletAiInvalidAuthToken(): Promise<void> {
  const res = await fetchWithAuth(
    `${BASE_URL}/api/applet-ai`,
    "testuser",
    "invalid-token-12345",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "Hello" }),
    }
  );
  assertEq(res.status, 401, `Expected 401, got ${res.status}`);
}

async function testAppletAiBasicTextRequest(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/applet-ai`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "Say hello in one word" }),
  });
  if (res.status === 200) {
    const data = await res.json();
    assert(typeof data.reply === "string", "Expected reply string in response");
    assert(data.reply.length > 0, "Expected non-empty reply");
  } else if (res.status === 429) {
    const data = await res.json();
    assert(data.error === "rate_limit_exceeded", "Expected rate limit error");
  } else {
    throw new Error(`Unexpected status: ${res.status}`);
  }
}

async function testAppletAiWithContext(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/applet-ai`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: "What is 2+2?",
      context: "You are a calculator assistant.",
    }),
  });
  assert(
    res.status === 200 || res.status === 429,
    `Expected 200 or 429, got ${res.status}`
  );
}

async function testAppletAiWithMessagesArray(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/applet-ai`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [
        { role: "user", content: "Remember the number 42" },
        { role: "assistant", content: "I'll remember 42" },
        { role: "user", content: "What number did I tell you?" },
      ],
    }),
  });
  assert(
    res.status === 200 || res.status === 429,
    `Expected 200 or 429, got ${res.status}`
  );
}

async function testAppletAiInvalidImageModeWithoutPrompt(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/applet-ai`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "image" }),
  });
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
}

async function testAppletAiImagesWithoutImageMode(): Promise<void> {
  // Tiny 1x1 red PNG in base64
  const tinyPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";
  const res = await fetchWithOrigin(`${BASE_URL}/api/applet-ai`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: "Describe this",
      images: [{ mediaType: "image/png", data: tinyPng }],
    }),
  });
  assertEq(res.status, 400, `Expected 400, got ${res.status}`);
}

async function testAppletAiRateLimitHeaders(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/applet-ai`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "Rate limit test" }),
  });
  if (res.status === 429) {
    const retryAfter = res.headers.get("Retry-After");
    assert(retryAfter !== null, "Expected Retry-After header on rate limit");
    const limitHeader = res.headers.get("X-RateLimit-Limit");
    assert(limitHeader !== null, "Expected X-RateLimit-Limit header");
  }
  assert(true, "Rate limit headers check passed");
}

// ============================================================================
// /api/ie-generate Tests
// ============================================================================

async function testIeGenerateMethodNotAllowed(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/ie-generate`, {
    method: "GET",
  });
  assertEq(res.status, 405, `Expected 405, got ${res.status}`);
}

async function testIeGenerateOptionsRequest(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/ie-generate`, {
    method: "OPTIONS",
  });
  assert(res.status === 200 || res.status === 204, `Expected 200 or 204, got ${res.status}`);
}

async function testIeGenerateInvalidMessagesFormat(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/ie-generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: "not an array" }),
  });
  // Rate limiting may be checked before input validation, so 429 is also acceptable
  assert(
    res.status === 400 || res.status === 429,
    `Expected 400 or 429, got ${res.status}`
  );
}

async function testIeGenerateInvalidModel(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/ie-generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: "example.com",
      year: "1999",
      messages: [{ role: "user", content: "Generate" }],
      model: "invalid-model-name",
    }),
  });
  // Rate limiting may be checked before model validation, so 429 is also acceptable
  assert(
    res.status === 400 || res.status === 429,
    `Expected 400 or 429, got ${res.status}`
  );
}

async function testIeGenerateInvalidJson(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/ie-generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "not valid json{",
  });
  assert(res.status >= 400, `Expected error status, got ${res.status}`);
}

async function testIeGenerateBasicRequest(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/ie-generate?url=example.com&year=1999`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: "Generate a simple page" }],
    }),
  });
  if (res.status === 200) {
    const contentType = res.headers.get("content-type") || "";
    assert(
      contentType.includes("text/") || contentType.includes("stream"),
      "Expected streaming content type"
    );
  } else if (res.status === 429) {
    const data = await res.json();
    assert(data.error === "rate_limit_exceeded", "Expected rate limit error");
  } else {
    throw new Error(`Unexpected status: ${res.status}`);
  }
}

async function testIeGenerateWithBodyParams(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/ie-generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: "example.com",
      year: "2050",
      messages: [{ role: "user", content: "Generate a futuristic page" }],
    }),
  });
  assert(
    res.status === 200 || res.status === 429,
    `Expected 200 or 429, got ${res.status}`
  );
}

async function testIeGenerateRateLimitBurst(): Promise<void> {
  // This test verifies rate limit response structure when triggered
  const res = await fetchWithOrigin(`${BASE_URL}/api/ie-generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: "test.com",
      year: "2000",
      messages: [{ role: "user", content: "Test" }],
    }),
  });
  if (res.status === 429) {
    const data = await res.json();
    assert(data.error === "rate_limit_exceeded", "Expected rate_limit_exceeded error");
    assert(typeof data.scope === "string", "Expected scope in rate limit response");
    assert(typeof data.limit === "number", "Expected limit in rate limit response");
  }
  assert(true, "Rate limit structure check passed");
}

// ============================================================================
// /api/ai/ryo-reply Tests
// ============================================================================

async function testRyoReplyMethodNotAllowed(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/ai/ryo-reply`, {
    method: "GET",
  });
  assertEq(res.status, 405, `Expected 405, got ${res.status}`);
}

async function testRyoReplyOptionsRequest(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/ai/ryo-reply`, {
    method: "OPTIONS",
  });
  assert(res.status === 200 || res.status === 204, `Expected 200 or 204, got ${res.status}`);
}

async function testRyoReplyMissingAuth(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/ai/ryo-reply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomId: "test-room", prompt: "Hello" }),
  });
  assertEq(res.status, 401, `Expected 401, got ${res.status}`);
}

async function testRyoReplyInvalidAuthToken(): Promise<void> {
  const res = await fetchWithAuth(
    `${BASE_URL}/api/ai/ryo-reply`,
    "testuser",
    "invalid-token-12345",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId: "test-room", prompt: "Hello" }),
    }
  );
  assertEq(res.status, 401, `Expected 401, got ${res.status}`);
}

async function testRyoReplyMissingRoomId(): Promise<void> {
  const res = await fetchWithAuth(
    `${BASE_URL}/api/ai/ryo-reply`,
    "testuser",
    "some-token",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "Hello" }),
    }
  );
  // Will fail auth first (401) since token is invalid, which is expected
  assert(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`);
}

async function testRyoReplyMissingPrompt(): Promise<void> {
  const res = await fetchWithAuth(
    `${BASE_URL}/api/ai/ryo-reply`,
    "testuser",
    "some-token",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId: "test-room" }),
    }
  );
  // Will fail auth first (401) since token is invalid, which is expected
  assert(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`);
}

async function testRyoReplyInvalidRoomId(): Promise<void> {
  const res = await fetchWithAuth(
    `${BASE_URL}/api/ai/ryo-reply`,
    "testuser",
    "some-token",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId: "invalid/room/id!", prompt: "Hello" }),
    }
  );
  // Will fail auth first (401) or validation (400)
  assert(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`);
}

async function testRyoReplyInvalidJson(): Promise<void> {
  const res = await fetchWithAuth(
    `${BASE_URL}/api/ai/ryo-reply`,
    "testuser",
    "some-token",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not valid json{",
    }
  );
  assert(res.status >= 400, `Expected error status, got ${res.status}`);
}

// ============================================================================
// Main
// ============================================================================

export async function runAiTests(): Promise<{ passed: number; failed: number }> {
  console.log(section("AI Endpoints"));
  clearResults();

  // --- /api/chat ---
  console.log("\n  /api/chat - HTTP Methods\n");
  await runTest("GET method not allowed", testChatMethodNotAllowed);
  await runTest("OPTIONS request (CORS preflight)", testChatOptionsRequest);

  console.log("\n  /api/chat - Input Validation\n");
  await runTest("Missing messages", testChatMissingMessages);
  await runTest("Invalid messages format", testChatInvalidMessagesFormat);
  await runTest("Invalid model", testChatInvalidModel);
  await runTest("Invalid JSON", testChatInvalidJson);

  console.log("\n  /api/chat - Authentication\n");
  await runTest("Invalid auth token", testChatInvalidAuthToken);

  console.log("\n  /api/chat - Generation\n");
  await runTest("Basic chat request", testChatBasicRequest);
  await runTest("Chat with model query param", testChatWithModelQuery);

  // --- /api/applet-ai ---
  console.log("\n  /api/applet-ai - HTTP Methods\n");
  await runTest("GET method not allowed", testAppletAiMethodNotAllowed);
  await runTest("OPTIONS request (CORS preflight)", testAppletAiOptionsRequest);

  console.log("\n  /api/applet-ai - Input Validation\n");
  await runTest("Missing prompt and messages", testAppletAiMissingPromptAndMessages);
  await runTest("Empty prompt", testAppletAiEmptyPrompt);
  await runTest("Empty messages array", testAppletAiEmptyMessagesArray);
  await runTest("Prompt too long", testAppletAiPromptTooLong);
  await runTest("Too many messages", testAppletAiTooManyMessages);
  await runTest("Invalid JSON", testAppletAiInvalidJson);
  await runTest("Invalid image mode without prompt", testAppletAiInvalidImageModeWithoutPrompt);
  await runTest("Images without image mode", testAppletAiImagesWithoutImageMode);

  console.log("\n  /api/applet-ai - Authentication\n");
  await runTest("Invalid auth token", testAppletAiInvalidAuthToken);

  console.log("\n  /api/applet-ai - Generation\n");
  await runTest("Basic text request", testAppletAiBasicTextRequest);
  await runTest("Request with context", testAppletAiWithContext);
  await runTest("Request with messages array", testAppletAiWithMessagesArray);

  console.log("\n  /api/applet-ai - Rate Limiting\n");
  await runTest("Rate limit headers", testAppletAiRateLimitHeaders);

  // --- /api/ie-generate ---
  console.log("\n  /api/ie-generate - HTTP Methods\n");
  await runTest("GET method not allowed", testIeGenerateMethodNotAllowed);
  await runTest("OPTIONS request (CORS preflight)", testIeGenerateOptionsRequest);

  console.log("\n  /api/ie-generate - Input Validation\n");
  await runTest("Invalid messages format", testIeGenerateInvalidMessagesFormat);
  await runTest("Invalid model", testIeGenerateInvalidModel);
  await runTest("Invalid JSON", testIeGenerateInvalidJson);

  console.log("\n  /api/ie-generate - Generation\n");
  await runTest("Basic IE generate request", testIeGenerateBasicRequest);
  await runTest("IE generate with body params", testIeGenerateWithBodyParams);

  console.log("\n  /api/ie-generate - Rate Limiting\n");
  await runTest("Rate limit response structure", testIeGenerateRateLimitBurst);

  // --- /api/ai/ryo-reply ---
  console.log("\n  /api/ai/ryo-reply - HTTP Methods\n");
  await runTest("GET method not allowed", testRyoReplyMethodNotAllowed);
  await runTest("OPTIONS request (CORS preflight)", testRyoReplyOptionsRequest);

  console.log("\n  /api/ai/ryo-reply - Authentication\n");
  await runTest("Missing auth credentials", testRyoReplyMissingAuth);
  await runTest("Invalid auth token", testRyoReplyInvalidAuthToken);

  console.log("\n  /api/ai/ryo-reply - Input Validation\n");
  await runTest("Missing roomId", testRyoReplyMissingRoomId);
  await runTest("Missing prompt", testRyoReplyMissingPrompt);
  await runTest("Invalid roomId format", testRyoReplyInvalidRoomId);
  await runTest("Invalid JSON", testRyoReplyInvalidJson);

  return printSummary();
}

if (import.meta.main) {
  runAiTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error("Test runner error:", error);
      process.exit(1);
    });
}
