import { describe, expect, test } from "bun:test";
import {
  AIConversationError,
  commitAIConversationRegeneration,
  clearAIConversationTombstone,
  deleteAIConversationKeys,
  getAIConversationPage,
  prepareAIConversationRegeneration,
  releaseAIConversationTurn,
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

  async eval<T = unknown>(
    script: string,
    keys: string[],
    args: Array<string | number>
  ): Promise<T> {
    let result: number;
    if (script.includes('redis.call("EXISTS", KEYS[2])')) {
      if (this.values.get(keys[0] ?? "") !== args[0]) {
        result = -1;
      } else if (this.values.has(keys[1] ?? "")) {
        result = -2;
      } else {
        this.values.set(keys[2] ?? "", String(args[1]));
        result = 1;
      }
    } else if (this.values.get(keys[0] ?? "") === args[0]) {
      this.values.delete(keys[0] ?? "");
      result = 1;
    } else {
      result = 0;
    }
    return result as T;
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

    await expect(
      syncAIConversationMessages({
        redis,
        username: "alice",
        channel: "assistant",
        expectedConversationId: reset.document.id,
        expectedRevision: 0,
        operationId: "stale-import",
        messages: [message("old", "user", "resurrected")],
        requireEmpty: true,
      })
    ).rejects.toMatchObject({ code: "conversation_not_empty" });
  });

  test("regeneration removes the selected assistant branch", async () => {
    const redis = new MemoryConversationRedis();
    const seeded = await syncAIConversationMessages({
      redis,
      username: "alice",
      channel: "chat",
      operationId: "seed",
      messages: [
        message("u1", "user", "question"),
        message("a1", "assistant", "old answer"),
        message("u2", "user", "later branch"),
      ],
    });

    const prepared = await prepareAIConversationRegeneration({
      redis,
      username: "alice",
      channel: "chat",
      expectedConversationId: seeded.id,
      operationId: "regenerate-a1",
      targetMessageId: "a1",
    });
    expect(prepared.messages.map((entry) => entry.id)).toEqual([
      "u1",
      "a1",
      "u2",
    ]);
    await syncAIConversationMessages({
      redis,
      username: "alice",
      channel: "chat",
      operationId: "request-regenerate-a1",
      expectedConversationId: seeded.id,
      expectedRevision: seeded.revision,
      messages: [],
      turn: { id: "turn-regenerate-a1", action: "begin" },
    });

    const replacement = await commitAIConversationRegeneration({
      redis,
      username: "alice",
      channel: "chat",
      operationId: "regenerate-a1",
      expectedConversationId: seeded.id,
      expectedRevision: seeded.revision,
      targetMessageId: "a1",
      turnId: "turn-regenerate-a1",
      messages: [message("a2", "assistant", "new answer")],
    });
    expect(replacement.messages.map((entry) => entry.id)).toEqual(["u1", "a2"]);
    expect(replacement.messages.map((entry) => entry.seq)).toEqual([1, 4]);
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

  test("rejects a concurrent turn until the active turn completes", async () => {
    const redis = new MemoryConversationRedis();
    const first = await syncAIConversationMessages({
      redis,
      username: "alice",
      channel: "chat",
      operationId: "request-a",
      messages: [message("u1", "user", "first")],
      turn: { id: "turn-a", action: "begin" },
    });

    await expect(
      syncAIConversationMessages({
        redis,
        username: "alice",
        channel: "chat",
        operationId: "request-b",
        expectedConversationId: first.id,
        expectedRevision: first.revision,
        messages: [message("u2", "user", "second")],
        turn: { id: "turn-b", action: "begin" },
      })
    ).rejects.toMatchObject({
      code: "conversation_busy",
      status: 409,
    });

    await releaseAIConversationTurn({
      redis,
      username: "alice",
      channel: "chat",
      turnId: "turn-a",
    });
    const second = await syncAIConversationMessages({
      redis,
      username: "alice",
      channel: "chat",
      operationId: "request-b",
      expectedConversationId: first.id,
      expectedRevision: first.revision,
      messages: [message("u2", "user", "second")],
      turn: { id: "turn-b", action: "begin" },
    });
    expect(second.messages.map((entry) => entry.id)).toEqual(["u1", "u2"]);
  });

  test("account deletion tombstones reject in-flight and future writes", async () => {
    const redis = new MemoryConversationRedis();
    await syncAIConversationMessages({
      redis,
      username: "alice",
      channel: "chat",
      operationId: "seed",
      messages: [message("u1", "user", "private")],
    });

    await deleteAIConversationKeys(redis, "alice");
    await expect(
      syncAIConversationMessages({
        redis,
        username: "alice",
        channel: "chat",
        operationId: "late-finish",
        messages: [message("a1", "assistant", "late")],
      })
    ).rejects.toMatchObject({ code: "account_deleted" });

    await clearAIConversationTombstone(redis, "alice");
    const recreated = await syncAIConversationMessages({
      redis,
      username: "alice",
      channel: "chat",
      operationId: "new-account",
      messages: [message("u2", "user", "new")],
    });
    expect(recreated.messages.map((entry) => entry.id)).toEqual(["u2"]);
  });
});
