import { describe, expect, test } from "bun:test";
import {
  getChatMessageTimestamp,
  resolveDailyNoteSourceTimestamp,
  type NormalizedConversationMessage,
} from "../api/ai/extract-memories";

describe("extract memories timestamp helpers", () => {
  test("parses chat message timestamps from metadata, strings, and numbers", () => {
    const isoTimestamp = "2026-03-08T01:30:00.000Z";

    expect(
      getChatMessageTimestamp({
        role: "user",
        metadata: {
          createdAt: isoTimestamp,
        },
      })
    ).toBe(new Date(isoTimestamp).getTime());

    expect(
      getChatMessageTimestamp({
        role: "assistant",
        createdAt: 12345,
      })
    ).toBe(12345);

    expect(
      getChatMessageTimestamp({
        role: "user",
        timestamp: 67890,
      })
    ).toBe(67890);
  });

  test("resolves a real source timestamp from the referenced user message", () => {
    const messages: NormalizedConversationMessage[] = [
      {
        role: "user",
        text: "i need to review the cron behavior",
        sourceTimestamp: 100,
      },
      {
        role: "assistant",
        text: "want me to review it with you?",
        sourceTimestamp: 110,
      },
      {
        role: "user",
        text: "yes, tomorrow morning",
        sourceTimestamp: 120,
      },
    ];

    expect(resolveDailyNoteSourceTimestamp(messages, 2)).toBe(120);
  });

  test("falls back to the nearest prior user timestamp when an assistant index is returned", () => {
    const messages: NormalizedConversationMessage[] = [
      {
        role: "user",
        text: "i need to review the cron behavior",
        sourceTimestamp: 100,
      },
      {
        role: "assistant",
        text: "want me to review it with you?",
        sourceTimestamp: 110,
      },
      {
        role: "assistant",
        text: "i can remind you tomorrow morning",
        sourceTimestamp: 120,
      },
    ];

    expect(resolveDailyNoteSourceTimestamp(messages, 2)).toBe(100);
  });
});
