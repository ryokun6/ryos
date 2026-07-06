import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  buildAIConversationRequestBody,
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
}: {
  id?: string;
  revision?: number;
  owner?: string;
  canImportLegacy?: boolean;
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
      historyTruncated: false,
      canImportLegacy,
    },
    messages,
    page: { nextCursor: null, hasMore: false },
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
            parts: [{ type: "text", text: "hello" }],
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

  test("hydrates persisted image, source, and tool parts", async () => {
    globalThis.fetch = async () =>
      pageResponse({
        revision: 1,
        messages: [
          {
            id: "a-rich",
            seq: 1,
            role: "assistant",
            parts: [
              { type: "text", text: "Here it is" },
              {
                type: "tool-generateHtml",
                toolCallId: "call-1",
                state: "output-available",
                input: { prompt: "page" },
                output: { html: "<main>Synced</main>" },
              },
              {
                type: "source-url",
                sourceId: "source-1",
                url: "https://example.com",
                title: "Example",
              },
            ],
            createdAt: "2026-07-06T00:00:00.000Z",
          },
        ],
      });

    const loaded = await loadAIConversation({
      channel: "chat",
      username: "alice",
      localMessages: [],
    });
    expect(loaded.messages[0]?.parts).toEqual([
      { type: "text", text: "Here it is" },
      {
        type: "tool-generateHtml",
        toolCallId: "call-1",
        state: "output-available",
        input: { prompt: "page" },
        output: { html: "<main>Synced</main>" },
      },
      {
        type: "source-url",
        sourceId: "source-1",
        url: "https://example.com",
        title: "Example",
      },
    ]);
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

  test("projects rich message parts for legacy import", () => {
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
        metadata: { createdAt: "2026-07-06T00:00:00.000Z" },
      },
    ]);
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
      messages,
    });
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
