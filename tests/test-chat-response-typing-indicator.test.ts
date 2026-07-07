import { describe, expect, test } from "bun:test";
import {
  hasAssistantResponseStarted,
  shouldShowAssistantTypingDots,
} from "../src/apps/chats/components/chat-messages/utils";

describe("chat response typing indicator", () => {
  test("waits through empty stream setup parts", () => {
    expect(hasAssistantResponseStarted({ parts: [] })).toBe(false);
    expect(
      hasAssistantResponseStarted({
        parts: [
          { type: "step-start" },
          { type: "text", text: "   " },
        ],
      })
    ).toBe(false);
  });

  test("stops once visible response text streams", () => {
    expect(
      hasAssistantResponseStarted({
        parts: [{ type: "text", text: "Hello" }],
      })
    ).toBe(true);
  });

  test("stops as soon as a tool call streams", () => {
    expect(
      hasAssistantResponseStarted({
        parts: [{ type: "tool-openApp" }],
      })
    ).toBe(true);
  });

  test("shows dots only for an empty in-flight assistant message", () => {
    const emptyAssistant = {
      role: "assistant",
      parts: [{ type: "step-start" }],
    };

    expect(
      shouldShowAssistantTypingDots({
        message: emptyAssistant,
        isStreamingMessage: true,
        isLoadingGreeting: false,
        isRoomView: false,
        isStaticGreeting: false,
      })
    ).toBe(true);
    expect(
      shouldShowAssistantTypingDots({
        message: emptyAssistant,
        isStreamingMessage: false,
        isLoadingGreeting: false,
        isRoomView: false,
        isStaticGreeting: false,
      })
    ).toBe(false);
  });

  test("replaces dots when text or a tool arrives", () => {
    for (const parts of [
      [{ type: "text", text: "Hello" }],
      [{ type: "tool-openApp" }],
    ]) {
      expect(
        shouldShowAssistantTypingDots({
          message: { role: "assistant", parts },
          isStreamingMessage: true,
          isLoadingGreeting: false,
          isRoomView: false,
          isStaticGreeting: false,
        })
      ).toBe(false);
    }
  });
});
