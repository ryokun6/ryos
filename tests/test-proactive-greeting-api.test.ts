import { describe, expect, test } from "bun:test";
import { createRedis } from "../api/_utils/redis";
import { saveMemoryIndex, MEMORY_SCHEMA_VERSION } from "../api/_utils/_memory";
import {
  BASE_URL,
  ensureUserAuth,
  fetchWithAuth,
  makeRateLimitBypassHeaders,
  uniqueTestUsername,
} from "./test-utils";
import type { AIConversationPage } from "../src/shared/contracts/aiConversation";

/**
 * API integration tests for the server-owned proactive greeting.
 * Requires the standalone API server (`bun run dev:api`).
 */

const password = "testtest123";

interface ProactiveGreetingResponse {
  greeting: string | null;
  reason?: string;
  message?: {
    id: string;
    seq: number;
    role: string;
    parts: Array<{ type: string; text?: string }>;
    createdAt: string;
  };
  conversation?: { id: string; revision: number; canImportLegacy: boolean };
}

async function requestProactiveGreeting(
  username: string,
  token: string
): Promise<ProactiveGreetingResponse> {
  const response = await fetchWithAuth(`${BASE_URL}/api/chat`, username, token, {
    method: "POST",
    headers: makeRateLimitBypassHeaders(),
    body: JSON.stringify({ messages: [], proactiveGreeting: true }),
  });
  expect(response.status).toBe(200);
  return (await response.json()) as ProactiveGreetingResponse;
}

async function fetchConversation(
  username: string,
  token: string
): Promise<AIConversationPage> {
  const response = await fetchWithAuth(
    `${BASE_URL}/api/ai/conversations/chat`,
    username,
    token
  );
  expect(response.status).toBe(200);
  return (await response.json()) as AIConversationPage;
}

function apiMessage(
  id: string,
  role: "user" | "assistant",
  text: string,
  createdAt: string
) {
  return {
    id,
    role,
    parts: [{ type: "text", text }],
    metadata: { createdAt },
  };
}

async function seedMemory(username: string): Promise<void> {
  const redis = createRedis();
  await saveMemoryIndex(redis, username, {
    memories: [
      {
        key: "hobbies",
        summary: "loves playing chess and building mechanical keyboards",
        updatedAt: Date.now(),
      },
    ],
    version: MEMORY_SCHEMA_VERSION,
  });
}

async function importConversation(
  username: string,
  token: string,
  messages: ReturnType<typeof apiMessage>[],
  expectedRevision = 0
): Promise<Response> {
  const page = await fetchConversation(username, token);
  return fetchWithAuth(
    `${BASE_URL}/api/ai/conversations/chat/import`,
    username,
    token,
    {
      method: "POST",
      headers: makeRateLimitBypassHeaders(),
      body: JSON.stringify({
        conversationId: page.conversation.id,
        expectedRevision,
        operationId: crypto.randomUUID(),
        messages,
      }),
    }
  );
}

describe("Proactive greeting API", () => {
  test("skips the greeting when the user has no memories", async () => {
    const username = uniqueTestUsername("greetnomem");
    const token = await ensureUserAuth(username, password);
    if (!token) throw new Error("Failed to authenticate test user");

    const result = await requestProactiveGreeting(username, token);
    expect(result.greeting).toBeNull();
    expect(result.reason).toBe("no memories available");
  });

  test("skips the greeting while the conversation is active", async () => {
    const username = uniqueTestUsername("greetactive");
    const token = await ensureUserAuth(username, password);
    if (!token) throw new Error("Failed to authenticate test user");

    const now = new Date().toISOString();
    const imported = await importConversation(username, token, [
      apiMessage("u-active", "user", "hey ryo", now),
      apiMessage("a-active", "assistant", "hey!", now),
    ]);
    expect(imported.status).toBe(201);

    // Eligibility is checked before memories, so this is deterministic even
    // though the user has no memories seeded.
    const result = await requestProactiveGreeting(username, token);
    expect(result.greeting).toBeNull();
    expect(result.reason).toBe("conversation_active");
  });

  test(
    "greets a fresh conversation, persists the message, and never greets twice",
    async () => {
      const username = uniqueTestUsername("greetfresh");
      const token = await ensureUserAuth(username, password);
      if (!token) throw new Error("Failed to authenticate test user");
      await seedMemory(username);

      const result = await requestProactiveGreeting(username, token);
      expect(result.greeting).toBeTruthy();
      expect(result.message?.id.startsWith("proactive-")).toBe(true);
      expect(result.message?.role).toBe("assistant");
      expect(result.conversation?.revision).toBe(1);

      // The greeting is part of the canonical conversation.
      const page = await fetchConversation(username, token);
      expect(page.messages.length).toBe(1);
      expect(page.messages[0].id).toBe(result.message!.id);
      expect(page.messages[0].parts).toEqual([
        { type: "text", text: result.greeting! },
      ]);
      // A greeting alone must not block a legacy device from importing.
      expect(page.conversation.canImportLegacy).toBe(true);

      // Asking again is a no-op: the last message is already a greeting.
      const second = await requestProactiveGreeting(username, token);
      expect(second.greeting).toBeNull();
      expect(second.reason).toBe("already_greeted");

      // A legacy import replaces the greeting-only conversation.
      const historic = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const imported = await importConversation(
        username,
        token,
        [
          apiMessage("u-legacy", "user", "remember my chess opening?", historic),
          apiMessage("a-legacy", "assistant", "the king's gambit!", historic),
        ],
        page.conversation.revision
      );
      expect(imported.status).toBe(201);

      const afterImport = await fetchConversation(username, token);
      expect(afterImport.messages.map((message) => message.id)).toEqual([
        "u-legacy",
        "a-legacy",
      ]);
      expect(afterImport.conversation.canImportLegacy).toBe(false);
    },
    30_000
  );

  test(
    "appends the greeting to a stale conversation",
    async () => {
      const username = uniqueTestUsername("greetstale");
      const token = await ensureUserAuth(username, password);
      if (!token) throw new Error("Failed to authenticate test user");
      await seedMemory(username);

      const staleTime = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const imported = await importConversation(username, token, [
        apiMessage("u-stale", "user", "gotta run, talk later", staleTime),
        apiMessage("a-stale", "assistant", "see you!", staleTime),
      ]);
      expect(imported.status).toBe(201);

      const result = await requestProactiveGreeting(username, token);
      expect(result.greeting).toBeTruthy();
      expect(result.message?.id.startsWith("proactive-")).toBe(true);

      const page = await fetchConversation(username, token);
      expect(page.messages.map((message) => message.id)).toEqual([
        "u-stale",
        "a-stale",
        result.message!.id,
      ]);
    },
    30_000
  );
});
