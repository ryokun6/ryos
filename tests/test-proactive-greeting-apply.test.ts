import { describe, expect, test } from "bun:test";
import type { AIChatMessage } from "../src/types/chat";
import {
  applyFreshProactiveGreeting,
  isDefaultGreetingMessage,
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

const assistantStream: AIChatMessage = {
  id: "assistant-1",
  role: "assistant",
  parts: [{ type: "text", text: "streaming..." }],
};

describe("proactive greeting apply", () => {
  test("detects the default loading greeting", () => {
    expect(isDefaultGreetingMessage(defaultGreeting)).toBe(true);
    expect(isDefaultGreetingMessage(proactiveGreeting)).toBe(false);
  });

  test("replaces only the default greeting in a fresh chat", () => {
    const result = applyFreshProactiveGreeting(
      [defaultGreeting],
      proactiveGreeting
    );

    expect(result).toEqual([proactiveGreeting]);
  });

  test("preserves user and streaming assistant messages", () => {
    const result = applyFreshProactiveGreeting(
      [defaultGreeting, userMessage, assistantStream],
      proactiveGreeting
    );

    expect(result).toEqual([proactiveGreeting, userMessage, assistantStream]);
  });

  test("still applies while the user has already sent a message", () => {
    expect(shouldApplyFreshProactiveGreeting([defaultGreeting, userMessage])).toBe(
      true
    );
    expect(
      applyFreshProactiveGreeting(
        [defaultGreeting, userMessage],
        proactiveGreeting
      )
    ).toEqual([proactiveGreeting, userMessage]);
  });

  test("skips apply when the default greeting is already gone", () => {
    expect(
      applyFreshProactiveGreeting([userMessage], proactiveGreeting)
    ).toBeNull();
  });
});
