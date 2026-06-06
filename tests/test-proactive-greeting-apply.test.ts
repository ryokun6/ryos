import { describe, expect, test } from "bun:test";
import type { AIChatMessage } from "../src/types/chat";
import {
  applyFreshProactiveGreeting,
  shouldApplyFreshProactiveGreeting,
} from "../src/apps/chats/utils/proactiveGreetingApply";

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

const userMessage: AIChatMessage = {
  id: "user-1",
  role: "user",
  parts: [{ type: "text", text: "what's new?" }],
};

describe("proactive greeting apply", () => {
  test("replaces only the default greeting in a fresh chat", () => {
    const result = applyFreshProactiveGreeting(
      [defaultGreeting],
      proactiveGreeting,
      { suppressed: false }
    );

    expect(result).toEqual([proactiveGreeting]);
  });

  test("preserves user messages when replacing the default greeting", () => {
    const result = applyFreshProactiveGreeting(
      [defaultGreeting, userMessage],
      proactiveGreeting,
      { suppressed: false }
    );

    expect(result).toEqual([proactiveGreeting, userMessage]);
  });

  test("skips apply when greeting fetch was cancelled after user typed", () => {
    expect(
      shouldApplyFreshProactiveGreeting([defaultGreeting], { suppressed: true })
    ).toBe(false);
    expect(
      applyFreshProactiveGreeting(
        [defaultGreeting, userMessage],
        proactiveGreeting,
        { suppressed: true }
      )
    ).toBeNull();
  });

  test("skips apply when the default greeting is already gone", () => {
    expect(
      applyFreshProactiveGreeting([userMessage], proactiveGreeting, {
        suppressed: false,
      })
    ).toBeNull();
  });
});
