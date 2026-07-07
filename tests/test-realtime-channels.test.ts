import { describe, expect, test } from "bun:test";
import {
  CHATS_PUBLIC_CHANNEL,
  GLOBAL_PRESENCE_CHANNEL,
  classifyRealtimeChannel,
  getAIConversationRealtimeChannelName,
  getChatRoomChannelName,
  getChatsGlobalChannelName,
  getChatsUserChannelName,
  getListenSessionChannelName,
  getSyncChannelName,
  realtimeChannelRequiresAuth,
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

  test("builds chat list channels (public list stays open, per-user authorized)", () => {
    expect(getChatsGlobalChannelName(null)).toBe(CHATS_PUBLIC_CHANNEL);
    expect(getChatsGlobalChannelName(undefined)).toBe(CHATS_PUBLIC_CHANNEL);
    expect(getChatsGlobalChannelName("Ryo")).toBe("private-chats-ryo");
    expect(getChatsUserChannelName("User/Name")).toBe("private-chats-user_name");
  });

  test("builds room, sync, listen, and presence channels", () => {
    // Public/IRC rooms use the open channel; private rooms use the authorized one.
    expect(getChatRoomChannelName("123")).toBe("room-123");
    expect(getChatRoomChannelName("123", "public")).toBe("room-123");
    expect(getChatRoomChannelName("123", "irc")).toBe("room-123");
    expect(getChatRoomChannelName("123", "private")).toBe("private-room-123");
    expect(getSyncChannelName("Ryo.User")).toBe("private-sync-ryo.user");
    expect(getListenSessionChannelName("session-123")).toBe("listen-session-123");
    expect(GLOBAL_PRESENCE_CHANNEL).toBe("presence-global");
  });

  test("builds per-user AI conversation channels", () => {
    expect(getAIConversationRealtimeChannelName("Ryo")).toBe("private-ai-ryo");
    expect(getAIConversationRealtimeChannelName("User/Name")).toBe(
      "private-ai-user_name"
    );
  });

  test("classifies channels for authorization", () => {
    expect(classifyRealtimeChannel(CHATS_PUBLIC_CHANNEL)).toEqual({
      kind: "public",
    });
    expect(classifyRealtimeChannel("room-123")).toEqual({ kind: "public" });
    expect(classifyRealtimeChannel("listen-abc")).toEqual({ kind: "public" });
    expect(classifyRealtimeChannel("airdrop-ryo")).toEqual({ kind: "public" });
    expect(classifyRealtimeChannel("private-chats-ryo")).toEqual({
      kind: "user",
      target: "ryo",
    });
    expect(classifyRealtimeChannel("private-sync-ryo")).toEqual({
      kind: "user",
      target: "ryo",
    });
    expect(classifyRealtimeChannel("private-ai-ryo")).toEqual({
      kind: "user",
      target: "ryo",
    });
    expect(classifyRealtimeChannel("private-room-abc")).toEqual({
      kind: "room",
      target: "abc",
    });
    expect(classifyRealtimeChannel("presence-global")).toEqual({
      kind: "presence-global",
    });
    // Unknown authorization-requiring channels are denied by default.
    expect(classifyRealtimeChannel("private-unknown")).toEqual({ kind: "deny" });
    expect(classifyRealtimeChannel("presence-other")).toEqual({ kind: "deny" });
  });

  test("flags channels that require authorization", () => {
    expect(realtimeChannelRequiresAuth("room-123")).toBe(false);
    expect(realtimeChannelRequiresAuth(CHATS_PUBLIC_CHANNEL)).toBe(false);
    expect(realtimeChannelRequiresAuth("private-chats-ryo")).toBe(true);
    expect(realtimeChannelRequiresAuth("private-ai-ryo")).toBe(true);
    expect(realtimeChannelRequiresAuth("private-room-abc")).toBe(true);
    expect(realtimeChannelRequiresAuth("presence-global")).toBe(true);
  });
});
