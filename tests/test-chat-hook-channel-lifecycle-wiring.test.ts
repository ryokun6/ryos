import { describe, test, expect, beforeAll } from "bun:test";

/**
 * Guardrail tests for chat hook channel lifecycle wiring.
 *
 * Why:
 * A previous regression involved fragile channel lifecycle handling across
 * foreground/background hooks. These checks ensure both hooks keep using
 * shared ref-counted helpers and scoped unbind cleanup.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), "utf-8");

const assertUsesSharedLifecycleHelpers = (
  source: string,
  label: string
): void => {
  expect(/subscribePusherChannel\s*\(/.test(source)).toBeTruthy();
  expect(/unsubscribePusherChannel\s*\(/.test(source)).toBeTruthy();
  expect(!/pusherRef\.current\?\.(subscribe|unsubscribe)\s*\(/.test(source)).toBeTruthy();
};

const assertNoBroadUnbinds = (source: string, label: string): void => {
  // Broad unbind looks like: channel.unbind("event")
  const broadUnbindPattern = /\.unbind\(\s*"[^"]+"\s*\)/g;
  expect(!broadUnbindPattern.test(source)).toBeTruthy();
};

describe("Chat Hook Channel Lifecycle Wiring", () => {
  describe("Background notifications hook", () => {
    test("background hook uses shared lifecycle helpers", async () => {
    const source = readSource("src/hooks/useBackgroundChatNotifications.ts");
    assertUsesSharedLifecycleHelpers(source, "useBackgroundChatNotifications");
  });
    test("background hook uses scoped unbind handlers", async () => {
    const source = readSource("src/hooks/useBackgroundChatNotifications.ts");
    assertNoBroadUnbinds(source, "useBackgroundChatNotifications");
  });
  });

  describe("Foreground chat room hook", () => {
    test("chat room hook uses shared lifecycle helpers", async () => {
    const source = readSource("src/apps/chats/hooks/useChatRoom.ts");
    assertUsesSharedLifecycleHelpers(source, "useChatRoom");
  });
    test("chat room hook uses scoped unbind handlers", async () => {
    const source = readSource("src/apps/chats/hooks/useChatRoom.ts");
    assertNoBroadUnbinds(source, "useChatRoom");
  });
  });
});
