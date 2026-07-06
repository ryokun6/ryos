import { describe, expect, test } from "bun:test";
import {
  AIConversationError,
  beginAIConversationTurn,
  beginAIConversationTurnWithStatus,
  commitAIConversationRegeneration,
  clearAIConversationTombstone,
  completeAIConversationTurn,
  deleteAIConversationKeys,
  getAIConversationPage,
  importAIConversationMessages,
  prepareAIConversationRegeneration,
  releaseAIConversationTurn,
  resetAIConversation,
  sanitizeAIConversationMessages,
  type AIConversationRedis,
} from "../api/ai/conversations/_helpers/store";
import { ASSISTANT_SUMMON_MESSAGE } from "../src/shared/assistantGreeting";
import { redisKeys } from "../src/shared/redisKeys";

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
  test("keeps rich parts and drops synthetic or unsupported messages", () => {
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
            {
              type: "tool-read",
              toolCallId: "tool-1",
              state: "output-available",
              input: { path: "/Desktop/note.txt" },
              output: "saved",
            },
          ],
        },
        message("assistant", "assistant", "Reply"),
      ])
    ).toEqual([
      {
        id: "user",
        role: "user",
        parts: [
          { type: "reasoning", text: "private" },
          { type: "text", text: "Visible" },
          {
            type: "tool-read",
            toolCallId: "tool-1",
            state: "output-available",
            input: { path: "/Desktop/note.txt" },
            output: "saved",
          },
        ],
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

  test("accepts long text and canonical attachment references", () => {
    const longText = "界".repeat(100_000);
    const [stored] = sanitizeAIConversationMessages([
      {
        id: "rich-user",
        role: "user",
        parts: [
          { type: "text", text: longText },
          {
            type: "file",
            mediaType: "image/png",
            url: "https://example.test/api/ai/attachments/11111111-1111-4111-8111-111111111111.png",
          },
        ],
      },
    ]);

    expect(stored?.parts[0]).toEqual({ type: "text", text: longText });
    expect(stored?.parts[1]).toEqual({
      type: "file",
      mediaType: "image/png",
      url: "/api/ai/attachments/11111111-1111-4111-8111-111111111111.png",
    });
  });

  test("reads version 2 rich history and rewrites it on the next write", async () => {
    const redis = new MemoryConversationRedis();
    const key = redisKeys.chat.aiConversation("alice", "chat");
    const richMessages = [
      {
        id: "legacy-user",
        seq: 1,
        role: "user",
        parts: [
          { type: "text", text: "Keep this image" },
          {
            type: "file",
            mediaType: "image/png",
            url: "/api/ai/attachments/33333333-3333-4333-8333-333333333333",
          },
        ],
        createdAt: "2026-07-06T10:00:00.000Z",
      },
      {
        id: "legacy-assistant",
        seq: 2,
        role: "assistant",
        parts: [
          { type: "step-start" },
          {
            type: "tool-write",
            toolCallId: "write-call",
            state: "output-available",
            input: { path: "/Documents/synced.md", content: "exact content" },
            output: "saved",
          },
          {
            type: "source-url",
            sourceId: "source-1",
            url: "https://example.com/source",
            title: "Example",
          },
        ],
        createdAt: "2026-07-06T10:01:00.000Z",
      },
    ];
    await redis.set(
      key,
      JSON.stringify({
        version: 2,
        id: "44444444-4444-4444-8444-444444444444",
        channel: "chat",
        revision: 7,
        nextSeq: 3,
        createdAt: "2026-07-06T10:00:00.000Z",
        updatedAt: "2026-07-06T10:01:00.000Z",
        historyTruncated: false,
        legacyImportAllowed: false,
        messages: richMessages,
        recentOperationIds: ["legacy-operation"],
        lastResetOperationId: null,
        pendingTurnId: null,
        pendingTurnStartedAt: null,
      })
    );

    const page = await getAIConversationPage({
      redis,
      username: "alice",
      channel: "chat",
      limit: 10,
    });
    expect(page.conversation).toMatchObject({
      id: "44444444-4444-4444-8444-444444444444",
      revision: 7,
      messageCount: 2,
      oldestSeq: 1,
      newestSeq: 2,
      canImportLegacy: false,
    });
    expect(page.messages).toEqual(richMessages);

    const updated = await beginAIConversationTurn({
      redis,
      username: "alice",
      channel: "chat",
      expectedConversationId: page.conversation.id,
      expectedRevision: page.conversation.revision,
      operationId: "new-operation",
      turnId: "new-turn",
      action: {
        kind: "user-message",
        message: message("new-user", "user", "new text"),
      },
    });
    expect(updated.messages.slice(0, 2)).toEqual(richMessages);
    expect(updated.messages[2]?.seq).toBe(3);
    expect(updated.revision).toBe(8);

    const stored = await redis.get<string>(key);
    expect(JSON.parse(stored ?? "{}")).toMatchObject({
      version: 1,
      revision: 8,
      nextSeq: 4,
      messages: [
        ...richMessages,
        {
          id: "new-user",
          seq: 3,
          role: "user",
          parts: [{ type: "text", text: "new text" }],
          createdAt: "2026-07-06T00:00:00.000Z",
        },
      ],
      recentOperationIds: ["legacy-operation", "new-operation"],
      pendingTurnId: "new-turn",
    });
  });

  test("appends idempotently with revisions and stable cursor pagination", async () => {
    const redis = new MemoryConversationRedis();
    const initial = await getAIConversationPage({
      redis,
      username: "alice",
      channel: "chat",
      limit: 10,
    });

    const first = await beginAIConversationTurn({
      redis,
      username: "alice",
      channel: "chat",
      expectedConversationId: initial.conversation.id,
      expectedRevision: 0,
      operationId: "request-turn-1",
      turnId: "turn-1",
      action: {
        kind: "user-message",
        message: message("u1", "user", "one"),
      },
    });
    expect(first.revision).toBe(1);

    const completed = await completeAIConversationTurn({
      redis,
      username: "alice",
      channel: "chat",
      expectedConversationId: initial.conversation.id,
      expectedRevision: 1,
      operationId: "response-turn-1",
      turnId: "turn-1",
      responseMessage: message("a1", "assistant", "two"),
    });
    expect(completed.revision).toBe(2);

    const replay = await beginAIConversationTurnWithStatus({
      redis,
      username: "alice",
      channel: "chat",
      expectedConversationId: initial.conversation.id,
      expectedRevision: 0,
      operationId: "request-turn-1",
      turnId: "turn-1",
      action: {
        kind: "user-message",
        message: message("u1", "user", "different replay payload"),
      },
    });
    expect(replay.operationApplied).toBe(false);
    expect(replay.document.revision).toBe(2);
    expect(replay.document.messages).toHaveLength(2);

    const second = await beginAIConversationTurn({
      redis,
      username: "alice",
      channel: "chat",
      expectedConversationId: initial.conversation.id,
      expectedRevision: 2,
      operationId: "request-turn-2",
      turnId: "turn-2",
      action: {
        kind: "user-message",
        message: message("u2", "user", "three"),
      },
    });
    expect(second.revision).toBe(3);

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
    await beginAIConversationTurn({
      redis,
      username: "alice",
      channel: "chat",
      expectedConversationId: initial.conversation.id,
      expectedRevision: 0,
      operationId: "request-first",
      turnId: "first",
      action: {
        kind: "user-message",
        message: message("u1", "user", "original"),
      },
    });

    await expect(
      beginAIConversationTurn({
        redis,
        username: "alice",
        channel: "chat",
        expectedConversationId: initial.conversation.id,
        expectedRevision: 0,
        operationId: "request-stale",
        turnId: "stale",
        action: {
          kind: "user-message",
          message: message("u2", "user", "stale"),
        },
      })
    ).rejects.toMatchObject({
      code: "revision_conflict",
      status: 409,
    });

    await releaseAIConversationTurn({
      redis,
      username: "alice",
      channel: "chat",
      turnId: "first",
    });
    await expect(
      beginAIConversationTurn({
        redis,
        username: "alice",
        channel: "chat",
        expectedConversationId: initial.conversation.id,
        expectedRevision: 1,
        operationId: "request-reuse",
        turnId: "reuse",
        action: {
          kind: "user-message",
          message: message("u1", "user", "mutated"),
        },
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
    await importAIConversationMessages({
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
    expect(reset.clearedMessages.map((entry) => entry.id)).toEqual(["u1"]);

    const replay = await resetAIConversation({
      redis,
      username: "alice",
      channel: "assistant",
      conversationId: initial.conversation.id,
      operationId: "reset-1",
    });
    expect(replay.reset).toBe(false);
    expect(replay.document.id).toBe(reset.document.id);
    expect(replay.clearedMessages).toEqual([]);

    await expect(
      importAIConversationMessages({
        redis,
        username: "alice",
        channel: "assistant",
        expectedConversationId: reset.document.id,
        expectedRevision: 0,
        operationId: "stale-import",
        messages: [message("old", "user", "resurrected")],
      })
    ).rejects.toMatchObject({ code: "conversation_not_empty" });
  });

  test("regeneration removes the selected assistant branch", async () => {
    const redis = new MemoryConversationRedis();
    const seeded = await importAIConversationMessages({
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
    await beginAIConversationTurn({
      redis,
      username: "alice",
      channel: "chat",
      operationId: "request-regenerate-a1",
      expectedConversationId: seeded.id,
      expectedRevision: seeded.revision,
      turnId: "turn-regenerate-a1",
      action: { kind: "regenerate" },
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
      responseMessage: message("a2", "assistant", "new answer"),
    });
    expect(replacement.messages.map((entry) => entry.id)).toEqual(["u1", "a2"]);
    expect(replacement.messages.map((entry) => entry.seq)).toEqual([1, 4]);
  });

  test("accepts one action per turn and updates an assistant continuation", async () => {
    const redis = new MemoryConversationRedis();
    const started = await beginAIConversationTurn({
      redis,
      username: "alice",
      channel: "chat",
      operationId: "request-one",
      turnId: "one",
      action: {
        kind: "user-message",
        message: message("u1", "user", "open Finder"),
      },
    });
    const firstResponse = await completeAIConversationTurn({
      redis,
      username: "alice",
      channel: "chat",
      operationId: "response-one",
      expectedConversationId: started.id,
      expectedRevision: started.revision,
      turnId: "one",
      responseMessage: message("a1", "assistant", "Opening Finder"),
    });

    const continuation = await beginAIConversationTurn({
      redis,
      username: "alice",
      channel: "chat",
      operationId: "request-two",
      expectedConversationId: firstResponse.id,
      expectedRevision: firstResponse.revision,
      turnId: "two",
      action: {
        kind: "assistant-continuation",
        message: {
          ...message("a1", "assistant", "Opening Finder"),
          parts: [
            { type: "text", text: "Opening Finder" },
            {
              type: "tool-launchApp",
              toolCallId: "tool-1",
              state: "output-available",
              input: { id: "finder" },
              output: { success: true },
            },
          ],
        },
      },
    });
    const completed = await completeAIConversationTurn({
      redis,
      username: "alice",
      channel: "chat",
      operationId: "response-two",
      expectedConversationId: continuation.id,
      expectedRevision: continuation.revision,
      turnId: "two",
      responseMessage: message("a1", "assistant", "Finder is open"),
    });

    expect(completed.messages.map((entry) => entry.id)).toEqual(["u1", "a1"]);
    expect(completed.messages[1]?.parts[0]?.text).toBe("Finder is open");

    await expect(
      beginAIConversationTurn({
        redis,
        username: "alice",
        channel: "chat",
        operationId: "wrong-role",
        turnId: "wrong-role",
        action: {
          kind: "user-message",
          message: message("a2", "assistant", "not a user"),
        },
      })
    ).rejects.toMatchObject({ code: "message_id_conflict", status: 422 });
  });

  test("bounds retained history without resetting sequence numbers", async () => {
    const redis = new MemoryConversationRedis();
    const messages = Array.from({ length: 205 }, (_, index) =>
      message(`u${index}`, "user", `message ${index}`)
    );

    const document = await importAIConversationMessages({
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
    const first = await beginAIConversationTurn({
      redis,
      username: "alice",
      channel: "chat",
      operationId: "request-a",
      turnId: "turn-a",
      action: {
        kind: "user-message",
        message: message("u1", "user", "first"),
      },
    });

    await expect(
      beginAIConversationTurn({
        redis,
        username: "alice",
        channel: "chat",
        operationId: "request-b",
        expectedConversationId: first.id,
        expectedRevision: first.revision,
        turnId: "turn-b",
        action: {
          kind: "user-message",
          message: message("u2", "user", "second"),
        },
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
    const second = await beginAIConversationTurn({
      redis,
      username: "alice",
      channel: "chat",
      operationId: "request-b",
      expectedConversationId: first.id,
      expectedRevision: first.revision,
      turnId: "turn-b",
      action: {
        kind: "user-message",
        message: message("u2", "user", "second"),
      },
    });
    expect(second.messages.map((entry) => entry.id)).toEqual(["u1", "u2"]);
  });

  test("account deletion tombstones reject in-flight and future writes", async () => {
    const redis = new MemoryConversationRedis();
    await importAIConversationMessages({
      redis,
      username: "alice",
      channel: "chat",
      operationId: "seed",
      messages: [message("u1", "user", "private")],
    });

    await deleteAIConversationKeys(redis, "alice");
    await expect(
      completeAIConversationTurn({
        redis,
        username: "alice",
        channel: "chat",
        operationId: "late-finish",
        turnId: "deleted-turn",
        responseMessage: message("a1", "assistant", "late"),
      })
    ).rejects.toMatchObject({ code: "account_deleted" });

    await clearAIConversationTombstone(redis, "alice");
    const recreated = await beginAIConversationTurn({
      redis,
      username: "alice",
      channel: "chat",
      operationId: "new-account",
      turnId: "new-account",
      action: {
        kind: "user-message",
        message: message("u2", "user", "new"),
      },
    });
    expect(recreated.messages.map((entry) => entry.id)).toEqual(["u2"]);
  });
});
