import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  clearAIConversationSessionCache,
  getAIConversationRequestContext,
  loadAIConversation,
  projectAIConversationMessages,
  resetAIConversationSession,
} from "../src/api/aiConversations";
import type { AIChatMessage } from "../src/types/chat";

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
}: {
  id?: string;
  revision?: number;
  messages?: Array<{
    id: string;
    seq: number;
    role: "user" | "assistant";
    parts: Array<{ type: "text"; text: string }>;
    createdAt: string;
  }>;
} = {}): Response {
  return Response.json({
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
    });
  });

  test("resets to the server-returned conversation id", async () => {
    globalThis.fetch = async (_input, init) => {
      if (init?.method === "POST") {
        return Response.json({
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

  test("projects text without tool payloads", () => {
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
        parts: [{ type: "text", text: "Visible" }],
        metadata: { createdAt: "2026-07-06T00:00:00.000Z" },
      },
    ]);
  });
});
