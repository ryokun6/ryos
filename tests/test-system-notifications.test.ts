import { describe, expect, test } from "bun:test";
import {
  buildChatAiNotificationTag,
  buildChatRoomNotificationTag,
  sanitizeSystemNotificationPayload,
  sanitizeSystemNotificationStatus,
  toSafeSystemNotificationText,
} from "../src/utils/systemNotifications";

describe("system notifications", () => {
  test("sanitizes rich notification payloads", () => {
    expect(
      sanitizeSystemNotificationPayload({
        title: "  Saved\nfile  ",
        body: "Done\twith import",
        tag: "room id / one",
        chatRoomId: "room-a",
        silent: true,
        urgency: "critical",
        timeoutType: "never",
      })
    ).toEqual({
      title: "Saved file",
      body: "Done with import",
      tag: "room-id---one",
      chatRoomId: "room-a",
      silent: true,
      urgency: "critical",
      timeoutType: "never",
    });
  });

  test("rejects missing titles and sensitive-looking text", () => {
    expect(sanitizeSystemNotificationPayload({ title: "" })).toBeNull();
    expect(
      sanitizeSystemNotificationPayload({
        title: "Request failed: token=abc123",
      })
    ).toBeNull();
    expect(
      sanitizeSystemNotificationPayload({
        title: "Failed",
        body: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature",
      })
    ).toEqual({ title: "Failed" });
  });

  test("caps text and builds stable chat tags", () => {
    expect(toSafeSystemNotificationText("Long title ".repeat(16), 120)).toHaveLength(
      120
    );
    expect(buildChatRoomNotificationTag("room/a b")).toBe("chat-room-room-a-b");
    expect(buildChatAiNotificationTag()).toBe("chat-ai");
  });

  test("sanitizes desktop notification status", () => {
    expect(
      sanitizeSystemNotificationStatus({
        supported: true,
        foreground: false,
        platform: "darwin",
      })
    ).toEqual({
      supported: true,
      foreground: false,
      platform: "darwin",
      reason: undefined,
    });

    expect(
      sanitizeSystemNotificationStatus({
        supported: false,
        foreground: true,
        platform: "linux",
        reason: "unsupported",
      })
    ).toEqual({
      supported: false,
      foreground: true,
      platform: "linux",
      reason: "unsupported",
    });
    expect(sanitizeSystemNotificationStatus({ foreground: false })).toBeNull();
  });
});
