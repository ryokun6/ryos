import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  AI_CONVERSATION_IMPORT_REQUEST_MAX_BYTES,
  AI_CONVERSATION_REQUEST_MAX_BYTES,
  AI_CONVERSATION_TOOL_PAYLOAD_OMISSION,
  buildAIConversationRequestBody,
  buildAIConversationImportRequest,
  clearAIConversationSessionCache,
  getAIConversationRequestContext,
  loadAIConversation,
  projectAIConversationMessages,
  resetAIConversationSession,
} from "../src/api/aiConversations";
import type { AIChatMessage } from "../src/types/chat";
import type { AIConversationPart } from "../src/shared/contracts/aiConversation";

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

function pageResponse({
  id = CHAT_ID,
  revision = 0,
  messages = [],
  owner = "alice",
  canImportLegacy = revision === 0 && messages.length === 0,
  nextCursor = null,
  historyTruncated = false,
}: {
  id?: string;
  revision?: number;
  owner?: string;
  canImportLegacy?: boolean;
  nextCursor?: string | null;
  historyTruncated?: boolean;
  messages?: Array<{
    id: string;
    seq: number;
    role: "user" | "assistant";
    parts: AIConversationPart[];
    createdAt: string;
  }>;
} = {}): Response {
  return Response.json({
    owner,
    conversation: {
      id,
      channel: "chat",
      revision,
      createdAt: "2026-07-06T00:00:00.000Z",
      updatedAt: "2026-07-06T00:00:00.000Z",
      messageCount: messages.length,
      oldestSeq: messages[0]?.seq ?? null,
      newestSeq: messages.at(-1)?.seq ?? null,
      historyTruncated,
      canImportLegacy,
    },
    messages,
    page: { nextCursor, hasMore: nextCursor !== null },
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
      return pageResponse({
        revision: 1,
        messages: [
          {
            id: "u1",
            seq: 1,
            role: "user",
            parts: [
              { type: "text", text: "hello" },
              {
                type: "file",
                mediaType: "image/png",
                url: "/api/ai/attachments/11111111-1111-4111-8111-111111111111.png",
              },
            ],
            createdAt: "2026-07-06T00:00:00.000Z",
          },
        ],
      });
    };

    const loaded = await loadAIConversation({
      channel: "chat",
      username: "Alice",
      localMessages: [],
    });
    expect(loaded.owner).toBe("alice");
    expect(loaded.messages[0]?.metadata?.createdAt).toBeInstanceOf(Date);
    expect(loaded.messages[0]?.parts[1]?.type).toBe("file");

    const context = await getAIConversationRequestContext({
      channel: "chat",
      username: "Alice",
      localMessages: [],
    });
    expect(context?.id).toBe(CHAT_ID);
    expect(context?.revision).toBe(1);
    expect(context?.operationId).toBeString();
    expect(requestCount).toBe(1);
  });

  test("imports an owned local transcript only when the server is empty", async () => {
    const requests: Array<{ method: string; body: unknown }> = [];
    let getCount = 0;
    globalThis.fetch = async (_input, init) => {
      const method = init?.method ?? "GET";
      requests.push({
        method,
        body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
      });
      if (method === "POST") {
        return Response.json({ imported: 2 }, { status: 201 });
      }
      getCount += 1;
      return getCount === 1
        ? pageResponse()
        : pageResponse({
            revision: 1,
            messages: [
              {
                id: "u1",
                seq: 1,
                role: "user",
                parts: [{ type: "text", text: "hello" }],
                createdAt: "2026-07-06T00:00:00.000Z",
              },
              {
                id: "a1",
                seq: 2,
                role: "assistant",
                parts: [{ type: "text", text: "hi" }],
                createdAt: "2026-07-06T00:00:01.000Z",
              },
            ],
          });
    };

    const loaded = await loadAIConversation({
      channel: "chat",
      username: "alice",
      localMessages: [
        message("u1", "user", "hello"),
        message("a1", "assistant", "hi"),
      ],
    });

    expect(loaded.messages.map((entry) => entry.id)).toEqual(["u1", "a1"]);
    expect(requests.map((request) => request.method)).toEqual([
      "GET",
      "POST",
      "GET",
    ]);
    expect(requests[1]?.body).toMatchObject({
      conversationId: CHAT_ID,
      expectedRevision: 0,
      historyTruncated: false,
    });
  });

  test("resets to the server-returned conversation id", async () => {
    globalThis.fetch = async (_input, init) => {
      if (init?.method === "POST") {
        return Response.json({
          owner: "alice",
          conversation: {
            id: RESET_ID,
            channel: "chat",
            revision: 0,
            createdAt: "2026-07-06T00:01:00.000Z",
            updatedAt: "2026-07-06T00:01:00.000Z",
            messageCount: 0,
            oldestSeq: null,
            newestSeq: null,
            historyTruncated: false,
            canImportLegacy: false,
          },
          reset: true,
        });
      }
      return pageResponse({
        revision: 1,
        messages: [
          {
            id: "u1",
            seq: 1,
            role: "user",
            parts: [{ type: "text", text: "hello" }],
            createdAt: "2026-07-06T00:00:00.000Z",
          },
        ],
      });
    };

    const reset = await resetAIConversationSession({
      channel: "chat",
      username: "alice",
      localMessages: [message("u1", "user", "hello")],
    });
    expect(reset.id).toBe(RESET_ID);

    const context = await getAIConversationRequestContext({
      channel: "chat",
      username: "alice",
      localMessages: [],
    });
    expect(context?.id).toBe(RESET_ID);
  });

  test("refreshes once after a reset conflict and keeps repeated resets on the current conversation", async () => {
    const requests: Array<{ method: string; body: Record<string, unknown> | null }> =
      [];
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
          ? pageResponse({
              id: CHAT_ID,
              revision: 2,
              messages: [
                {
                  id: "u1",
                  seq: 1,
                  role: "user",
                  parts: [{ type: "text", text: "stale local turn" }],
                  createdAt: "2026-07-06T00:00:00.000Z",
                },
              ],
            })
          : pageResponse({ id: CURRENT_ID });
      }

      postCount += 1;
      if (postCount === 1) {
        return Response.json({ error: "revision_conflict" }, { status: 409 });
      }
      return Response.json({
        owner: "alice",
        conversation: {
          id: RESET_ID,
          channel: "chat",
          revision: 0,
          createdAt: "2026-07-06T00:01:00.000Z",
          updatedAt: "2026-07-06T00:01:00.000Z",
          messageCount: 0,
          oldestSeq: null,
          newestSeq: null,
          historyTruncated: false,
          canImportLegacy: false,
        },
        reset: true,
      });
    };

    await loadAIConversation({
      channel: "chat",
      username: "alice",
      localMessages: [],
    });
    const reset = await resetAIConversationSession({
      channel: "chat",
      username: "alice",
      localMessages: [message("local-private", "user", "do not reimport")],
    });

    expect(reset.id).toBe(RESET_ID);
    expect(requests.map((request) => request.method)).toEqual([
      "GET",
      "POST",
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
      localMessages: [],
    });
    expect(context?.id).toBe(RESET_ID);

    await resetAIConversationSession({
      channel: "chat",
      username: "alice",
      localMessages: [],
    });
    expect(requests.map((request) => request.method)).toEqual([
      "GET",
      "POST",
      "GET",
      "POST",
      "POST",
    ]);
    expect(
      requests
        .filter((request) => request.method === "POST")
        .map((request) => request.body?.conversationId)
    ).toEqual([CHAT_ID, CURRENT_ID, RESET_ID]);
  });

  test("keeps cache-cleared same-owner loads from overwriting a new session", async () => {
    let resolveFirst:
      | ((response: Response) => void)
      | undefined;
    let requestCount = 0;
    globalThis.fetch = async () => {
      requestCount += 1;
      if (requestCount === 1) {
        return new Promise<Response>((resolve) => {
          resolveFirst = resolve;
        });
      }
      return pageResponse({
        id: CURRENT_ID,
        revision: 4,
        canImportLegacy: false,
      });
    };

    const staleLoad = loadAIConversation({
      channel: "chat",
      username: "alice",
      localMessages: [],
    });
    expect(resolveFirst).toBeFunction();

    clearAIConversationSessionCache();
    const currentLoad = await loadAIConversation({
      channel: "chat",
      username: "alice",
      localMessages: [],
    });
    expect(currentLoad.conversation.id).toBe(CURRENT_ID);

    resolveFirst?.(
      pageResponse({
        id: CHAT_ID,
        revision: 1,
        canImportLegacy: false,
      })
    );
    const staleResult = await staleLoad;
    expect(staleResult.stale).toBe(true);

    const context = await getAIConversationRequestContext({
      channel: "chat",
      username: "alice",
      localMessages: [],
    });
    expect(context?.id).toBe(CURRENT_ID);
    expect(requestCount).toBe(2);
  });

  test("restarts multi-page hydration once when the revision changes", async () => {
    const urls: string[] = [];
    let requestCount = 0;
    globalThis.fetch = async (input) => {
      urls.push(String(input));
      requestCount += 1;
      if (requestCount === 1) {
        return pageResponse({
          id: CHAT_ID,
          revision: 1,
          nextCursor: "older-page",
          canImportLegacy: false,
          messages: [
            {
              id: "newest-stale",
              seq: 2,
              role: "assistant",
              parts: [{ type: "text", text: "stale" }],
              createdAt: "2026-07-06T00:00:02.000Z",
            },
          ],
        });
      }
      if (requestCount === 2) {
        return pageResponse({
          id: CHAT_ID,
          revision: 2,
          canImportLegacy: false,
          messages: [
            {
              id: "older-raced",
              seq: 1,
              role: "user",
              parts: [{ type: "text", text: "raced" }],
              createdAt: "2026-07-06T00:00:01.000Z",
            },
          ],
        });
      }
      return pageResponse({
        id: CHAT_ID,
        revision: 2,
        canImportLegacy: false,
        messages: [
          {
            id: "fresh",
            seq: 3,
            role: "assistant",
            parts: [{ type: "text", text: "fresh snapshot" }],
            createdAt: "2026-07-06T00:00:03.000Z",
          },
        ],
      });
    };

    const loaded = await loadAIConversation({
      channel: "chat",
      username: "alice",
      localMessages: [],
    });
    expect(loaded.conversation.revision).toBe(2);
    expect(loaded.messages.map((entry) => entry.id)).toEqual(["fresh"]);
    expect(urls[0]).not.toContain("cursor=");
    expect(urls[1]).toContain("cursor=older-page");
    expect(urls[2]).not.toContain("cursor=");
  });

  test("restarts multi-page hydration once after an older page returns a 409", async () => {
    const urls: string[] = [];
    let requestCount = 0;
    globalThis.fetch = async (input) => {
      urls.push(String(input));
      requestCount += 1;
      if (requestCount === 1) {
        return pageResponse({
          id: CHAT_ID,
          revision: 1,
          nextCursor: "stale-older-page",
          canImportLegacy: false,
          messages: [
            {
              id: "newest-stale",
              seq: 2,
              role: "assistant",
              parts: [{ type: "text", text: "stale" }],
              createdAt: "2026-07-06T00:00:02.000Z",
            },
          ],
        });
      }
      if (requestCount === 2) {
        return Response.json(
          { error: "conversation_changed" },
          { status: 409 }
        );
      }
      return pageResponse({
        id: CURRENT_ID,
        revision: 2,
        canImportLegacy: false,
        messages: [
          {
            id: "fresh",
            seq: 1,
            role: "user",
            parts: [{ type: "text", text: "fresh snapshot" }],
            createdAt: "2026-07-06T00:00:03.000Z",
          },
        ],
      });
    };

    const loaded = await loadAIConversation({
      channel: "chat",
      username: "alice",
      localMessages: [],
    });
    expect(loaded.conversation.id).toBe(CURRENT_ID);
    expect(loaded.messages.map((entry) => entry.id)).toEqual(["fresh"]);
    expect(urls[0]).not.toContain("cursor=");
    expect(urls[1]).toContain("cursor=stale-older-page");
    expect(urls[2]).not.toContain("cursor=");
  });

  test("projects completed tool state with visible text", () => {
    const richMessage: AIChatMessage = {
      id: "a1",
      role: "assistant",
      parts: [
        { type: "text", text: "Visible" },
        {
          type: "tool-launchApp",
          toolCallId: "tool-1",
          state: "output-available",
          input: { id: "finder" },
          output: { veryLarge: "payload" },
        },
      ],
      metadata: { createdAt: new Date("2026-07-06T00:00:00.000Z") },
    };

    expect(projectAIConversationMessages([richMessage])).toEqual([
      {
        id: "a1",
        role: "assistant",
        parts: richMessage.parts,
        metadata: { createdAt: "2026-07-06T00:00:00.000Z" },
      },
    ]);
  });

  test("compacts oversized tool payloads and budgets complete newest turns", () => {
    expect(AI_CONVERSATION_REQUEST_MAX_BYTES).toBe(
      4 * 1024 * 1024 - 64 * 1024
    );
    expect(AI_CONVERSATION_IMPORT_REQUEST_MAX_BYTES).toBe(
      AI_CONVERSATION_REQUEST_MAX_BYTES
    );
    const oversizedToolMessage: AIChatMessage = {
      id: "a1",
      role: "assistant",
      parts: [
        {
          type: "tool-read",
          toolCallId: "read-1",
          state: "output-available",
          input: { path: "/Documents/normal.txt" },
          output: { content: "x".repeat(3 * 1024 * 1024) },
        },
        {
          type: "tool-write",
          toolCallId: "write-1",
          state: "output-available",
          input: { content: "y".repeat(3 * 1024 * 1024) },
          output: { saved: true },
        },
      ],
      metadata: { createdAt: new Date("2026-07-06T00:00:01.000Z") },
    };
    const compacted = buildAIConversationImportRequest({
      conversationId: CHAT_ID,
      operationId: "import-large-tool",
      messages: [
        message("u1", "user", "read this"),
        oversizedToolMessage,
        message("u2", "user", "thanks"),
        message("a2", "assistant", "done"),
      ],
    });
    const toolPart = compacted.messages[1]?.parts[0];
    const inputToolPart = compacted.messages[1]?.parts[1];

    expect(new TextEncoder().encode(JSON.stringify(compacted)).byteLength).toBeLessThan(
      AI_CONVERSATION_IMPORT_REQUEST_MAX_BYTES
    );
    expect(toolPart).toMatchObject({
      type: "tool-read",
      toolCallId: "read-1",
      state: "output-available",
      input: { path: "/Documents/normal.txt" },
      output: AI_CONVERSATION_TOOL_PAYLOAD_OMISSION,
    });
    expect(inputToolPart).toMatchObject({
      type: "tool-write",
      toolCallId: "write-1",
      state: "output-available",
      input: AI_CONVERSATION_TOOL_PAYLOAD_OMISSION,
      output: { saved: true },
    });
    expect(compacted.historyTruncated).toBe(true);

    const budgeted = buildAIConversationImportRequest({
      conversationId: CHAT_ID,
      operationId: "import-budgeted",
      messages: [
        message("u-old", "user", "o".repeat(400)),
        message("a-old", "assistant", "o".repeat(400)),
        message("u-new", "user", "n".repeat(400)),
        message("a-new", "assistant", "n".repeat(400)),
      ],
      requestByteLimit: 1_300,
    });
    expect(budgeted.messages.map((entry) => entry.id)).toEqual([
      "u-new",
      "a-new",
    ]);
    expect(budgeted.historyTruncated).toBe(true);
    expect(new TextEncoder().encode(JSON.stringify(budgeted)).byteLength).toBeLessThanOrEqual(
      1_300
    );
  });

  test("refuses an import when no user turn fits the request", async () => {
    const requests: string[] = [];
    const oversizedNewestAssistant: AIChatMessage = {
      id: "a-large",
      role: "assistant",
      parts: [
        {
          type: "tool-read",
          toolCallId: "read-large",
          state: "output-error",
          input: { path: "/Documents/large.txt" },
          errorText: "x".repeat(800 * 1024),
        },
      ],
      metadata: { createdAt: new Date("2026-07-06T00:00:01.000Z") },
    };
    globalThis.fetch = async (_input, init) => {
      requests.push(init?.method ?? "GET");
      return pageResponse();
    };

    await expect(
      loadAIConversation({
        channel: "chat",
        username: "alice",
        localMessages: [
          message("u-large", "user", "read the oversized result"),
          oversizedNewestAssistant,
        ],
      })
    ).rejects.toThrow("Conversation import could not retain a user turn");
    expect(requests).toEqual(["GET"]);
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
    expect(
      buildAIConversationRequestBody({
        id: "sdk-chat",
        messages,
        trigger: "submit-message",
      })
    ).toEqual({
      id: "sdk-chat",
      trigger: "submit-message",
      messages: projectAIConversationMessages(messages),
    });
  });

  test("compacts a legacy history over 4 MiB and drops oldest whole turns", () => {
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
      message("u-old", "user", "o".repeat(2 * 1024 * 1024)),
      message("a-old", "assistant", "old answer"),
      message("u-recent", "user", "r".repeat(2 * 1024 * 1024)),
      recentToolMessage,
      message("u-current", "user", "keep this current turn"),
    ];
    expect(
      new TextEncoder().encode(JSON.stringify({ messages })).byteLength
    ).toBeGreaterThan(4 * 1024 * 1024);

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

  test("rejects a legacy request when the current turn alone is oversized", () => {
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

  test("rejects a cookie owner mismatch before importing local messages", async () => {
    const methods: string[] = [];
    globalThis.fetch = async (_input, init) => {
      methods.push(init?.method ?? "GET");
      return pageResponse({ owner: "bob" });
    };

    await expect(
      loadAIConversation({
        channel: "chat",
        username: "alice",
        localMessages: [message("u1", "user", "Alice private")],
      })
    ).rejects.toThrow("Authenticated conversation owner changed");
    expect(methods).toEqual(["GET"]);
  });

  test("does not re-import local history after a server reset", async () => {
    const methods: string[] = [];
    globalThis.fetch = async (_input, init) => {
      methods.push(init?.method ?? "GET");
      return pageResponse({ id: RESET_ID, canImportLegacy: false });
    };

    const loaded = await loadAIConversation({
      channel: "chat",
      username: "alice",
      localMessages: [message("u1", "user", "cleared private history")],
      force: true,
      importLocalIfEmpty: true,
    });
    expect(loaded.messages).toEqual([]);
    expect(methods).toEqual(["GET"]);
  });
});
