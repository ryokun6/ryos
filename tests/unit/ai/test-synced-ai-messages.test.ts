import { describe, expect, test } from "bun:test";
import type { AIChatMessage } from "../../../src/types/chat";
import { applyFreshProactiveGreeting } from "../../../src/apps/chats/utils/proactiveGreetingApply";

describe("synced AI messages greeting swap", () => {
  test("patches only the default greeting in a longer live SDK list", () => {
    const defaultGreeting: AIChatMessage = {
      id: "1",
      role: "assistant",
      parts: [{ type: "text", text: "👋 hey! i'm ryo. ask me anything!" }],
    };
    const proactiveGreeting: AIChatMessage = {
      id: "proactive-1",
      role: "assistant",
      parts: [{ type: "text", text: "welcome back alice!" }],
    };
    const sdkMessages: AIChatMessage[] = [
      defaultGreeting,
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "what's new?" }],
      },
      {
        id: "assistant-1",
        role: "assistant",
        parts: [{ type: "text", text: "streaming..." }],
      },
    ];

    const patched = applyFreshProactiveGreeting(sdkMessages, proactiveGreeting);

    expect(patched).toEqual([
      proactiveGreeting,
      sdkMessages[1],
      sdkMessages[2],
    ]);
    expect(patched?.length).toBe(sdkMessages.length);
  });
});
