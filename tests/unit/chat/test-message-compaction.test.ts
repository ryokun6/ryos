import { describe, expect, test } from "bun:test";
import {
  AI_MESSAGE_COMPACTION_MAX,
  COMPACTED_MESSAGES_MARKER,
  compactAiMessages,
  isMessagesCompactedMarker,
  withCompactedMessagesMarker,
} from "../../../src/apps/chats/utils/messageCompaction";
import { buildDisplayMessages } from "../../../src/apps/chats/utils/messages";
import type { AIChatMessage } from "../../../src/types/chat";

function makeAiMessage(
  id: string,
  role: "user" | "assistant"
): AIChatMessage {
  return {
    id,
    role,
    parts: [{ type: "text", text: `${role}-${id}` }],
    metadata: { createdAt: new Date(Number(id) * 1000) },
  };
}

describe("compactAiMessages", () => {
  test("returns unchanged when under the cap", () => {
    const messages = [
      makeAiMessage("1", "assistant"),
      makeAiMessage("2", "user"),
      makeAiMessage("3", "assistant"),
    ];
    const result = compactAiMessages(messages, 10);
    expect(result.compacted).toBe(false);
    expect(result.messages).toEqual(messages);
  });

  test("cuts at a user-turn boundary when over the cap", () => {
    const messages = [
      makeAiMessage("1", "assistant"),
      makeAiMessage("2", "user"),
      makeAiMessage("3", "assistant"),
      makeAiMessage("4", "user"),
      makeAiMessage("5", "assistant"),
      makeAiMessage("6", "user"),
      makeAiMessage("7", "assistant"),
    ];
    const result = compactAiMessages(messages, 4);
    expect(result.compacted).toBe(true);
    expect(result.messages.map((message) => message.id)).toEqual([
      "4",
      "5",
      "6",
      "7",
    ]);
  });

  test("defaults to the shared AI compaction max", () => {
    expect(AI_MESSAGE_COMPACTION_MAX).toBe(200);
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
