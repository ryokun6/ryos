import { describe, expect, test } from "bun:test";
import {
  AI_MESSAGE_COMPACTION_MAX,
  COMPACTED_MESSAGES_MARKER,
  compactAiMessages,
  isMessagesCompactedMarker,
  withCompactedMessagesMarker,
} from "../../../src/apps/chats/utils/messageCompaction";
import { buildDisplayMessages } from "../../../src/apps/chats/utils/messages";
import {
  AI_CHAT_COMPACTION_MESSAGE_SAFETY_MAX,
  AI_MODELS,
  getModelConversationTokenBudget,
} from "../../../src/shared/aiModels";
import {
  compactMessagesByTokenBudget,
  estimateTextTokens,
  estimateUIMessageTokens,
} from "../../../src/shared/aiConversationCompaction";
import type { AIChatMessage } from "../../../src/types/chat";

function makeAiMessage(
  id: string,
  role: "user" | "assistant",
  text = `${role}-${id}`
): AIChatMessage {
  return {
    id,
    role,
    parts: [{ type: "text", text }],
    metadata: { createdAt: new Date(Number(id) * 1000) },
  };
}

describe("token estimation", () => {
  test("estimates text tokens conservatively from code points", () => {
    expect(estimateTextTokens("abcd")).toBe(1);
    expect(estimateTextTokens("a".repeat(8))).toBe(2);
  });

  test("counts tool payloads toward message size", () => {
    const tokens = estimateUIMessageTokens({
      role: "assistant",
      parts: [
        {
          type: "tool-read",
          state: "output-available",
          input: { path: "/Documents/note.md" },
          output: { content: "x".repeat(400) },
        },
      ],
    });
    expect(tokens).toBeGreaterThan(80);
  });
});

describe("compactMessagesByTokenBudget", () => {
  test("returns unchanged when under the budget", () => {
    const messages = [
      makeAiMessage("1", "assistant"),
      makeAiMessage("2", "user"),
      makeAiMessage("3", "assistant"),
    ];
    const result = compactMessagesByTokenBudget(messages, { maxTokens: 10_000 });
    expect(result.compacted).toBe(false);
    expect(result.messages).toEqual(messages);
  });

  test("keeps newest turns that fit the token budget", () => {
    const bulky = "y".repeat(400); // ~100 tokens
    const messages = [
      makeAiMessage("1", "user", bulky),
      makeAiMessage("2", "assistant", bulky),
      makeAiMessage("3", "user", bulky),
      makeAiMessage("4", "assistant", bulky),
      makeAiMessage("5", "user", bulky),
      makeAiMessage("6", "assistant", bulky),
    ];
    const result = compactMessagesByTokenBudget(messages, { maxTokens: 250 });
    expect(result.compacted).toBe(true);
    expect(result.messages.map((message) => message.id)).toEqual(["5", "6"]);
    expect(result.estimatedTokens).toBeLessThanOrEqual(250);
  });
});

describe("compactAiMessages", () => {
  test("uses the selected model's conversation token budget", () => {
    const budget = getModelConversationTokenBudget("gpt-5.5");
    expect(budget).toBeLessThan(AI_MODELS["gpt-5.5"].contextWindow);
    expect(budget).toBeGreaterThan(500_000);

    const messages = [
      makeAiMessage("1", "assistant"),
      makeAiMessage("2", "user"),
      makeAiMessage("3", "assistant"),
    ];
    const result = compactAiMessages(messages, { modelId: "gpt-5.5" });
    expect(result.compacted).toBe(false);
    expect(result.messages).toEqual(messages);
  });

  test("compacts when an explicit token budget is exceeded", () => {
    const bulky = "z".repeat(400);
    const messages = [
      makeAiMessage("1", "user", bulky),
      makeAiMessage("2", "assistant", bulky),
      makeAiMessage("3", "user", bulky),
      makeAiMessage("4", "assistant", bulky),
    ];
    const result = compactAiMessages(messages, { maxTokens: 250 });
    expect(result.compacted).toBe(true);
    expect(result.messages.map((message) => message.id)).toEqual(["3", "4"]);
  });

  test("message safety max matches the shared constant", () => {
    expect(AI_MESSAGE_COMPACTION_MAX).toBe(AI_CHAT_COMPACTION_MESSAGE_SAFETY_MAX);
  });
});

describe("buildDisplayMessages compaction marker", () => {
  test("prepends compacted marker when AI history exceeds the render limit", () => {
    const aiMessages = Array.from({ length: 3 }, (_, index) =>
      makeAiMessage(String(index + 1), index % 2 === 0 ? "assistant" : "user")
    );
    const display = buildDisplayMessages({
      currentRoomId: null,
      currentRoomMessagesLimited: [],
      aiMessages,
      messageRenderLimit: 2,
      username: "ryo",
    });
    expect(display).toHaveLength(3);
    expect(isMessagesCompactedMarker(display[0]!)).toBe(true);
    expect(display[1]?.id).toBe("2");
    expect(display[2]?.id).toBe("3");
  });

  test("prepends compacted marker when aiHistoryCompacted is set", () => {
    const aiMessages = [
      makeAiMessage("1", "assistant"),
      makeAiMessage("2", "user"),
    ];
    const display = buildDisplayMessages({
      currentRoomId: null,
      currentRoomMessagesLimited: [],
      aiMessages,
      messageRenderLimit: 50,
      username: "ryo",
      aiHistoryCompacted: true,
    });
    expect(isMessagesCompactedMarker(display[0]!)).toBe(true);
    expect(display).toHaveLength(3);
  });

  test("prepends compacted marker for rooms with older messages", () => {
    const roomMessages = [
      {
        id: "m1",
        roomId: "room-1",
        username: "alice",
        content: "hi",
        timestamp: 1,
      },
      {
        id: "m2",
        roomId: "room-1",
        username: "bob",
        content: "hello",
        timestamp: 2,
      },
    ];
    const display = buildDisplayMessages({
      currentRoomId: "room-1",
      currentRoomMessagesLimited: roomMessages.slice(-1),
      roomHasOlderMessages: true,
      aiMessages: [],
      messageRenderLimit: 1,
      username: "bob",
    });
    expect(isMessagesCompactedMarker(display[0]!)).toBe(true);
    expect(display).toHaveLength(2);
    expect(display[1]?.serverId).toBe("m2");
  });

  test("does not duplicate an existing compacted marker", () => {
    const result = withCompactedMessagesMarker(
      [COMPACTED_MESSAGES_MARKER, makeAiMessage("1", "assistant")],
      true
    );
    expect(result.filter(isMessagesCompactedMarker)).toHaveLength(1);
  });
});
