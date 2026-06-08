import { describe, expect, test } from "bun:test";
import {
  CHATS_PUBLIC_CHANNEL,
  GLOBAL_PRESENCE_CHANNEL,
  getChatRoomChannelName,
  getChatsGlobalChannelName,
  getChatsUserChannelName,
  getListenSessionChannelName,
  getSyncChannelName,
  sanitizeRealtimeChannelSegment,
  sanitizeUsernameForRealtimeChannel,
} from "../src/shared/constants/realtime";

describe("realtime channel constants", () => {
  test("sanitizes realtime segments without lowercasing", () => {
    expect(sanitizeRealtimeChannelSegment("User.Name")).toBe("User.Name");
    expect(sanitizeRealtimeChannelSegment("A/B@C")).toBe("A_B_C");
    expect(sanitizeRealtimeChannelSegment("a-b_c.d")).toBe("a-b_c.d");
  });

  test("sanitizes usernames with lowercasing", () => {
    expect(sanitizeUsernameForRealtimeChannel("User.Name")).toBe("user.name");
    expect(sanitizeUsernameForRealtimeChannel("A/B@C")).toBe("a_b_c");
  });

  test("builds chat list channels", () => {
    expect(getChatsGlobalChannelName(null)).toBe(CHATS_PUBLIC_CHANNEL);
    expect(getChatsGlobalChannelName(undefined)).toBe(CHATS_PUBLIC_CHANNEL);
    expect(getChatsGlobalChannelName("Ryo")).toBe("chats-ryo");
    expect(getChatsUserChannelName("User/Name")).toBe("chats-user_name");
  });

  test("builds room, sync, listen, and presence channels", () => {
    expect(getChatRoomChannelName("room-123")).toBe("room-room-123");
    expect(getSyncChannelName("Ryo.User")).toBe("sync-ryo.user");
    expect(getListenSessionChannelName("session-123")).toBe("listen-session-123");
    expect(GLOBAL_PRESENCE_CHANNEL).toBe("presence-global");
  });
});
