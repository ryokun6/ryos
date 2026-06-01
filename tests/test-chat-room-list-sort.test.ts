import { describe, expect, test } from "bun:test";
import type { ChatMessage, ChatRoom } from "../src/types/chat";
import {
  getPrivateRoomActivityTimestamp,
  sortChatRooms,
} from "../src/utils/chatRoomList";

const room = (
  partial: Partial<ChatRoom> & Pick<ChatRoom, "id" | "name">
): ChatRoom => ({
  createdAt: 1000,
  userCount: 0,
  type: "public",
  ...partial,
});

describe("chat room list sort", () => {
  test("keeps public and IRC rooms before private rooms, sorted by name", () => {
    const rooms: ChatRoom[] = [
      room({ id: "p1", name: "DM", type: "private", createdAt: 5000 }),
      room({ id: "a", name: "Zeta", type: "public" }),
      room({ id: "b", name: "Alpha", type: "public" }),
      room({ id: "i", name: "#irc", type: "irc" }),
    ];

    expect(sortChatRooms(rooms).map((r) => r.id)).toEqual([
      "i",
      "b",
      "a",
      "p1",
    ]);
  });

  test("sorts private rooms by last message timestamp, newest first", () => {
    const rooms: ChatRoom[] = [
      room({
        id: "old",
        name: "@a, @b",
        type: "private",
        createdAt: 100,
      }),
      room({
        id: "mid",
        name: "@a, @c",
        type: "private",
        createdAt: 200,
      }),
      room({
        id: "new",
        name: "@a, @d",
        type: "private",
        createdAt: 50,
      }),
    ];
    const roomMessages: Record<string, ChatMessage[]> = {
      old: [
        {
          id: "m1",
          roomId: "old",
          username: "a",
          content: "hi",
          timestamp: 1000,
        },
      ],
      mid: [
        {
          id: "m2",
          roomId: "mid",
          username: "a",
          content: "hey",
          timestamp: 5000,
        },
      ],
      new: [
        {
          id: "m3",
          roomId: "new",
          username: "a",
          content: "yo",
          timestamp: 9000,
        },
      ],
    };

    expect(sortChatRooms(rooms, roomMessages).map((r) => r.id)).toEqual([
      "new",
      "mid",
      "old",
    ]);
  });

  test("falls back to updatedAt then createdAt for private rooms without messages", () => {
    const rooms: ChatRoom[] = [
      room({
        id: "c",
        name: "c",
        type: "private",
        createdAt: 300,
      }),
      room({
        id: "u",
        name: "u",
        type: "private",
        createdAt: 100,
        updatedAt: 800,
      } as ChatRoom & { updatedAt: number }),
    ];

    expect(sortChatRooms(rooms).map((r) => r.id)).toEqual(["u", "c"]);
    expect(getPrivateRoomActivityTimestamp(rooms[1])).toBe(800);
    expect(getPrivateRoomActivityTimestamp(rooms[0])).toBe(300);
  });
});
