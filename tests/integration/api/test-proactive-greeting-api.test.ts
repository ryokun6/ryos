import { describe, expect, test } from "bun:test";
import { createRedis } from "../../../api/_utils/redis";
import { saveMemoryIndex, MEMORY_SCHEMA_VERSION } from "../../../api/_utils/_memory";
import {
  beginAIConversationTurn,
  completeAIConversationTurn,
  getAIConversationTurnCompletionOperationId,
} from "../../../api/ai/conversations/_helpers/store";
import {
  BASE_URL,
  ensureUserAuth,
  fetchWithAuth,
  fetchWithOrigin,
  makeRateLimitBypassHeaders,
  uniqueTestUsername,
} from "../../helpers/test-utils";
import type { AIConversationSnapshot } from "../../../src/shared/contracts/aiConversation";

/**
 * API integration tests for the server-owned proactive greeting endpoint
 * (`POST /api/ai/conversations/chat/greeting`).
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
  conversation?: { id: string; revision: number };
}

async function requestProactiveGreeting(
  username: string,
  token: string
): Promise<ProactiveGreetingResponse> {
  const response = await fetchWithAuth(
    `${BASE_URL}/api/ai/conversations/chat/greeting`,
    username,
    token,
    {
      method: "POST",
      headers: makeRateLimitBypassHeaders(),
      body: JSON.stringify({ operationId: crypto.randomUUID() }),
    }
  );
  expect(response.status).toBe(200);
  return (await response.json()) as ProactiveGreetingResponse;
}

async function fetchSnapshot(
  username: string,
  token: string
): Promise<AIConversationSnapshot> {
  const response = await fetchWithAuth(
    `${BASE_URL}/api/ai/conversations/chat`,
    username,
    token
  );
  expect(response.status).toBe(200);
  return (await response.json()) as AIConversationSnapshot;
}

function storeMessage(
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

/**
 * Seed one user+assistant turn straight through the store (the server and
 * this test share the same Redis), pinning message timestamps so greeting
 * eligibility is deterministic.
 */
async function seedTurn(
  username: string,
  turnId: string,
  userText: string,
  assistantText: string,
  createdAt: string
): Promise<void> {
  const redis = createRedis();
  const begun = await beginAIConversationTurn({
    redis,
    username,
    channel: "chat",
    operationId: turnId,
    action: {
      kind: "user-message",
      message: storeMessage(`${turnId}-user`, "user", userText, createdAt),
    },
  });
  await completeAIConversationTurn({
    redis,
    username,
    channel: "chat",
    operationId: getAIConversationTurnCompletionOperationId(turnId),
    expectedConversationId: begun.document.id,
    responseMessage: storeMessage(
      `${turnId}-assistant`,
      "assistant",
      assistantText,
      createdAt
    ),
  });
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

describe("Proactive greeting API", () => {
  test("requires authentication", async () => {
    const response = await fetchWithOrigin(
      `${BASE_URL}/api/ai/conversations/chat/greeting`,
      {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({}),
      }
    );
    expect(response.status).toBe(401);
  });

  test("exists only for the chat channel", async () => {
    const username = uniqueTestUsername("greetchan");
    const token = await ensureUserAuth(username, password);
    if (!token) throw new Error("Failed to authenticate test user");

    const response = await fetchWithAuth(
      `${BASE_URL}/api/ai/conversations/assistant/greeting`,
      username,
      token,
      {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({}),
      }
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "conversation_channel_not_found",
    });
  });

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
    await seedTurn(username, "turn-active", "hey ryo", "hey!", now);

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
      const snapshot = await fetchSnapshot(username, token);
      expect(snapshot.messages.length).toBe(1);
      expect(snapshot.messages[0].id).toBe(result.message!.id);
      expect(snapshot.messages[0].parts).toEqual([
        { type: "text", text: result.greeting! },
      ]);
      expect(snapshot.conversation.id).toBe(result.conversation!.id);

      // Asking again is a no-op: the last message is already a greeting.
      const second = await requestProactiveGreeting(username, token);
      expect(second.greeting).toBeNull();
      expect(second.reason).toBe("already_greeted");
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
      await seedTurn(
        username,
        "turn-stale",
        "gotta run, talk later",
        "see you!",
        staleTime
      );

      const result = await requestProactiveGreeting(username, token);
      expect(result.greeting).toBeTruthy();
      expect(result.message?.id.startsWith("proactive-")).toBe(true);

      const snapshot = await fetchSnapshot(username, token);
      expect(snapshot.messages.map((message) => message.id)).toEqual([
        "turn-stale-user",
        "turn-stale-assistant",
        result.message!.id,
      ]);
    },
    30_000
  );
});
