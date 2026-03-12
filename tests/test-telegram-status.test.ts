import { describe, expect, test } from "bun:test";
import {
  deleteTelegramMessage,
  editTelegramMessageText,
  sendTelegramChatAction,
  sendTelegramMessageDraft,
  sendTelegramMessage,
} from "../api/_utils/telegram";
import {
  createTelegramStatusReporter,
  getTelegramToolStatusText,
} from "../api/_utils/telegram-status";
import {
  getTelegramProviderStatusToolCall,
  getTelegramOpenAIProviderOptions,
} from "../api/webhooks/telegram";

describe("telegram status helpers", () => {
  test("maps tool names to concise status text", () => {
    expect(getTelegramToolStatusText("web_search", {})).toBe("Searching the web...");
    expect(getTelegramToolStatusText("webSearch", {})).toBe("Searching the web...");
    expect(getTelegramToolStatusText("google_search", {})).toBe("Searching the web...");
    expect(getTelegramToolStatusText("memoryRead", {})).toBe("Checking memory...");
    expect(getTelegramToolStatusText("memoryWrite", {})).toBe("Saving to memory...");
    expect(getTelegramToolStatusText("documentsControl", { action: "write" })).toBe(
      "Saving document..."
    );
    expect(getTelegramToolStatusText("calendarControl", { action: "createTodo" })).toBe(
      "Adding to calendar..."
    );
    expect(getTelegramToolStatusText("stickiesControl", { action: "clear" })).toBe(
      "Clearing sticky notes..."
    );
    expect(getTelegramToolStatusText("contactsControl", { action: "update" })).toBe(
      "Updating contact..."
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

  test("detects provider-executed tool chunks for telegram status updates", () => {
    expect(
      getTelegramProviderStatusToolCall({
        type: "tool-input-start",
        id: "call-1",
        toolName: "web_search",
        providerExecuted: true,
      })
    ).toEqual({
      toolCallId: "call-1",
      toolName: "web_search",
      input: undefined,
    });

    expect(
      getTelegramProviderStatusToolCall({
        type: "tool-call",
        toolCallId: "call-2",
        toolName: "google_search",
        input: { query: "weather sf" },
        providerExecuted: true,
      })
    ).toEqual({
      toolCallId: "call-2",
      toolName: "google_search",
      input: { query: "weather sf" },
    });

    expect(
      getTelegramProviderStatusToolCall({
        type: "tool-call",
        toolCallId: "call-3",
        toolName: "calendarControl",
        input: { action: "list" },
      })
    ).toBeNull();
  });

  test("uses low OpenAI text verbosity for gpt-5.3 telegram replies without unsupported reasoning settings", () => {
    expect(getTelegramOpenAIProviderOptions("gpt-5.3-chat-latest")).toEqual({
      openai: {
        textVerbosity: "low",
      },
    });
  });

  test("keeps explicit reasoning settings for gpt-5.4 telegram replies", () => {
    expect(getTelegramOpenAIProviderOptions("gpt-5.4")).toEqual({
      openai: {
        reasoningEffort: "none",
        textVerbosity: "low",
      },
    });
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

  test("draft, edit, delete, and typing helpers call the matching telegram endpoints", async () => {
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      requests.push({
        url: String(input),
        body: JSON.parse(String(init?.body)),
      });
      return Response.json({ ok: true, result: true });
    };

    await sendTelegramMessageDraft({
      botToken: "bot-token",
      chatId: "chat-1",
      draftId: 99,
      text: "drafted",
      fetchImpl,
    });
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
        url: "https://api.telegram.org/botbot-token/sendMessageDraft",
        body: {
          chat_id: "chat-1",
          draft_id: 99,
          text: "drafted",
        },
      },
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
