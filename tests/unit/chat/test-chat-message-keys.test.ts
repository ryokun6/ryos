import { describe, expect, test } from "bun:test";
import {
  getMessageKey,
  getSyntheticGreetingKey,
  SYNTHETIC_GREETING_KEY_PREFIX,
} from "../../../src/apps/chats/components/chat-messages/utils";

describe("chat message keys", () => {
  test("namespaces default and proactive fresh greetings with distinct keys", () => {
    const defaultGreeting = {
      id: "1",
      role: "assistant",
      parts: [{ type: "text", text: "👋 hey! i'm ryo. ask me anything!" }],
    };
    const proactiveGreeting = {
      id: "proactive-1",
      role: "assistant",
      parts: [{ type: "text", text: "welcome back!" }],
    };

    const defaultKey = getMessageKey(defaultGreeting);
    const proactiveKey = getMessageKey(proactiveGreeting);

    expect(defaultKey).toBe(getSyntheticGreetingKey("1"));
    expect(proactiveKey).toBe(getSyntheticGreetingKey("proactive-1"));
    expect(defaultKey).not.toBe(proactiveKey);
    expect(defaultKey.startsWith(SYNTHETIC_GREETING_KEY_PREFIX)).toBe(true);
    expect(proactiveKey.startsWith(SYNTHETIC_GREETING_KEY_PREFIX)).toBe(true);
  });

  test("keeps persisted message ids as stable keys", () => {
    const persisted = {
      id: "msg-abc-123",
      role: "user",
      parts: [{ type: "text", text: "hello there" }],
    };

    expect(getMessageKey(persisted)).toBe("msg-abc-123");
  });

  test("namespaces stale proactive greetings without colliding with default greeting", () => {
    const defaultGreeting = {
      id: "1",
      role: "assistant",
      parts: [{ type: "text", text: "👋 hey! i'm ryo. ask me anything!" }],
    };
    const staleGreeting = {
      id: "proactive-1712345678901",
      role: "assistant",
      parts: [{ type: "text", text: "long time no see" }],
    };

    const keys = [defaultGreeting, staleGreeting].map(getMessageKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("produces unique keys for id-less messages with identical prefixes", () => {
    const first = {
      role: "human",
      parts: [{ type: "text", text: "hello world" }],
      metadata: { createdAt: new Date("2026-01-01T00:00:00.000Z") },
    };
    const second = {
      role: "human",
      parts: [{ type: "text", text: "hello world" }],
      metadata: { createdAt: new Date("2026-01-02T00:00:00.000Z") },
    };

    expect(getMessageKey(first)).not.toBe(getMessageKey(second));
  });
});
