import { describe, expect, test } from "bun:test";
import {
  extractBlueBubblesPrompt,
  parseBlueBubblesAllowedChatGuids,
  parseBlueBubblesWebhookPayload,
  sendBlueBubblesMessage,
} from "../api/_utils/bluebubbles";

describe("BlueBubbles iMessage integration", () => {
  test("parses new-message webhook payloads", () => {
    const parsed = parseBlueBubblesWebhookPayload({
      type: "new-message",
      data: {
        guid: "msg-123",
        isFromMe: true,
        text: "  @ryo hey there  ",
        chats: [{ guid: "iMessage;-;me@example.com" }],
      },
    });

    expect(parsed).toEqual({
      type: "new-message",
      messageGuid: "msg-123",
      chatGuid: "iMessage;-;me@example.com",
      text: "@ryo hey there",
      isFromMe: true,
    });
  });

  test("extracts prompts only when the trigger prefix is present", () => {
    expect(extractBlueBubblesPrompt("@ryo what do you think", "@ryo")).toBe(
      "what do you think"
    );
    expect(extractBlueBubblesPrompt("@RYO hello", "@ryo")).toBe("hello");
    expect(extractBlueBubblesPrompt("hello there", "@ryo")).toBeNull();
    expect(extractBlueBubblesPrompt("@ryo   ", "@ryo")).toBeNull();
  });

  test("parses allowed chat guid lists", () => {
    expect(
      parseBlueBubblesAllowedChatGuids(
        "iMessage;-;one@example.com, iMessage;-;two@example.com"
      )
    ).toEqual(
      new Set(["iMessage;-;one@example.com", "iMessage;-;two@example.com"])
    );
    expect(parseBlueBubblesAllowedChatGuids(undefined)).toBeNull();
  });

  test("falls back to the underscore send route when needed", async () => {
    const calls: string[] = [];

    await sendBlueBubblesMessage({
      serverUrl: "https://blue.example",
      password: "top-secret",
      chatGuid: "iMessage;-;me@example.com",
      text: "yo",
      fetchImpl: async (input, init) => {
        const url = String(input);
        calls.push(url);

        const body = JSON.parse(String(init?.body));
        expect(body).toEqual({
          chatGuid: "iMessage;-;me@example.com",
          text: "yo",
          method: "private-api",
        });

        if (url.includes("/api/v1/send-text")) {
          return new Response("missing", { status: 404 });
        }

        return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
      },
    });

    expect(calls).toEqual([
      "https://blue.example/api/v1/send-text?guid=top-secret",
      "https://blue.example/api/v1/send_text?guid=top-secret",
    ]);
  });
});
