import { describe, test, expect, beforeAll } from "bun:test";

import {
  BASE_URL,
  fetchWithOrigin,
  fetchWithAuth,
  ensureUserAuth,
} from "../../helpers/test-utils";

// A real authenticated user so the ryo-reply input-validation tests actually
// reach the validation branches (with an invalid token they only ever got
// 401, so the 400 paths were never exercised). Created fresh per run to avoid
// the per-user 5/min rate limit accumulating across re-runs.
const ryoReplyUsername = `tuser${Date.now()}`;
let ryoReplyToken: string | null = null;
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
  expect([200, 204]).toContain(res.status);
}

async function testChatMissingMessages(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  expect([400, 429]).toContain(res.status);
}

async function testChatInvalidMessagesFormat(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: "not an array" }),
  });
  expect([400, 429]).toContain(res.status);
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
  expect([400, 429]).toContain(res.status);
}

async function testChatInvalidJson(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "not valid json{",
  });
  expect(res.status).toBeGreaterThanOrEqual(400);
}

async function testChatInvalidAuthToken(): Promise<void> {
  // /api/chat uses optional auth: invalid (stale-cookie) credentials are
  // ignored and the request proceeds anonymously, so it succeeds or hits the
  // anonymous rate limit — it must not 401.
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
  expect([200, 429]).toContain(res.status);
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
    expect(contentType).toMatch(/text\/|stream/);
  } else if (res.status === 429) {
    const data = await res.json();
    expect(data.error).toBe("rate_limit_exceeded");
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
  expect([200, 429]).toContain(res.status);
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
  expect([200, 204]).toContain(res.status);
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
  expect(res.status).toBeGreaterThanOrEqual(400);
}

async function testAppletAiInvalidAuthToken(): Promise<void> {
  // Optional auth: invalid credentials fall back to anonymous instead of 401.
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
  expect([200, 429]).toContain(res.status);
}

async function testAppletAiBasicTextRequest(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/applet-ai`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "Say hello in one word" }),
  });
  if (res.status === 200) {
    const data = await res.json();
    expect(typeof data.reply).toBe("string");
    expect(data.reply.length).toBeGreaterThan(0);
  } else if (res.status === 429) {
    const data = await res.json();
    expect(data.error).toBe("rate_limit_exceeded");
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
  expect([200, 429]).toContain(res.status);
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
  expect([200, 429]).toContain(res.status);
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
  expect([200, 400, 429]).toContain(res.status);
  if (res.status === 429) {
    const retryAfter = res.headers.get("Retry-After");
    expect(retryAfter).not.toBeNull();
    const limitHeader = res.headers.get("X-RateLimit-Limit");
    expect(limitHeader).not.toBeNull();
  }
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
  expect([200, 204]).toContain(res.status);
}

async function testIeGenerateInvalidMessagesFormat(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/ie-generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: "not an array" }),
  });
  // Rate limiting may be checked before input validation, so 429 is also acceptable
  expect([400, 429]).toContain(res.status);
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
  expect([400, 429]).toContain(res.status);
}

async function testIeGenerateInvalidJson(): Promise<void> {
  const res = await fetchWithOrigin(`${BASE_URL}/api/ie-generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "not valid json{",
  });
  expect(res.status).toBeGreaterThanOrEqual(400);
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
    expect(contentType).toMatch(/text\/|stream/);
  } else if (res.status === 429) {
    const data = await res.json();
    expect(data.error).toBe("rate_limit_exceeded");
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
  expect([200, 429]).toContain(res.status);
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
  expect([200, 400, 429]).toContain(res.status);
  if (res.status === 429) {
    const data = await res.json();
    expect(data.error).toBe("rate_limit_exceeded");
    expect(typeof data.scope).toBe("string");
    expect(typeof data.limit).toBe("number");
  }
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
  expect([200, 204]).toContain(res.status);
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

async function testRyoReplyBlankRoomId(): Promise<void> {
  // A blank roomId fails ROOM_ID_REGEX validation -> 400.
  const res = await fetchWithAuth(
    `${BASE_URL}/api/ai/ryo-reply`,
    ryoReplyUsername,
    ryoReplyToken ?? "",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId: "", prompt: "Hello" }),
    }
  );
  expect(res.status).toBe(400);
}

async function testRyoReplyMissingPrompt(): Promise<void> {
  const res = await fetchWithAuth(
    `${BASE_URL}/api/ai/ryo-reply`,
    ryoReplyUsername,
    ryoReplyToken ?? "",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId: "testroom123" }),
    }
  );
  expect(res.status).toBe(400);
}

async function testRyoReplyInvalidRoomId(): Promise<void> {
  const res = await fetchWithAuth(
    `${BASE_URL}/api/ai/ryo-reply`,
    ryoReplyUsername,
    ryoReplyToken ?? "",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId: "invalid/room/id!", prompt: "Hello" }),
    }
  );
  expect(res.status).toBe(400);
}

async function testRyoReplyInvalidJson(): Promise<void> {
  const res = await fetchWithAuth(
    `${BASE_URL}/api/ai/ryo-reply`,
    ryoReplyUsername,
    ryoReplyToken ?? "",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not valid json{",
    }
  );
  expect(res.status).toBe(400);
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
    beforeAll(async () => {
      ryoReplyToken = await ensureUserAuth(ryoReplyUsername, "passw0rd123");
    });

    test("Blank roomId", async () => {
      await testRyoReplyBlankRoomId();
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
