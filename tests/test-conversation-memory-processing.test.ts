import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AbortableFetchOptions } from "../src/utils/abortableFetch";
import type { AIChatMessage } from "../src/types/chat";
import { ASSISTANT_SUMMON_MESSAGE } from "../src/shared/assistantGreeting";
import {
  prepareConversationMessagesForMemory,
  processConversationMemories,
} from "../src/utils/processConversationMemories";

const createdAt = new Date("2026-07-05T20:00:00.000Z");

function textMessage(
  id: string,
  role: "user" | "assistant",
  text: string
): AIChatMessage {
  return {
    id,
    role,
    parts: [{ type: "text", text }],
    metadata: { createdAt },
  };
}

describe("conversation memory processing", () => {
  test("keeps user and assistant text while dropping internal and non-text content", () => {
    const userMessage = textMessage("user", "user", "I am learning Korean");
    userMessage.parts.push({
      type: "reasoning",
      text: "not visible conversation text",
    });

    const prepared = prepareConversationMessagesForMemory([
      textMessage("summon", "user", ASSISTANT_SUMMON_MESSAGE),
      userMessage,
      textMessage("assistant", "assistant", "Let's practice together"),
    ]);

    expect(prepared).toEqual([
      {
        role: "user",
        parts: [{ type: "text", text: "I am learning Korean" }],
        metadata: { createdAt: createdAt.toISOString() },
      },
      {
        role: "assistant",
        parts: [{ type: "text", text: "Let's practice together" }],
        metadata: { createdAt: createdAt.toISOString() },
      },
    ]);
  });

  test("skips unauthenticated and summon-only conversations", async () => {
    let requestCount = 0;
    const dependencies = {
      request: async () => {
        requestCount += 1;
        return new Response();
      },
      resolveApiUrl: (path: string) => path,
      getTimeZone: () => "UTC",
    };

    expect(
      await processConversationMemories(
        {
          messages: [textMessage("user", "user", "remember this")],
          isAuthenticated: false,
          source: "assistant",
        },
        dependencies
      )
    ).toEqual({ status: "skipped", reason: "not-authenticated" });

    expect(
      await processConversationMemories(
        {
          messages: [
            textMessage("summon", "user", ASSISTANT_SUMMON_MESSAGE),
            textMessage("greeting", "assistant", "Hi there"),
          ],
          isAuthenticated: true,
          source: "assistant",
        },
        dependencies
      )
    ).toEqual({ status: "skipped", reason: "no-user-content" });
    expect(requestCount).toBe(0);
  });

  test("posts a compact authenticated transcript with timezone metadata", async () => {
    let requestedUrl: string | undefined;
    let requestedOptions: AbortableFetchOptions | undefined;

    const result = await processConversationMemories(
      {
        messages: [
          textMessage("user", "user", "My favorite tea is oolong"),
          textMessage("assistant", "assistant", "I'll remember that"),
        ],
        isAuthenticated: true,
        source: "assistant",
      },
      {
        request: async (url, options) => {
          requestedUrl = url;
          requestedOptions = options;
          return new Response(
            JSON.stringify({ extracted: 1, dailyNotes: 1 }),
            { headers: { "Content-Type": "application/json" } }
          );
        },
        resolveApiUrl: (path) => `/server${path}`,
        getTimeZone: () => "Asia/Seoul",
      }
    );

    expect(result).toEqual({
      status: "processed",
      extracted: 1,
      dailyNotes: 1,
    });
    expect(requestedUrl).toBe("/server/api/ai/extract-memories");
    expect(requestedOptions?.method).toBe("POST");
    expect(requestedOptions?.headers).toEqual({
      "Content-Type": "application/json",
      "X-User-Timezone": "Asia/Seoul",
    });
    expect(JSON.parse(String(requestedOptions?.body))).toEqual({
      timeZone: "Asia/Seoul",
      messages: [
        {
          role: "user",
          parts: [{ type: "text", text: "My favorite tea is oolong" }],
          metadata: { createdAt: createdAt.toISOString() },
        },
        {
          role: "assistant",
          parts: [{ type: "text", text: "I'll remember that" }],
          metadata: { createdAt: createdAt.toISOString() },
        },
      ],
    });
  });

  test("both Ryo chat surfaces process memory before clearing", () => {
    const chatsSource = readFileSync(
      resolve(process.cwd(), "src/apps/chats/hooks/useAiChat.ts"),
      "utf8"
    );
    const assistantSource = readFileSync(
      resolve(process.cwd(), "src/components/assistant/useAssistantChat.ts"),
      "utf8"
    );

    expect(chatsSource).toMatch(
      /processConversationMemories\(\{[\s\S]*?source: "chats"/
    );
    expect(assistantSource).toMatch(
      /processConversationMemories\(\{[\s\S]*?source: "assistant"/
    );
    expect(chatsSource).toContain(
      "const messagesToAnalyze = [...getSharedAiChat().messages]"
    );
    expect(assistantSource).toContain("messages: [...chat.messages]");
  });
});
