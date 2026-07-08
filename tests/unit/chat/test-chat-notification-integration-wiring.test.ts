import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Guardrail tests for notification decision integration wiring.
 *
 * Why:
 * Both chat hooks should rely on the shared shouldNotifyForRoomMessage utility
 * to keep notification behavior consistent between foreground/background modes.
 */

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), "utf-8");

const assertUsesSharedNotificationGate = (
  source: string
): void => {
  expect(source).toMatch(/from\s+["']@\/utils\/chatNotifications["']/);
  expect(source).toMatch(/shouldNotifyForRoomMessage/);
  expect(source).toMatch(/shouldNotifyForRoomMessage\s*\(\s*\{/);
};

describe("Chat Notification Integration Wiring", () => {
  describe("Background hook wiring", () => {
    test("background notifications hook uses shared gate", async () => {
      const source = readSource("src/hooks/useBackgroundChatNotifications.ts");
      assertUsesSharedNotificationGate(source);
    });
  });

  describe("Foreground hook wiring", () => {
    test("chat room hook uses shared gate", async () => {
      const source = readSource("src/apps/chats/hooks/useChatRoom.ts");
      assertUsesSharedNotificationGate(source);
    });
  });
});
