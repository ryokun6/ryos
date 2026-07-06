import { describe, expect, test } from "bun:test";
import { validateUIMessages } from "ai";
import {
  AIConversationError,
  beginAIConversationTurn,
  beginAIConversationTurnWithStatus,
  commitAIConversationRegeneration,
  clearAIConversationTombstone,
  completeAIConversationTurn,
  deleteAIConversationKeys,
  getAIConversationModelMessages,
  getAIConversationPage,
  getAIConversationRegenerationModelMessages,
  importAIConversationMessages,
  prepareAIConversationRegeneration,
  releaseAIConversationTurn,
  resetAIConversation,
  sanitizeAIConversationMessages,
  type AIConversationRedis,
} from "../api/ai/conversations/_helpers/store";
import { writeSchema } from "../api/chat/tools/schemas";
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

  async exists(...keys: string[]): Promise<number> {
    return keys.reduce(
      (count, key) => count + (this.values.has(key) ? 1 : 0),
      0
    );
  }

  async expire(key: string, _seconds: number): Promise<number> {
    return this.values.has(key) ? 1 : 0;
  }

  async persist(key: string): Promise<number> {
    return this.values.has(key) ? 1 : 0;
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    const existing = this.values.get(key);
    const values = existing instanceof Set ? existing : new Set<string>();
    let added = 0;
    for (const member of members) {
      if (!values.has(member)) added += 1;
      values.add(member);
    }
    this.values.set(key, values);
    return added;
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    const existing = this.values.get(key);
    if (!(existing instanceof Set)) return 0;
    let removed = 0;
    for (const member of members) {
      if (existing.delete(member)) removed += 1;
    }
    return removed;
  }

  async smembers<T = string[]>(key: string): Promise<T> {
    const existing = this.values.get(key);
    return (existing instanceof Set ? [...existing] : []) as T;
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
        const claimCount = Number(args[3] ?? 0);
        const claimsMatch = Array.from(
          { length: claimCount },
          (_, index) => {
            const current = this.values.get(keys[3 + index] ?? "");
            const serialized =
              typeof current === "string" ? current : JSON.stringify(current);
            return serialized === args[4 + index * 2];
          }
        ).every(Boolean);
        if (!claimsMatch) {
          result = -3;
        } else {
          for (let index = 0; index < claimCount; index += 1) {
            this.values.set(
              keys[3 + index] ?? "",
              String(args[5 + index * 2])
            );
          }
          this.values.set(keys[2] ?? "", String(args[1]));
          result = 1;
        }
      }
    } else if (script.includes('redis.call("EXPIRE", KEYS[1]')) {
      result = this.values.get(keys[0] ?? "") === args[0] ? 1 : 0;
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

  test("preserves long text, owned images, sources, and bounded tool state", () => {
    const longText = "x".repeat(128_000);
    const attachmentUrl =
      "/api/ai/attachments/33333333-3333-4333-8333-333333333333";
    const [user, assistant] = sanitizeAIConversationMessages([
      {
        id: "user-rich",
        role: "user",
        parts: [
          { type: "text", text: longText },
          { type: "file", mediaType: "image/png", url: attachmentUrl },
        ],
      },
      {
        id: "assistant-rich",
        role: "assistant",
        parts: [
          { type: "text", text: "Done" },
          {
            type: "tool-generateHtml",
            toolCallId: "call-html",
            state: "output-available",
            input: { prompt: "Make a page" },
            output: { html: "<main>Hello</main>", title: "Hello" },
          },
          {
            type: "tool-read",
            toolCallId: "call-read",
            state: "output-available",
            input: { path: "/secret.txt" },
            output: "private contents",
          },
          {
            type: "source-url",
            sourceId: "source-1",
            url: "https://example.com/source",
            title: "Example",
          },
          { type: "reasoning", text: "private chain of thought" },
        ],
      },
    ]);

    expect(user?.parts[0]).toEqual({ type: "text", text: longText });
    expect(user?.parts[1]).toEqual({
      type: "file",
      mediaType: "image/png",
      url: attachmentUrl,
    });
    expect(assistant?.parts[1]).toMatchObject({
      type: "tool-generateHtml",
      state: "output-available",
      output: { html: "<main>Hello</main>", title: "Hello" },
    });
    expect(assistant?.parts[2]).toMatchObject({
      type: "tool-read",
      state: "output-available",
      output: { synced: false, reason: "private" },
    });
    expect(assistant?.parts[3]).toEqual({
      type: "source-url",
      sourceId: "source-1",
      url: "https://example.com/source",
      title: "Example",
    });
    expect(assistant?.parts).toHaveLength(4);
  });

  test("preserves text boundaries and rejects oversized messages", () => {
    const unicodeBoundary = `${"a".repeat(127_999)}😀`;
    const [messageAtLimit] = sanitizeAIConversationMessages([
      {
        id: "unicode-limit",
        role: "user",
        parts: [
          { type: "text", text: "  keep surrounding whitespace  " },
          {
            type: "text",
            text: unicodeBoundary.slice("  keep surrounding whitespace  ".length),
          },
        ],
      },
    ]);
    expect(messageAtLimit?.parts[0]).toEqual({
      type: "text",
      text: "  keep surrounding whitespace  ",
    });
    expect(
      messageAtLimit?.parts
        .flatMap((part) => (part.type === "text" ? [...part.text] : []))
        .length
    ).toBe(128_000);

    expect(() =>
      sanitizeAIConversationMessages([
        {
          id: "too-long",
          role: "user",
          parts: [{ type: "text", text: "x".repeat(128_001) }],
        },
      ])
    ).toThrow("Message text exceeds the conversation limit");
  });

  test("retains schema-valid tool inputs and step boundaries for model context", async () => {
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
      operationId: "tool-context-request",
      turnId: "tool-context",
      action: {
        kind: "user-message",
        message: message("tool-user", "user", "Write this down"),
      },
    });
    const completed = await completeAIConversationTurn({
      redis,
      username: "alice",
      channel: "chat",
      expectedConversationId: initial.conversation.id,
      expectedRevision: 1,
      operationId: "tool-context-response",
      turnId: "tool-context",
      responseMessage: {
        id: "tool-assistant",
        role: "assistant",
        parts: [
          { type: "step-start" },
          {
            type: "tool-write",
            toolCallId: "write-call",
            state: "output-available",
            input: {
              path: "/Documents/synced.md",
              content: "  exact content\n",
            },
            output: "saved",
          },
        ],
      },
    });

    const modelMessages = getAIConversationModelMessages(completed);
    expect(modelMessages.at(-1)?.parts).toEqual([
      { type: "step-start" },
      {
        type: "tool-write",
        toolCallId: "write-call",
        state: "output-available",
        input: {
          path: "/Documents/synced.md",
          content: "  exact content\n",
        },
        output: "saved",
      },
    ]);
    await expect(
      validateUIMessages({
        messages: modelMessages,
        tools: {
          write: {
            description: "Write a file",
            inputSchema: writeSchema,
          },
        },
      })
    ).resolves.toEqual(modelMessages);
  });

  test("reads version 1 text history and upgrades it on the next write", async () => {
    const redis = new MemoryConversationRedis();
    const key = redisKeys.chat.aiConversation("alice", "chat");
    await redis.set(
      key,
      JSON.stringify({
        version: 1,
        id: "44444444-4444-4444-8444-444444444444",
        channel: "chat",
        revision: 1,
        nextSeq: 2,
        createdAt: "2026-07-06T00:00:00.000Z",
        updatedAt: "2026-07-06T00:00:00.000Z",
        historyTruncated: false,
        legacyImportAllowed: false,
        messages: [
          {
            id: "legacy-user",
            seq: 1,
            role: "user",
            parts: [{ type: "text", text: "legacy text" }],
            createdAt: "2026-07-06T00:00:00.000Z",
          },
        ],
        recentOperationIds: [],
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
    expect(page.messages[0]?.parts).toEqual([
      { type: "text", text: "legacy text" },
    ]);

    await beginAIConversationTurn({
      redis,
      username: "alice",
      channel: "chat",
      expectedConversationId: page.conversation.id,
      expectedRevision: page.conversation.revision,
      operationId: "upgrade-v1",
      turnId: "upgrade-v1",
      action: {
        kind: "user-message",
        message: message("new-user", "user", "new text"),
      },
    });
    const stored = await redis.get<string>(key);
    expect(JSON.parse(stored ?? "{}").version).toBe(2);
  });

  test("claims a new image in the same atomic write as its conversation", async () => {
    const redis = new MemoryConversationRedis();
    const attachmentId = "33333333-3333-4333-8333-333333333333";
    const attachmentKey = redisKeys.chat.aiAttachment("alice", attachmentId);
    await redis.set(
      attachmentKey,
      JSON.stringify({
        version: 1,
        status: "unattached",
        id: attachmentId,
        storageUrl: `s3://private/${attachmentId}`,
        mediaType: "image/png",
        size: 68,
        sha256: "a".repeat(64),
        createdAt: "2026-07-06T00:00:00.000Z",
      })
    );
    const initial = await getAIConversationPage({
      redis,
      username: "alice",
      channel: "chat",
      limit: 10,
    });

    const imported = await importAIConversationMessages({
      redis,
      username: "alice",
      channel: "chat",
      expectedConversationId: initial.conversation.id,
      expectedRevision: 0,
      operationId: "claim-image",
      messages: [
        {
          id: "image-user",
          role: "user",
          parts: [
            { type: "text", text: "Keep this image" },
            {
              type: "file",
              mediaType: "image/png",
              url: `/api/ai/attachments/${attachmentId}`,
            },
          ],
        },
      ],
    });

    expect(imported.messages[0]?.parts).toHaveLength(2);
    expect(
      JSON.parse((await redis.get<string>(attachmentKey)) ?? "{}")
    ).toMatchObject({
      id: attachmentId,
      status: "attached",
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

    const replay = await beginAIConversationTurn({
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
    expect(replay.revision).toBe(2);
    expect(replay.messages).toHaveLength(2);

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

  test("authorizes a new turn before committing it", async () => {
    const redis = new MemoryConversationRedis();
    const initial = await getAIConversationPage({
      redis,
      username: "alice",
      channel: "chat",
      limit: 10,
    });
    let authorizationCalls = 0;
    const deniedTurn = {
      redis,
      username: "alice",
      channel: "chat" as const,
      expectedConversationId: initial.conversation.id,
      expectedRevision: 0,
      operationId: "request-denied",
      turnId: "turn-denied",
      action: {
        kind: "user-message" as const,
        message: message("u-denied", "user", "do not persist"),
      },
    };

    await expect(
      beginAIConversationTurnWithStatus({
        ...deniedTurn,
        beforeCommit: async () => {
          authorizationCalls += 1;
          throw new Error("quota denied");
        },
      })
    ).rejects.toThrow("quota denied");
    const unchanged = await getAIConversationPage({
      redis,
      username: "alice",
      channel: "chat",
      limit: 10,
    });
    expect(unchanged.conversation.revision).toBe(0);
    expect(unchanged.messages).toEqual([]);

    const accepted = await beginAIConversationTurnWithStatus({
      ...deniedTurn,
      beforeCommit: async () => {
        authorizationCalls += 1;
      },
    });
    expect(accepted.operationApplied).toBe(true);
    expect(accepted.document.messages.map((entry) => entry.id)).toEqual([
      "u-denied",
    ]);

    const replay = await beginAIConversationTurnWithStatus({
      ...deniedTurn,
      beforeCommit: async () => {
        authorizationCalls += 1;
      },
    });
    expect(replay.operationApplied).toBe(false);
    expect(authorizationCalls).toBe(2);
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
    expect(
      getAIConversationRegenerationModelMessages(seeded).map(
        (entry) => entry.id
      )
    ).toEqual(["u1", "a1", "u2"]);

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
      responseMessage: {
        ...message("a1", "assistant", "Opening Finder"),
        parts: [
          { type: "text", text: "Opening Finder" },
          {
            type: "tool-launchApp",
            toolCallId: "tool-1",
            state: "input-available",
            input: { id: "finder" },
          },
        ],
      },
    });

    await expect(
      beginAIConversationTurn({
        redis,
        username: "alice",
        channel: "chat",
        operationId: "request-mutated-continuation",
        expectedConversationId: firstResponse.id,
        expectedRevision: firstResponse.revision,
        turnId: "mutated-continuation",
        action: {
          kind: "assistant-continuation",
          message: {
            ...message("a1", "assistant", "Changed text"),
            parts: [
              { type: "text", text: "Changed text" },
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
      })
    ).rejects.toMatchObject({ code: "message_id_conflict", status: 409 });

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
    await expect(
      beginAIConversationTurn({
        redis,
        username: "alice",
        channel: "chat",
        operationId: "request-replayed-continuation",
        expectedConversationId: continuation.id,
        expectedRevision: continuation.revision,
        turnId: "replayed-continuation",
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
      })
    ).rejects.toMatchObject({ code: "message_id_conflict", status: 409 });

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
