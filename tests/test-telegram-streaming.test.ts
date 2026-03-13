import { describe, expect, test } from "bun:test";
import { simplifyTelegramCitationDisplay } from "../api/_utils/telegram-format";
import {
  collectTelegramReplyText,
  splitTelegramMessageText,
  streamTelegramReply,
  TELEGRAM_MAX_MESSAGE_LENGTH,
} from "../api/_utils/telegram-streaming";

async function* makeTextStream(chunks: string[]): AsyncGenerator<string> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

describe("telegram streaming helpers", () => {
  test("splitTelegramMessageText preserves content across Telegram-sized pages", () => {
    const text = `${"a".repeat(TELEGRAM_MAX_MESSAGE_LENGTH)} ${"b".repeat(25)}`;
    const parts = splitTelegramMessageText(text);

    expect(parts).toHaveLength(2);
    expect(parts[0].length).toBeLessThanOrEqual(TELEGRAM_MAX_MESSAGE_LENGTH);
    expect(parts[1].length).toBeLessThanOrEqual(TELEGRAM_MAX_MESSAGE_LENGTH);
    expect(parts.join("")).toBe(text);
  });

  test("streams previews with sendMessageDraft and sends the final message once", async () => {
    const calls: Array<{ type: string; text: string; replyToMessageId?: number }> = [];

    const result = await streamTelegramReply({
      botToken: "bot-token",
      chatId: "chat-1",
      draftId: 77,
      replyToMessageId: 55,
      textStream: makeTextStream(["hello", " there"]),
      updateIntervalMs: 0,
      minCharDelta: 1,
      deps: {
        sendDraft: async ({ text }) => {
          calls.push({ type: "draft", text });
        },
        sendMessage: async ({ text, replyToMessageId }) => {
          calls.push({ type: "send", text, replyToMessageId });
          return 501;
        },
      },
    });

    expect(result).toEqual({
      text: "hello there",
      previewMode: "draft",
      messageIds: [501],
    });
    expect(calls).toEqual([
      { type: "draft", text: "hello" },
      { type: "draft", text: "hello there" },
      { type: "send", text: "hello there", replyToMessageId: 55 },
    ]);
  });

  test("collects a formatted reply without publishing previews", async () => {
    const result = await collectTelegramReplyText({
      textStream: makeTextStream([
        "# Update\n- **it shipped yesterday** ([example.com](https://example.com/news)).",
      ]),
      maxReplyLength: 24,
      formatText: simplifyTelegramCitationDisplay,
    });

    expect(result).toBe("Update\n• it shipped...");
  });

  test("formats streamed Telegram text before previewing and sending", async () => {
    const calls: Array<{ type: string; text: string; replyToMessageId?: number }> = [];

    const result = await streamTelegramReply({
      botToken: "bot-token",
      chatId: "chat-1",
      draftId: 90,
      replyToMessageId: 55,
      textStream: makeTextStream([
        "# Update\n- **it shipped yesterday** ([example.com](https://example.com/news)).",
      ]),
      updateIntervalMs: 0,
      minCharDelta: 1,
      formatText: simplifyTelegramCitationDisplay,
      deps: {
        sendDraft: async ({ text }) => {
          calls.push({ type: "draft", text });
        },
        sendMessage: async ({ text, replyToMessageId }) => {
          calls.push({ type: "send", text, replyToMessageId });
          return 777;
        },
      },
    });

    expect(result).toEqual({
      text: "Update\n• it shipped yesterday.",
      previewMode: "draft",
      messageIds: [777],
    });
    expect(calls).toEqual([
      { type: "draft", text: "Update\n• it shipped yesterday." },
      { type: "send", text: "Update\n• it shipped yesterday.", replyToMessageId: 55 },
    ]);
  });

  test("falls back to legacy send/edit when drafts are unsupported", async () => {
    const calls: Array<{
      type: string;
      text?: string;
      replyToMessageId?: number;
      messageId?: number;
    }> = [];

    const result = await streamTelegramReply({
      botToken: "bot-token",
      chatId: "chat-1",
      draftId: 78,
      replyToMessageId: 56,
      textStream: makeTextStream(["hello", " again"]),
      updateIntervalMs: 0,
      minCharDelta: 1,
      deps: {
        sendDraft: async () => {
          throw new Error("Telegram sendMessageDraft failed (404): Not Found");
        },
        sendMessage: async ({ text, replyToMessageId }) => {
          calls.push({ type: "send", text, replyToMessageId });
          return 601;
        },
        editMessage: async ({ text, messageId }) => {
          calls.push({ type: "edit", text, messageId });
        },
      },
    });

    expect(result).toEqual({
      text: "hello again",
      previewMode: "legacy",
      messageIds: [601],
    });
    expect(calls).toEqual([
      { type: "send", text: "hello", replyToMessageId: 56 },
      { type: "edit", text: "hello again", messageId: 601 },
    ]);
  });

  test("sends overflow pages after the streamed preview", async () => {
    const longText = `${"a".repeat(TELEGRAM_MAX_MESSAGE_LENGTH)} ${"b".repeat(12)}`;
    const calls: Array<{ type: string; text: string; replyToMessageId?: number }> = [];

    const result = await streamTelegramReply({
      botToken: "bot-token",
      chatId: "chat-1",
      draftId: 79,
      replyToMessageId: 57,
      textStream: makeTextStream([longText]),
      updateIntervalMs: 0,
      minCharDelta: 1,
      deps: {
        sendDraft: async ({ text }) => {
          calls.push({ type: "draft", text });
        },
        sendMessage: async ({ text, replyToMessageId }) => {
          calls.push({ type: "send", text, replyToMessageId });
          return calls.length + 700;
        },
      },
    });

    expect(result.previewMode).toBe("draft");
    expect(result.text).toBe(longText);
    expect(calls).toEqual([
      { type: "draft", text: "a".repeat(TELEGRAM_MAX_MESSAGE_LENGTH) },
      {
        type: "send",
        text: "a".repeat(TELEGRAM_MAX_MESSAGE_LENGTH),
        replyToMessageId: 57,
      },
      { type: "send", text: ` ${"b".repeat(12)}`, replyToMessageId: undefined },
    ]);
  });

  test("truncates replies before previewing and sending", async () => {
    const calls: Array<{ type: string; text: string; replyToMessageId?: number }> = [];

    const result = await streamTelegramReply({
      botToken: "bot-token",
      chatId: "chat-1",
      draftId: 80,
      replyToMessageId: 58,
      textStream: makeTextStream(["abcdefghijklmno"]),
      updateIntervalMs: 0,
      minCharDelta: 1,
      maxReplyLength: 10,
      deps: {
        sendDraft: async ({ text }) => {
          calls.push({ type: "draft", text });
        },
        sendMessage: async ({ text, replyToMessageId }) => {
          calls.push({ type: "send", text, replyToMessageId });
          return 801;
        },
      },
    });

    expect(result).toEqual({
      text: "abcdefg...",
      previewMode: "draft",
      messageIds: [801],
    });
    expect(calls).toEqual([
      { type: "draft", text: "abcdefg..." },
      { type: "send", text: "abcdefg...", replyToMessageId: 58 },
    ]);
  });
});
