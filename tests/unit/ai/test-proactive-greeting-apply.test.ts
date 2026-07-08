import { describe, expect, test } from "bun:test";
import type { AIChatMessage } from "../../../src/types/chat";
import {
  applyFreshProactiveGreeting,
  applyServerProactiveGreeting,
  isClearedToDefaultGreeting,
  isConversationGreetable,
  isDefaultGreetingMessage,
  parseServerProactiveGreeting,
  resolveAiMessageSync,
  shouldApplyFreshProactiveGreeting,
} from "../../../src/apps/chats/utils/proactiveGreetingApply";

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

  test("patches only the default greeting in a longer live SDK list", () => {
    const sdkMessages: AIChatMessage[] = [
      defaultGreeting,
      userMessage,
      assistantStream,
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

describe("cleared chat detection", () => {
  test("recognizes a single default greeting as a cleared chat", () => {
    expect(isClearedToDefaultGreeting([defaultGreeting])).toBe(true);
  });

  test("does not treat a proactive greeting as a cleared chat", () => {
    expect(isClearedToDefaultGreeting([proactiveGreeting])).toBe(false);
  });

  test("does not treat a populated conversation as a cleared chat", () => {
    expect(
      isClearedToDefaultGreeting([defaultGreeting, userMessage, assistantStream])
    ).toBe(false);
  });
});

describe("isConversationGreetable", () => {
  const NOW = Date.parse("2026-07-07T12:00:00.000Z");
  const timedMessage = (
    base: AIChatMessage,
    createdAt: string
  ): AIChatMessage => ({
    ...base,
    metadata: { createdAt: new Date(createdAt) },
  });

  test("greets empty and freshly cleared chats", () => {
    expect(isConversationGreetable([], NOW)).toBe(true);
    expect(isConversationGreetable([defaultGreeting], NOW)).toBe(true);
  });

  test("greets a stale thread but not an active one", () => {
    const stale = [
      timedMessage(userMessage, "2026-07-07T11:00:00.000Z"),
      timedMessage(assistantStream, "2026-07-07T11:01:00.000Z"),
    ];
    expect(isConversationGreetable(stale, NOW)).toBe(true);

    const active = [timedMessage(assistantStream, "2026-07-07T11:58:00.000Z")];
    expect(isConversationGreetable(active, NOW)).toBe(false);
  });

  test("never greets twice in a row and skips unknown timestamps", () => {
    const greeted = [
      timedMessage(userMessage, "2026-07-07T11:00:00.000Z"),
      timedMessage(proactiveGreeting, "2026-07-07T11:01:00.000Z"),
    ];
    expect(isConversationGreetable(greeted, NOW)).toBe(false);
    expect(isConversationGreetable([userMessage, assistantStream], NOW)).toBe(
      false
    );
  });
});

describe("parseServerProactiveGreeting", () => {
  test("parses a persisted greeting message", () => {
    const parsed = parseServerProactiveGreeting({
      greeting: "welcome back alice!",
      message: {
        id: "proactive-6f0f0000-0000-4000-8000-000000000000",
        seq: 3,
        role: "assistant",
        parts: [{ type: "text", text: "welcome back alice!" }],
        createdAt: "2026-07-07T12:00:00.000Z",
      },
    });

    expect(parsed).toEqual({
      id: "proactive-6f0f0000-0000-4000-8000-000000000000",
      role: "assistant",
      parts: [{ type: "text", text: "welcome back alice!" }],
      metadata: { createdAt: new Date("2026-07-07T12:00:00.000Z") },
    });
  });

  test("returns null for skipped greetings and malformed payloads", () => {
    expect(
      parseServerProactiveGreeting({ greeting: null, reason: "no memories" })
    ).toBeNull();
    expect(parseServerProactiveGreeting({ greeting: "hi" })).toBeNull();
    expect(
      parseServerProactiveGreeting({
        greeting: "hi",
        message: { id: "not-proactive", role: "assistant", parts: [] },
      })
    ).toBeNull();
    expect(
      parseServerProactiveGreeting({
        greeting: "hi",
        message: { id: "proactive-1", role: "user", parts: [{ type: "text", text: "hi" }] },
      })
    ).toBeNull();
  });
});

describe("applyServerProactiveGreeting", () => {
  const timed = (base: AIChatMessage, createdAt: string): AIChatMessage => ({
    ...base,
    metadata: { createdAt: new Date(createdAt) },
  });
  const serverGreeting = timed(
    proactiveGreeting,
    "2026-07-07T12:00:00.000Z"
  );

  test("replaces the default greeting in a fresh chat", () => {
    expect(applyServerProactiveGreeting([defaultGreeting], serverGreeting)).toEqual([
      serverGreeting,
    ]);
  });

  test("appends to a stale thread", () => {
    const thread = [
      timed(userMessage, "2026-07-07T11:00:00.000Z"),
      timed(assistantStream, "2026-07-07T11:01:00.000Z"),
    ];
    expect(applyServerProactiveGreeting(thread, serverGreeting)).toEqual([
      ...thread,
      serverGreeting,
    ]);
  });

  test("skips when the greeting already landed via hydration", () => {
    expect(
      applyServerProactiveGreeting([serverGreeting], serverGreeting)
    ).toBeNull();
  });

  test("skips when local activity raced the greeting", () => {
    expect(
      applyServerProactiveGreeting(
        [timed(userMessage, "2026-07-07T12:00:01.000Z")],
        serverGreeting
      )
    ).toBeNull();
    expect(
      applyServerProactiveGreeting(
        [timed(assistantStream, "2026-07-07T12:00:02.000Z")],
        serverGreeting
      )
    ).toBeNull();
  });
});

describe("resolveAiMessageSync", () => {
  test("forces a clear to win even when the SDK stream is still longer", () => {
    // User pressed "Clear Chat" while an assistant reply was still draining.
    const decision = resolveAiMessageSync(
      [defaultGreeting],
      [defaultGreeting, userMessage, assistantStream]
    );

    expect(decision).toEqual({ action: "sync" });
  });

  test("skips overwriting a longer SDK list mid-conversation", () => {
    const decision = resolveAiMessageSync(
      [proactiveGreeting, userMessage],
      [proactiveGreeting, userMessage, assistantStream]
    );

    expect(decision).toEqual({ action: "skip" });
  });

  test("patches the loading greeting once the proactive greeting arrives", () => {
    const decision = resolveAiMessageSync(
      [proactiveGreeting],
      [defaultGreeting]
    );

    expect(decision).toEqual({
      action: "patch-greeting",
      messages: [proactiveGreeting],
    });
  });

  test("syncs when same-length lists have a differing last message id", () => {
    expect(resolveAiMessageSync([userMessage], [assistantStream])).toEqual({
      action: "sync",
    });
  });

  test("no-ops when store and SDK are already aligned", () => {
    expect(
      resolveAiMessageSync(
        [proactiveGreeting, userMessage],
        [proactiveGreeting, userMessage]
      )
    ).toEqual({ action: "noop" });
  });
});
