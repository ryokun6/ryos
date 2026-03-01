import { describe, test, expect } from "bun:test";

/**
 * Unit tests for room notification gating logic.
 *
 * This protects the user-facing expectation:
 * show notifications for non-active channels whether Chats is open or closed.
 */

import { shouldNotifyForRoomMessage } from "../src/utils/chatNotifications";

describe("Chat Notification Logic", () => {
  describe("Closed chats behavior", () => {
    test("notifies when chats is closed", async () => {
      const result = shouldNotifyForRoomMessage({
        chatsOpen: false,
        currentRoomId: "room-a",
        messageRoomId: "room-a",
      });
      expect(result).toBe(true);
    });

    test("notifies closed chats even with stale active room", async () => {
      const result = shouldNotifyForRoomMessage({
        chatsOpen: false,
        currentRoomId: "room-b",
        messageRoomId: "room-b",
      });
      expect(result).toBe(true);
    });
  });

  describe("Open chats behavior", () => {
    test("suppresses notifications for active room", async () => {
      const result = shouldNotifyForRoomMessage({
        chatsOpen: true,
        currentRoomId: "room-c",
        messageRoomId: "room-c",
      });
      expect(result).toBe(false);
    });

    test("notifies for non-active room", async () => {
      const result = shouldNotifyForRoomMessage({
        chatsOpen: true,
        currentRoomId: "room-c",
        messageRoomId: "room-d",
      });
      expect(result).toBe(true);
    });

    test("notifies when chats open with undefined active room", async () => {
      const result = shouldNotifyForRoomMessage({
        chatsOpen: true,
        currentRoomId: undefined,
        messageRoomId: "room-e-2",
      });
      expect(result).toBe(true);
    });

    test("notifies room messages when @ryo is active", async () => {
      const result = shouldNotifyForRoomMessage({
        chatsOpen: true,
        currentRoomId: null,
        messageRoomId: "room-e",
      });
      expect(result).toBe(true);
    });
  });

  describe("Input validation", () => {
    test("does not notify without message room id", async () => {
      const result = shouldNotifyForRoomMessage({
        chatsOpen: true,
        currentRoomId: "room-f",
        messageRoomId: null,
      });
      expect(result).toBe(false);
    });

    test("does not notify for empty message room id", async () => {
      const result = shouldNotifyForRoomMessage({
        chatsOpen: true,
        currentRoomId: "room-f",
        messageRoomId: "",
      });
      expect(result).toBe(false);
    });

    test("does not notify for whitespace-only message room id", async () => {
      const result = shouldNotifyForRoomMessage({
        chatsOpen: true,
        currentRoomId: "room-f",
        messageRoomId: "   ",
      });
      expect(result).toBe(false);
    });

    test("matches active room after trimming room id whitespace", async () => {
      const result = shouldNotifyForRoomMessage({
        chatsOpen: true,
        currentRoomId: " room-trim ",
        messageRoomId: "room-trim",
      });
      expect(result).toBe(false);
    });
  });
});
