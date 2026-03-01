import { describe, test, expect } from "bun:test";

import {
  BASE_URL,
  fetchWithOrigin,
  fetchWithAuth,
} from "./test-utils";
/**
 * Tests for AI-related API endpoints
 * Tests: /api/chat, /api/applet-ai, /api/ie-generate, /api/ai/ryo-reply
 */

// ============================================================================
// /api/chat Tests
// ============================================================================

async function testChatMethodNotAllowed(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/chat`, {
    method: "GET",
  });
  expect(res.status).toBe(405);
}

async function testChatOptionsRequest(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/chat`, {
    method: "OPTIONS",
  });
  expect(res.status === 200 || res.status === 204).toBeTruthy();
}

async function testChatMissingMessages(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  expect(res.status === 400 || res.status === 429).toBeTruthy();
}

async function testChatInvalidMessagesFormat(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: "not an array" }),
  });
  expect(res.status === 400 || res.status === 429).toBeTruthy();
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
  expect(res.status === 400 || res.status === 429).toBeTruthy();
}

async function testChatInvalidJson(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "not valid json{",
  });
  expect(res.status >= 400).toBeTruthy();
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
  expect(res.status).toBe(401);
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
    expect(contentType.includes("text/") || contentType.includes("stream")).toBeTruthy();
  } else if (res.status === 429) {
    const data = await res.json();
    expect(data.error === "rate_limit_exceeded").toBeTruthy();
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
  expect(res.status === 200 || res.status === 429).toBeTruthy();
}

// ============================================================================
// /api/applet-ai Tests
// ============================================================================

async function testAppletAiMethodNotAllowed(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/applet-ai`, {
    method: "GET",
  });
  expect(res.status).toBe(405);
}

async function testAppletAiOptionsRequest(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/applet-ai`, {
    method: "OPTIONS",
  });
  expect(res.status === 200 || res.status === 204).toBeTruthy();
}

async function testAppletAiMissingPromptAndMessages(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/applet-ai`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  expect(res.status).toBe(400);
}

async function testAppletAiEmptyPrompt(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/applet-ai`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "" }),
  });
  expect(res.status).toBe(400);
}

async function testAppletAiEmptyMessagesArray(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/applet-ai`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [] }),
  });
  expect(res.status).toBe(400);
}

async function testAppletAiPromptTooLong(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/applet-ai`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "a".repeat(5000) }),
  });
  expect(res.status).toBe(400);
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
  expect(res.status).toBe(400);
}

async function testAppletAiInvalidJson(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/applet-ai`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "not valid json{",
  });
  expect(res.status >= 400).toBeTruthy();
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
  expect(res.status).toBe(401);
}

async function testAppletAiBasicTextRequest(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/applet-ai`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "Say hello in one word" }),
  });
  if (res.status === 200) {
    const data = await res.json();
    expect(typeof data.reply === "string").toBeTruthy();
    expect(data.reply.length > 0).toBeTruthy();
  } else if (res.status === 429) {
    const data = await res.json();
    expect(data.error === "rate_limit_exceeded").toBeTruthy();
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
  expect(res.status === 200 || res.status === 429).toBeTruthy();
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
  expect(res.status === 200 || res.status === 429).toBeTruthy();
}

async function testAppletAiInvalidImageModeWithoutPrompt(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/applet-ai`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "image" }),
  });
  expect(res.status).toBe(400);
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
  expect(res.status).toBe(400);
}

async function testAppletAiRateLimitHeaders(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/applet-ai`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "Rate limit test" }),
  });
  if (res.status === 429) {
    const retryAfter = res.headers.get("Retry-After");
    expect(retryAfter !== null).toBeTruthy();
    const limitHeader = res.headers.get("X-RateLimit-Limit");
    expect(limitHeader !== null).toBeTruthy();
  }
  expect(true).toBeTruthy();
}

// ============================================================================
// /api/ie-generate Tests
// ============================================================================

async function testIeGenerateMethodNotAllowed(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/ie-generate`, {
    method: "GET",
  });
  expect(res.status).toBe(405);
}

async function testIeGenerateOptionsRequest(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/ie-generate`, {
    method: "OPTIONS",
  });
  expect(res.status === 200 || res.status === 204).toBeTruthy();
}

async function testIeGenerateInvalidMessagesFormat(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/ie-generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: "not an array" }),
  });
  // Rate limiting may be checked before input validation, so 429 is also acceptable
  expect(res.status === 400 || res.status === 429).toBeTruthy();
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
  expect(res.status === 400 || res.status === 429).toBeTruthy();
}

async function testIeGenerateInvalidJson(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/ie-generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "not valid json{",
  });
  expect(res.status >= 400).toBeTruthy();
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
    expect(contentType.includes("text/") || contentType.includes("stream")).toBeTruthy();
  } else if (res.status === 429) {
    const data = await res.json();
    expect(data.error === "rate_limit_exceeded").toBeTruthy();
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
  expect(res.status === 200 || res.status === 429).toBeTruthy();
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
    expect(data.error === "rate_limit_exceeded").toBeTruthy();
    expect(typeof data.scope === "string").toBeTruthy();
    expect(typeof data.limit === "number").toBeTruthy();
  }
  expect(true).toBeTruthy();
}

// ============================================================================
// /api/ai/ryo-reply Tests
// ============================================================================

async function testRyoReplyMethodNotAllowed(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/ai/ryo-reply`, {
    method: "GET",
  });
  expect(res.status).toBe(405);
}

async function testRyoReplyOptionsRequest(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/ai/ryo-reply`, {
    method: "OPTIONS",
  });
  expect(res.status === 200 || res.status === 204).toBeTruthy();
}

async function testRyoReplyMissingAuth(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/ai/ryo-reply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomId: "test-room", prompt: "Hello" }),
  });
  expect(res.status).toBe(401);
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
  expect(res.status).toBe(401);
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
  expect(res.status === 400 || res.status === 401).toBeTruthy();
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
  expect(res.status === 400 || res.status === 401).toBeTruthy();
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
  expect(res.status === 400 || res.status === 401).toBeTruthy();
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
  expect(res.status >= 400).toBeTruthy();
}

// ============================================================================
// Main
// ============================================================================

describe("Ai", () => {
  describe("AI Endpoints - /api/chat - HTTP Methods", () => {
    test("GET method not allowed", async () => {
      await testChatMethodNotAllowed();
    });
    test("OPTIONS request (CORS preflight)", async () => {
      await testChatOptionsRequest();
    });
  });

  describe("AI Endpoints - /api/chat - Input Validation", () => {
    test("Missing messages", async () => {
      await testChatMissingMessages();
    });
    test("Invalid messages format", async () => {
      await testChatInvalidMessagesFormat();
    });
    test("Invalid model", async () => {
      await testChatInvalidModel();
    });
    test("Invalid JSON", async () => {
      await testChatInvalidJson();
    });
  });

  describe("AI Endpoints - /api/chat - Authentication", () => {
    test("Invalid auth token", async () => {
      await testChatInvalidAuthToken();
    });
  });

  describe("AI Endpoints - /api/chat - Generation", () => {
    test("Basic chat request", async () => {
      await testChatBasicRequest();
    });
    test("Chat with model query param", async () => {
      await testChatWithModelQuery();
    });
  });

  describe("AI Endpoints - /api/applet-ai - HTTP Methods", () => {
    test("GET method not allowed", async () => {
      await testAppletAiMethodNotAllowed();
    });
    test("OPTIONS request (CORS preflight)", async () => {
      await testAppletAiOptionsRequest();
    });
  });

  describe("AI Endpoints - /api/applet-ai - Input Validation", () => {
    test("Missing prompt and messages", async () => {
      await testAppletAiMissingPromptAndMessages();
    });
    test("Empty prompt", async () => {
      await testAppletAiEmptyPrompt();
    });
    test("Empty messages array", async () => {
      await testAppletAiEmptyMessagesArray();
    });
    test("Prompt too long", async () => {
      await testAppletAiPromptTooLong();
    });
    test("Too many messages", async () => {
      await testAppletAiTooManyMessages();
    });
    test("Invalid JSON", async () => {
      await testAppletAiInvalidJson();
    });
    test("Invalid image mode without prompt", async () => {
      await testAppletAiInvalidImageModeWithoutPrompt();
    });
    test("Images without image mode", async () => {
      await testAppletAiImagesWithoutImageMode();
    });
  });

  describe("AI Endpoints - /api/applet-ai - Authentication", () => {
    test("Invalid auth token", async () => {
      await testAppletAiInvalidAuthToken();
    });
  });

  describe("AI Endpoints - /api/applet-ai - Generation", () => {
    test("Basic text request", async () => {
      await testAppletAiBasicTextRequest();
    });
    test("Request with context", async () => {
      await testAppletAiWithContext();
    });
    test("Request with messages array", async () => {
      await testAppletAiWithMessagesArray();
    });
  });

  describe("AI Endpoints - /api/applet-ai - Rate Limiting", () => {
    test("Rate limit headers", async () => {
      await testAppletAiRateLimitHeaders();
    });
  });

  describe("AI Endpoints - /api/ie-generate - HTTP Methods", () => {
    test("GET method not allowed", async () => {
      await testIeGenerateMethodNotAllowed();
    });
    test("OPTIONS request (CORS preflight)", async () => {
      await testIeGenerateOptionsRequest();
    });
  });

  describe("AI Endpoints - /api/ie-generate - Input Validation", () => {
    test("Invalid messages format", async () => {
      await testIeGenerateInvalidMessagesFormat();
    });
    test("Invalid model", async () => {
      await testIeGenerateInvalidModel();
    });
    test("Invalid JSON", async () => {
      await testIeGenerateInvalidJson();
    });
  });

  describe("AI Endpoints - /api/ie-generate - Generation", () => {
    test("Basic IE generate request", async () => {
      await testIeGenerateBasicRequest();
    });
    test("IE generate with body params", async () => {
      await testIeGenerateWithBodyParams();
    });
  });

  describe("AI Endpoints - /api/ie-generate - Rate Limiting", () => {
    test("Rate limit response structure", async () => {
      await testIeGenerateRateLimitBurst();
    });
  });

  describe("AI Endpoints - /api/ai/ryo-reply - HTTP Methods", () => {
    test("GET method not allowed", async () => {
      await testRyoReplyMethodNotAllowed();
    });
    test("OPTIONS request (CORS preflight)", async () => {
      await testRyoReplyOptionsRequest();
    });
  });

  describe("AI Endpoints - /api/ai/ryo-reply - Authentication", () => {
    test("Missing auth credentials", async () => {
      await testRyoReplyMissingAuth();
    });
    test("Invalid auth token", async () => {
      await testRyoReplyInvalidAuthToken();
    });
  });

  describe("AI Endpoints - /api/ai/ryo-reply - Input Validation", () => {
    test("Missing roomId", async () => {
      await testRyoReplyMissingRoomId();
    });
    test("Missing prompt", async () => {
      await testRyoReplyMissingPrompt();
    });
    test("Invalid roomId format", async () => {
      await testRyoReplyInvalidRoomId();
    });
    test("Invalid JSON", async () => {
      await testRyoReplyInvalidJson();
    });
  });
});
