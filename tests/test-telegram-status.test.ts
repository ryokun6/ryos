import { describe, expect, test } from "bun:test";
import {
  deleteTelegramMessage,
  editTelegramMessageText,
  sendTelegramChatAction,
  sendTelegramMessage,
} from "../api/_utils/telegram";
import {
  createTelegramStatusReporter,
  getTelegramToolStatusText,
} from "../api/_utils/telegram-status";

describe("telegram status helpers", () => {
  test("maps tool names to concise status text", () => {
    expect(getTelegramToolStatusText("memoryRead", {})).toBe("Checking memory...");
    expect(getTelegramToolStatusText("memoryWrite", {})).toBe("Saving to memory...");
    expect(getTelegramToolStatusText("calendarControl", { action: "createTodo" })).toBe(
      "Adding to calendar..."
    );
    expect(getTelegramToolStatusText("stickiesControl", { action: "clear" })).toBe(
      "Clearing sticky notes..."
    );
    expect(getTelegramToolStatusText("unknownTool", {})).toBe("Using a tool...");
  });

  test("keeps the latest tool status visible while typing continues", async () => {
    const calls: Array<{ type: string; text?: string; messageId?: number }> = [];

    const reporter = createTelegramStatusReporter({
      botToken: "bot-token",
      chatId: "chat-123",
      typingRefreshMs: 10,
      deps: {
        sendMessage: async ({ text }) => {
          calls.push({ type: "send", text });
          return 9001;
        },
        editMessage: async ({ text, messageId }) => {
          calls.push({ type: "edit", text, messageId });
        },
        deleteMessage: async ({ messageId }) => {
          calls.push({ type: "delete", messageId });
        },
        sendChatAction: async () => {
          calls.push({ type: "typing" });
        },
      },
    });

    await reporter.start();
    await Bun.sleep(25);
    await reporter.markTool("memoryRead", {});
    await reporter.markTool("memoryRead", {});
    await reporter.markThinking();
    await reporter.markTool("calendarControl", { action: "create" });
    await reporter.dispose();

    expect(calls.filter((call) => call.type === "typing").length).toBeGreaterThanOrEqual(2);
    expect(calls.filter((call) => call.type === "send")).toEqual([
      { type: "send", text: "Checking memory..." },
    ]);
    expect(calls.filter((call) => call.type === "edit")).toEqual([
      { type: "edit", text: "Adding to calendar...", messageId: 9001 },
    ]);
    expect(calls.at(-1)).toEqual({ type: "delete", messageId: 9001 });
  });
});

describe("telegram bot api helpers", () => {
  test("sendTelegramMessage returns the created message id", async () => {
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];

    const messageId = await sendTelegramMessage({
      botToken: "bot-token",
      chatId: "chat-1",
      text: "hello there",
      replyToMessageId: 55,
      disableNotification: true,
      fetchImpl: async (input, init) => {
        requests.push({
          url: String(input),
          body: JSON.parse(String(init?.body)),
        });
        return Response.json({
          ok: true,
          result: { message_id: 321 },
        });
      },
    });

    expect(messageId).toBe(321);
    expect(requests).toEqual([
      {
        url: "https://api.telegram.org/botbot-token/sendMessage",
        body: {
          chat_id: "chat-1",
          text: "hello there",
          disable_notification: true,
          reply_parameters: { message_id: 55 },
        },
      },
    ]);
  });

  test("edit, delete, and typing helpers call the matching telegram endpoints", async () => {
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      requests.push({
        url: String(input),
        body: JSON.parse(String(init?.body)),
      });
      return Response.json({ ok: true, result: true });
    };

    await editTelegramMessageText({
      botToken: "bot-token",
      chatId: "chat-1",
      messageId: 41,
      text: "updated",
      fetchImpl,
    });
    await deleteTelegramMessage({
      botToken: "bot-token",
      chatId: "chat-1",
      messageId: 41,
      fetchImpl,
    });
    await sendTelegramChatAction({
      botToken: "bot-token",
      chatId: "chat-1",
      action: "typing",
      fetchImpl,
    });

    expect(requests).toEqual([
      {
        url: "https://api.telegram.org/botbot-token/editMessageText",
        body: {
          chat_id: "chat-1",
          message_id: 41,
          text: "updated",
        },
      },
      {
        url: "https://api.telegram.org/botbot-token/deleteMessage",
        body: {
          chat_id: "chat-1",
          message_id: 41,
        },
      },
      {
        url: "https://api.telegram.org/botbot-token/sendChatAction",
        body: {
          chat_id: "chat-1",
          action: "typing",
        },
      },
    ]);
  });
});
