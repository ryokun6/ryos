import { describe, test, expect } from "bun:test";
import {
  shouldSubscribeToBackgroundRoomUpdates,
  shouldSubscribeToForegroundRoomUpdates,
} from "../src/utils/chatRoomSubscriptions";

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
  source: string
): void => {
  expect(/subscribePusherChannel\s*\(/.test(source)).toBeTruthy();
  expect(/unsubscribePusherChannel\s*\(/.test(source)).toBeTruthy();
  expect(!/pusherRef\.current\?\.(subscribe|unsubscribe)\s*\(/.test(source)).toBeTruthy();
};

const assertNoBroadUnbinds = (source: string): void => {
  // Broad unbind looks like: channel.unbind("event")
  const broadUnbindPattern = /\.unbind\(\s*"[^"]+"\s*\)/g;
  expect(!broadUnbindPattern.test(source)).toBeTruthy();
};

describe("Chat Hook Channel Lifecycle Wiring", () => {
  describe("Subscription decisions", () => {
    test("foreground subscribes to IRC updates only for the active room", () => {
      expect(
        shouldSubscribeToForegroundRoomUpdates(
          { id: "irc-active", type: "irc" },
          "irc-active"
        )
      ).toBe(true);
      expect(
        shouldSubscribeToForegroundRoomUpdates(
          { id: "irc-idle", type: "irc" },
          "other-room"
        )
      ).toBe(false);
      expect(
        shouldSubscribeToForegroundRoomUpdates(
          { id: "public-room", type: "public" },
          "other-room"
        )
      ).toBe(true);
      expect(
        shouldSubscribeToForegroundRoomUpdates(
          { id: "private-room", type: "private" },
          null
        )
      ).toBe(true);
    });

    test("background skips IRC room update subscriptions", () => {
      expect(shouldSubscribeToBackgroundRoomUpdates({ type: "irc" })).toBe(false);
      expect(shouldSubscribeToBackgroundRoomUpdates({ type: "public" })).toBe(true);
      expect(shouldSubscribeToBackgroundRoomUpdates({ type: "private" })).toBe(true);
      expect(shouldSubscribeToBackgroundRoomUpdates({ type: undefined })).toBe(true);
    });
  });

  describe("Background notifications hook", () => {
    test("background hook uses shared lifecycle helpers", async () => {
      const source = readSource("src/hooks/useBackgroundChatNotifications.ts");
      expect(source).toContain("ChatRealtimeService");
      const serviceSource = readSource("src/services/chat/ChatRealtimeService.ts");
      assertUsesSharedLifecycleHelpers(serviceSource);
    });

    test("background hook uses scoped unbind handlers", async () => {
      const source = readSource("src/hooks/useBackgroundChatNotifications.ts");
      assertNoBroadUnbinds(source);
    });

    test("background hook excludes IRC room channels", async () => {
      const source = readSource("src/hooks/useBackgroundChatNotifications.ts");
      expect(source).toContain("shouldSubscribeToBackgroundRoomUpdates");
      expect(source).toContain("backgroundRoomsById.has(roomId)");
    });
  });

  describe("Foreground chat room hook", () => {
    test("chat room hook uses shared lifecycle helpers", async () => {
      const source = readSource("src/apps/chats/hooks/useChatRoom.ts");
      assertUsesSharedLifecycleHelpers(source);
    });

    test("chat room hook uses scoped unbind handlers", async () => {
      const source = readSource("src/apps/chats/hooks/useChatRoom.ts");
      assertNoBroadUnbinds(source);
    });

    test("chat room hook scopes IRC updates to the current room", async () => {
      const source = readSource("src/apps/chats/hooks/useChatRoom.ts");
      expect(source).toContain("shouldSubscribeToForegroundRoomUpdates");
      expect(source).toContain("unsubscribeFromRoomChannel(currentRoomId)");
      expect(source).toContain("currentRoomId,");
      expect(source).toContain("subscribeToRoomChannel,");
    });
  });
});
