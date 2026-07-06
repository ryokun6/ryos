import { describe, expect, test } from "bun:test";
import {
  AIConversationError,
  getAIConversationPage,
  resetAIConversation,
  sanitizeAIConversationMessages,
  syncAIConversationMessages,
  type AIConversationRedis,
} from "../api/ai/conversations/_helpers/store";
import { ASSISTANT_SUMMON_MESSAGE } from "../src/shared/assistantGreeting";

class MemoryConversationRedis implements AIConversationRedis {
  private readonly values = new Map<string, unknown>();

  async get<T = unknown>(key: string): Promise<T | null> {
    const value = this.values.get(key);
    return value === undefined ? null : structuredClone(value) as T;
  }

  async set(
    key: string,
    value: unknown,
    options?: { ex?: number; nx?: boolean }
  ): Promise<"OK" | null> {
    if (options?.nx && this.values.has(key)) return null;
    this.values.set(key, structuredClone(value));
    return "OK";
  }

  async del(...keys: string[]): Promise<number> {
    let deleted = 0;
    for (const key of keys) {
      if (this.values.delete(key)) deleted += 1;
    }
    return deleted;
  }

  async expire(key: string, _seconds: number): Promise<number> {
    return this.values.has(key) ? 1 : 0;
  }
}

function message(
  id: string,
  role: "user" | "assistant",
  text: string,
  createdAt = "2026-07-06T00:00:00.000Z"
) {
  return {
    id,
    role,
    parts: [{ type: "text", text }],
    metadata: { createdAt },
  };
}

describe("AI conversation store", () => {
  test("projects safe text and drops synthetic or unsupported messages", () => {
    expect(
      sanitizeAIConversationMessages([
        { id: "system", role: "system", parts: [{ type: "text", text: "x" }] },
        message("summon", "user", ASSISTANT_SUMMON_MESSAGE),
        message("1", "assistant", "Local greeting"),
        {
          ...message("user", "user", "Visible"),
          parts: [
            { type: "reasoning", text: "private" },
            { type: "text", text: "Visible" },
            { type: "tool-read", output: "large secret" },
          ],
        },
        message("assistant", "assistant", "Reply"),
      ])
    ).toEqual([
      {
        id: "user",
        role: "user",
        parts: [{ type: "text", text: "Visible" }],
        createdAt: "2026-07-06T00:00:00.000Z",
      },
      {
        id: "assistant",
        role: "assistant",
        parts: [{ type: "text", text: "Reply" }],
        createdAt: "2026-07-06T00:00:00.000Z",
      },
    ]);
  });

  test("appends idempotently with revisions and stable cursor pagination", async () => {
    const redis = new MemoryConversationRedis();
    const initial = await getAIConversationPage({
      redis,
      username: "alice",
      channel: "chat",
      limit: 10,
    });

    const first = await syncAIConversationMessages({
      redis,
      username: "alice",
      channel: "chat",
      expectedConversationId: initial.conversation.id,
      expectedRevision: 0,
      operationId: "turn-1",
      messages: [
        message("u1", "user", "one"),
        message("a1", "assistant", "two"),
      ],
    });
    expect(first.revision).toBe(1);

    const replay = await syncAIConversationMessages({
      redis,
      username: "alice",
      channel: "chat",
      expectedConversationId: initial.conversation.id,
      expectedRevision: 0,
      operationId: "turn-1",
      messages: [message("u1", "user", "different replay payload")],
    });
    expect(replay.revision).toBe(1);
    expect(replay.messages).toHaveLength(2);

    const second = await syncAIConversationMessages({
      redis,
      username: "alice",
      channel: "chat",
      expectedConversationId: initial.conversation.id,
      expectedRevision: 1,
      operationId: "turn-2",
      messages: [message("u2", "user", "three")],
    });
    expect(second.revision).toBe(2);

    const newest = await getAIConversationPage({
      redis,
      username: "alice",
      channel: "chat",
      limit: 2,
    });
    expect(newest.messages.map((entry) => entry.id)).toEqual(["a1", "u2"]);
    expect(newest.page.hasMore).toBe(true);

    const older = await getAIConversationPage({
      redis,
      username: "alice",
      channel: "chat",
      limit: 2,
      cursor: newest.page.nextCursor ?? undefined,
    });
    expect(older.messages.map((entry) => entry.id)).toEqual(["u1"]);
    expect(older.page.hasMore).toBe(false);
  });

  test("rejects stale revisions and user-message id reuse", async () => {
    const redis = new MemoryConversationRedis();
    const initial = await getAIConversationPage({
      redis,
      username: "alice",
      channel: "chat",
      limit: 10,
    });
    await syncAIConversationMessages({
      redis,
      username: "alice",
      channel: "chat",
      expectedConversationId: initial.conversation.id,
      expectedRevision: 0,
      operationId: "first",
      messages: [message("u1", "user", "original")],
    });

    await expect(
      syncAIConversationMessages({
        redis,
        username: "alice",
        channel: "chat",
        expectedConversationId: initial.conversation.id,
        expectedRevision: 0,
        operationId: "stale",
        messages: [message("u2", "user", "stale")],
      })
    ).rejects.toMatchObject({
      code: "revision_conflict",
      status: 409,
    });

    await expect(
      syncAIConversationMessages({
        redis,
        username: "alice",
        channel: "chat",
        expectedConversationId: initial.conversation.id,
        operationId: "reuse",
        messages: [message("u1", "user", "mutated")],
      })
    ).rejects.toBeInstanceOf(AIConversationError);
  });

  test("rotates conversation ids and makes reset idempotent", async () => {
    const redis = new MemoryConversationRedis();
    const initial = await getAIConversationPage({
      redis,
      username: "alice",
      channel: "assistant",
      limit: 10,
    });
    await syncAIConversationMessages({
      redis,
      username: "alice",
      channel: "assistant",
      operationId: "seed",
      messages: [message("u1", "user", "hello")],
    });

    const reset = await resetAIConversation({
      redis,
      username: "alice",
      channel: "assistant",
      conversationId: initial.conversation.id,
      operationId: "reset-1",
    });
    expect(reset.reset).toBe(true);
    expect(reset.document.id).not.toBe(initial.conversation.id);
    expect(reset.document.messages).toEqual([]);

    const replay = await resetAIConversation({
      redis,
      username: "alice",
      channel: "assistant",
      conversationId: initial.conversation.id,
      operationId: "reset-1",
    });
    expect(replay.reset).toBe(false);
    expect(replay.document.id).toBe(reset.document.id);
  });

  test("bounds retained history without resetting sequence numbers", async () => {
    const redis = new MemoryConversationRedis();
    const messages = Array.from({ length: 205 }, (_, index) =>
      message(`u${index}`, "user", `message ${index}`)
    );

    const document = await syncAIConversationMessages({
      redis,
      username: "alice",
      channel: "chat",
      operationId: "bulk-import",
      messages,
    });

    expect(document.messages).toHaveLength(200);
    expect(document.messages[0]?.seq).toBe(6);
    expect(document.messages.at(-1)?.seq).toBe(205);
    expect(document.historyTruncated).toBe(true);
  });
});
