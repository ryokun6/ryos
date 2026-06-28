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
  expect(source).toMatch(/subscribePusherChannel\s*\(/);
  expect(source).toMatch(/unsubscribePusherChannel\s*\(/);
  expect(source).not.toMatch(/pusherRef\.current\?\.(subscribe|unsubscribe)\s*\(/);
};

const assertNoBroadUnbinds = (source: string): void => {
  // Broad unbind looks like: channel.unbind("event")
  expect(source).not.toMatch(/\.unbind\(\s*"[^"]+"\s*\)/);
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
    test("background hook delegates to ChatRealtimeService, which uses shared lifecycle helpers", async () => {
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

    test("background service dispatches private per-user fanout to room handlers", () => {
      const source = readSource("src/services/chat/ChatRealtimeService.ts");
      expect(source).toContain('channel.bind("room-message", this.dispatchPrivateRoomMessage)');
      expect(source).toContain("this.roomHandlers[data?.roomId]?.onRoomMessage(data)");
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

    test("foreground hook dispatches private per-user fanout to room handlers", () => {
      const source = readSource("src/apps/chats/hooks/useChatRoom.ts");
      expect(source).toContain('channel.bind("room-message", handlers.onPrivateRoomMessage)');
      expect(source).toContain(
        "roomHandlersRef.current[data?.roomId]?.onRoomMessage(data)"
      );
    });
  });
});
