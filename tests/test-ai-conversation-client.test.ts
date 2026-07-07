import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  AI_CONVERSATION_REQUEST_MAX_BYTES,
  AI_CONVERSATION_TOOL_PAYLOAD_OMISSION,
  buildAIConversationRequestBody,
  clearAIConversationSessionCache,
  getAIConversationRequestContext,
  invalidateAIConversationSession,
  loadAIConversation,
  mergeAIConversationDelta,
  resetAIConversationSession,
} from "../src/api/aiConversations";
import type { AIChatMessage } from "../src/types/chat";
import type {
  AIConversationMessage,
  AIConversationPart,
} from "../src/shared/contracts/aiConversation";

const originalFetch = globalThis.fetch;
const CHAT_ID = "11111111-1111-4111-8111-111111111111";
const RESET_ID = "22222222-2222-4222-8222-222222222222";
const CURRENT_ID = "33333333-3333-4333-8333-333333333333";

function message(
  id: string,
  role: "user" | "assistant",
  text: string
): AIChatMessage {
  return {
    id,
    role,
    parts: [{ type: "text", text }],
    metadata: { createdAt: new Date("2026-07-06T00:00:00.000Z") },
  };
}

function serverMessage(
  id: string,
  seq: number,
  role: "user" | "assistant",
  parts: AIConversationPart[]
): AIConversationMessage {
  return {
    id,
    seq,
    role,
    parts,
    createdAt: `2026-07-06T00:00:0${Math.min(seq, 9)}.000Z`,
  };
}

function textServerMessage(
  id: string,
  seq: number,
  role: "user" | "assistant",
  text: string
): AIConversationMessage {
  return serverMessage(id, seq, role, [{ type: "text", text }]);
}

function snapshotResponse({
  id = CHAT_ID,
  revision = 0,
  owner = "alice",
  historyTruncated = false,
  messages = [],
  summaryMessages = messages,
}: {
  id?: string;
  revision?: number;
  owner?: string;
  historyTruncated?: boolean;
  /** Messages returned in this response (full snapshot or delta slice). */
  messages?: AIConversationMessage[];
  /** Messages backing the summary counters (the full canonical thread). */
  summaryMessages?: AIConversationMessage[];
} = {}): Response {
  return Response.json({
    owner,
    conversation: {
      id,
      channel: "chat",
      revision,
      createdAt: "2026-07-06T00:00:00.000Z",
      updatedAt: "2026-07-06T00:00:00.000Z",
      messageCount: summaryMessages.length,
      oldestSeq: summaryMessages[0]?.seq ?? null,
      newestSeq: summaryMessages.at(-1)?.seq ?? null,
      historyTruncated,
    },
    messages,
  });
}

function resetResponse(id = RESET_ID): Response {
  return Response.json({
    owner: "alice",
    conversation: {
      id,
      channel: "chat",
      revision: 0,
      createdAt: "2026-07-06T00:01:00.000Z",
      updatedAt: "2026-07-06T00:01:00.000Z",
      messageCount: 0,
      oldestSeq: null,
      newestSeq: null,
      historyTruncated: false,
    },
    reset: true,
  });
}

function requestMessageIds(request: Record<string, unknown>): string[] {
  if (!Array.isArray(request.messages)) {
    throw new Error("Expected request messages");
  }
  return request.messages.map((entry) => {
    if (
      typeof entry !== "object" ||
      entry === null ||
      !("id" in entry) ||
      typeof entry.id !== "string"
    ) {
      throw new Error("Expected a projected request message");
    }
    return entry.id;
  });
}

beforeEach(() => {
  clearAIConversationSessionCache();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  clearAIConversationSessionCache();
});

describe("AI conversation client", () => {
  test("hydrates ISO timestamps and reuses the owner-scoped session", async () => {
    let requestCount = 0;
    globalThis.fetch = async () => {
      requestCount += 1;
      return snapshotResponse({
        revision: 1,
        messages: [
          serverMessage("u1", 1, "user", [
            { type: "text", text: "hello" },
            {
              type: "file",
              mediaType: "image/png",
              url: "/api/ai/attachments/11111111-1111-4111-8111-111111111111.png",
            },
          ]),
        ],
      });
    };

    const loaded = await loadAIConversation({
      channel: "chat",
      username: "Alice",
    });
    expect(loaded.owner).toBe("alice");
    expect(loaded.messages[0]?.metadata?.createdAt).toBeInstanceOf(Date);
    expect(loaded.messages[0]?.parts[1]?.type).toBe("file");

    const context = await getAIConversationRequestContext({
      channel: "chat",
      username: "Alice",
    });
    expect(context?.id).toBe(CHAT_ID);
    expect(context?.revision).toBe(1);
    expect(context?.operationId).toBeString();
    expect(requestCount).toBe(1);
  });

  test("revalidates an invalidated session with an afterSeq delta read", async () => {
    const urls: string[] = [];
    const base = [
      textServerMessage("u1", 1, "user", "hello"),
      textServerMessage("a1", 2, "assistant", "hi"),
    ];
    const appended = textServerMessage("u2", 3, "user", "second turn");
    globalThis.fetch = async (input) => {
      urls.push(String(input));
      if (urls.length === 1) {
        return snapshotResponse({ revision: 2, messages: base });
      }
      return snapshotResponse({
        revision: 3,
        messages: [appended],
        summaryMessages: [...base, appended],
      });
    };

    const first = await loadAIConversation({
      channel: "chat",
      username: "alice",
    });
    expect(first.messages.map((entry) => entry.id)).toEqual(["u1", "a1"]);

    invalidateAIConversationSession("chat", "alice");
    const second = await loadAIConversation({
      channel: "chat",
      username: "alice",
    });

    expect(second.messages.map((entry) => entry.id)).toEqual([
      "u1",
      "a1",
      "u2",
    ]);
    expect(second.conversation.revision).toBe(3);
    expect(urls).toHaveLength(2);
    expect(urls[0]).not.toContain("afterSeq=");
    expect(urls[1]).toContain("afterSeq=2");
  });

  test("falls back to one full fetch when the delta no longer lines up", async () => {
    const urls: string[] = [];
    globalThis.fetch = async (input) => {
      urls.push(String(input));
      if (urls.length === 1) {
        return snapshotResponse({
          revision: 2,
          messages: [
            textServerMessage("u1", 1, "user", "hello"),
            textServerMessage("a1", 2, "assistant", "hi"),
          ],
        });
      }
      if (urls.length === 2) {
        // Same conversation id, but a regeneration dropped a message: the
        // merged list can no longer satisfy the summary counters.
        return snapshotResponse({
          revision: 3,
          messages: [],
          summaryMessages: [textServerMessage("u1", 1, "user", "hello")],
        });
      }
      return snapshotResponse({
        revision: 3,
        messages: [textServerMessage("u1", 1, "user", "hello")],
      });
    };

    await loadAIConversation({ channel: "chat", username: "alice" });
    invalidateAIConversationSession("chat", "alice");
    const reloaded = await loadAIConversation({
      channel: "chat",
      username: "alice",
    });

    expect(reloaded.messages.map((entry) => entry.id)).toEqual(["u1"]);
    expect(urls).toHaveLength(3);
    expect(urls[1]).toContain("afterSeq=2");
    expect(urls[2]).not.toContain("afterSeq=");
  });

  test("merges delta updates that re-minted an existing message's seq", () => {
    const existing = [
      textServerMessage("u1", 1, "user", "open Finder"),
      textServerMessage("a1", 2, "assistant", "opening"),
    ];
    const updatedAssistant = textServerMessage(
      "a1",
      3,
      "assistant",
      "opened Finder"
    );

    const merged = mergeAIConversationDelta(existing, {
      owner: "alice",
      conversation: {
        id: CHAT_ID,
        channel: "chat",
        revision: 3,
        createdAt: "2026-07-06T00:00:00.000Z",
        updatedAt: "2026-07-06T00:00:00.000Z",
        messageCount: 2,
        oldestSeq: 1,
        newestSeq: 3,
        historyTruncated: false,
      },
      messages: [updatedAssistant],
    });

    expect(merged?.map((entry) => entry.id)).toEqual(["u1", "a1"]);
    expect(merged?.at(-1)).toEqual(updatedAssistant);
  });

  test("resets to the server-returned conversation id", async () => {
    globalThis.fetch = async (_input, init) => {
      if (init?.method === "POST") {
        return resetResponse();
      }
      return snapshotResponse({
        revision: 1,
        messages: [textServerMessage("u1", 1, "user", "hello")],
      });
    };

    const reset = await resetAIConversationSession({
      channel: "chat",
      username: "alice",
    });
    expect(reset.id).toBe(RESET_ID);

    const context = await getAIConversationRequestContext({
      channel: "chat",
      username: "alice",
    });
    expect(context?.id).toBe(RESET_ID);
  });

  test("refreshes once after a reset conflict and keeps repeated resets on the current conversation", async () => {
    const requests: Array<{
      method: string;
      body: Record<string, unknown> | null;
    }> = [];
    let getCount = 0;
    let postCount = 0;
    globalThis.fetch = async (_input, init) => {
      const method = init?.method ?? "GET";
      const body =
        typeof init?.body === "string"
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : null;
      requests.push({ method, body });

      if (method === "GET") {
        getCount += 1;
        return getCount === 1
          ? snapshotResponse({
              id: CHAT_ID,
              revision: 2,
              messages: [textServerMessage("u1", 1, "user", "stale turn")],
            })
          : snapshotResponse({ id: CURRENT_ID });
      }

      postCount += 1;
      if (postCount === 1) {
        return Response.json({ error: "revision_conflict" }, { status: 409 });
      }
      return resetResponse();
    };

    await loadAIConversation({ channel: "chat", username: "alice" });
    const reset = await resetAIConversationSession({
      channel: "chat",
      username: "alice",
    });

    expect(reset.id).toBe(RESET_ID);
    // The refresh after the conflict tries a delta read first, sees a new
    // conversation id, and falls back to a full snapshot.
    expect(requests.map((request) => request.method)).toEqual([
      "GET",
      "POST",
      "GET",
      "GET",
      "POST",
    ]);
    expect(
      requests
        .filter((request) => request.method === "POST")
        .map((request) => request.body?.conversationId)
    ).toEqual([CHAT_ID, CURRENT_ID]);
    expect(
      requests.some((request) => "messages" in (request.body ?? {}))
    ).toBe(false);

    const context = await getAIConversationRequestContext({
      channel: "chat",
      username: "alice",
    });
    expect(context?.id).toBe(RESET_ID);

    await resetAIConversationSession({ channel: "chat", username: "alice" });
    expect(
      requests
        .filter((request) => request.method === "POST")
        .map((request) => request.body?.conversationId)
    ).toEqual([CHAT_ID, CURRENT_ID, RESET_ID]);
  });

  test("keeps cache-cleared same-owner loads from overwriting a new session", async () => {
    let resolveFirst: ((response: Response) => void) | undefined;
    let requestCount = 0;
    globalThis.fetch = async () => {
      requestCount += 1;
      if (requestCount === 1) {
        return new Promise<Response>((resolve) => {
          resolveFirst = resolve;
        });
      }
      return snapshotResponse({ id: CURRENT_ID, revision: 4 });
    };

    const staleLoad = loadAIConversation({
      channel: "chat",
      username: "alice",
    });
    expect(resolveFirst).toBeFunction();

    clearAIConversationSessionCache();
    const currentLoad = await loadAIConversation({
      channel: "chat",
      username: "alice",
    });
    expect(currentLoad.conversation.id).toBe(CURRENT_ID);

    resolveFirst?.(snapshotResponse({ id: CHAT_ID, revision: 1 }));
    const staleResult = await staleLoad;
    expect(staleResult.stale).toBe(true);

    const context = await getAIConversationRequestContext({
      channel: "chat",
      username: "alice",
    });
    expect(context?.id).toBe(CURRENT_ID);
    expect(requestCount).toBe(2);
  });

  test("rejects a cookie owner mismatch", async () => {
    const methods: string[] = [];
    globalThis.fetch = async (_input, init) => {
      methods.push(init?.method ?? "GET");
      return snapshotResponse({ owner: "bob" });
    };

    await expect(
      loadAIConversation({ channel: "chat", username: "alice" })
    ).rejects.toThrow("Authenticated conversation owner changed");
    expect(methods).toEqual(["GET"]);
  });

  test("sends only the current authenticated action", () => {
    const messages = [
      message("u1", "user", "old"),
      message("a1", "assistant", "reply"),
      message("u2", "user", "new"),
    ];
    const conversation = {
      id: CHAT_ID,
      revision: 4,
      operationId: "operation-1",
    };

    expect(
      buildAIConversationRequestBody({
        body: { model: "gemini-3-flash" },
        id: "sdk-chat",
        messages,
        trigger: "submit-message",
        conversation,
      })
    ).toEqual({
      model: "gemini-3-flash",
      id: "sdk-chat",
      trigger: "submit-message",
      conversation,
      message: messages[2],
    });
    expect(
      buildAIConversationRequestBody({
        id: "sdk-chat",
        messages,
        trigger: "regenerate-message",
        messageId: "a1",
        conversation,
      })
    ).toEqual({
      id: "sdk-chat",
      trigger: "regenerate-message",
      messageId: "a1",
      conversation,
    });

    const anonymous = buildAIConversationRequestBody({
      id: "sdk-chat",
      messages,
      trigger: "submit-message",
    });
    expect(requestMessageIds(anonymous)).toEqual(["u1", "a1", "u2"]);
    if (!Array.isArray(anonymous.messages)) {
      throw new Error("Expected anonymous request messages");
    }
    expect(anonymous.messages[0]).toMatchObject({
      id: "u1",
      role: "user",
      parts: [{ type: "text", text: "old" }],
      metadata: { createdAt: "2026-07-06T00:00:00.000Z" },
    });
  });

  test("compacts anonymous tool payloads and drops over-budget older turns", () => {
    expect(AI_CONVERSATION_REQUEST_MAX_BYTES).toBe(4 * 1024 * 1024 - 64 * 1024);
    const recentToolMessage: AIChatMessage = {
      id: "a-recent",
      role: "assistant",
      parts: [
        {
          type: "tool-read",
          toolCallId: "read-recent",
          state: "output-available",
          input: { path: "/Documents/recent.txt" },
          output: { content: "t".repeat(512 * 1024) },
        },
      ],
      metadata: { createdAt: new Date("2026-07-06T00:00:01.000Z") },
    };
    const messages = [
      // Over the anonymous per-message text budget: this whole turn is
      // dropped, and inclusion stops there even though earlier turns fit.
      message("u-old", "user", "o".repeat(200_000)),
      message("a-old", "assistant", "old answer"),
      message("u-recent", "user", "read the recent file"),
      recentToolMessage,
      message("u-current", "user", "keep this current turn"),
    ];

    const request = buildAIConversationRequestBody({
      body: { model: "gemini-3-flash" },
      id: "sdk-chat",
      messages,
      trigger: "submit-message",
    });

    expect(
      new TextEncoder().encode(JSON.stringify(request)).byteLength
    ).toBeLessThan(AI_CONVERSATION_REQUEST_MAX_BYTES);
    expect(requestMessageIds(request)).toEqual([
      "u-recent",
      "a-recent",
      "u-current",
    ]);
    if (!Array.isArray(request.messages)) {
      throw new Error("Expected request messages");
    }
    expect(request.messages[1]).toMatchObject({
      id: "a-recent",
      parts: [
        {
          type: "tool-read",
          output: AI_CONVERSATION_TOOL_PAYLOAD_OMISSION,
        },
      ],
      metadata: { createdAt: "2026-07-06T00:00:01.000Z" },
    });
  });

  test("retains the target user turn and regeneration message id", () => {
    const messages = [
      message("u-old", "user", "o".repeat(2 * 1024 * 1024)),
      message("a-old", "assistant", "a".repeat(2 * 1024 * 1024)),
      message("u-target", "user", "regenerate this answer"),
    ];

    const request = buildAIConversationRequestBody({
      id: "sdk-chat",
      messages,
      trigger: "regenerate-message",
      messageId: "a-target",
    });

    expect(requestMessageIds(request)).toEqual(["u-target"]);
    expect(request.messageId).toBe("a-target");
    expect(
      new TextEncoder().encode(JSON.stringify(request)).byteLength
    ).toBeLessThan(AI_CONVERSATION_REQUEST_MAX_BYTES);
  });

  test("rejects an anonymous request when the current turn alone is oversized", () => {
    expect(() =>
      buildAIConversationRequestBody({
        id: "sdk-chat",
        messages: [
          message(
            "u-current",
            "user",
            "x".repeat(AI_CONVERSATION_REQUEST_MAX_BYTES)
          ),
        ],
        trigger: "submit-message",
      })
    ).toThrow("Current conversation turn exceeds the safe AI request limit");
  });
});
