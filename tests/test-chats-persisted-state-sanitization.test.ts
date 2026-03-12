import { describe, expect, test } from "bun:test";
import type { AIChatMessage } from "@/types/chat";
import {
  normalizePersistedAiMessages,
  sanitizePersistedChatsState,
} from "@/stores/chatsStateSanitizers";

const fallbackGreeting: AIChatMessage = {
  id: "1",
  role: "assistant",
  parts: [{ type: "text", text: "fallback greeting" }],
  metadata: { createdAt: new Date("2026-03-12T00:00:00.000Z") },
};

describe("Chats persisted state sanitization", () => {
  test("falls back to a safe greeting when persisted aiMessages is malformed", () => {
    const sanitized = sanitizePersistedChatsState(
      {
        aiMessages: {},
        rooms: {},
        roomMessages: { broken: {} },
        unreadCounts: { broken: "oops" },
        isSidebarVisible: "yes",
      },
      [fallbackGreeting]
    );

    expect(sanitized.aiMessages).toEqual([fallbackGreeting]);
    expect(sanitized.rooms).toEqual([]);
    expect(sanitized.roomMessages).toEqual({ broken: [] });
    expect(sanitized.unreadCounts).toEqual({});
    expect(sanitized.isSidebarVisible).toBe(true);
  });

  test("converts legacy content-only ai messages into text parts", () => {
    const normalized = normalizePersistedAiMessages([
      {
        id: "legacy-1",
        role: "assistant",
        content: "hello from old storage",
        metadata: { createdAt: "2026-03-12T01:23:45.000Z" },
      },
    ]);

    expect(normalized).not.toBeNull();
    expect(normalized).toHaveLength(1);
    expect(normalized?.[0]?.parts).toEqual([
      { type: "text", text: "hello from old storage" },
    ]);
    expect(normalized?.[0]?.metadata?.createdAt).toBeInstanceOf(Date);
  });
});
