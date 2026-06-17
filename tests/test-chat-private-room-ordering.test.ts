import { describe, expect, test } from "bun:test";
import {
  isPrivateRoomOnline,
  sortPrivateRoomsForSidebar,
} from "../src/apps/chats/utils/privateRoomOrdering";
import type { ChatMessage, ChatRoom } from "../src/types/chat";

const privateRoom = (
  id: string,
  member: string,
  lastMessageAt: number | undefined,
  createdAt: number
): ChatRoom => ({
  id,
  name: `@me, @${member}`,
  type: "private",
  members: ["me", member],
  createdAt,
  ...(lastMessageAt === undefined ? {} : { lastMessageAt }),
  userCount: 2,
});

const message = (roomId: string, timestamp: number): ChatMessage => ({
  id: `${roomId}-${timestamp}`,
  roomId,
  username: "me",
  content: "hello",
  timestamp,
});

describe("private chat sidebar ordering", () => {
  test("sorts online private chats first, then by recent activity", () => {
    const rooms = [
      privateRoom("bob-room", "bob", 4_000, 1_000),
      privateRoom("alice-room", "alice", 2_000, 1_000),
      privateRoom("carol-room", "carol", 3_000, 1_000),
      privateRoom("dave-room", "dave", 1_000, 1_000),
    ];

    expect(
      sortPrivateRoomsForSidebar(rooms, {
        username: "me",
        onlineUsers: ["alice", "carol"],
      }).map((room) => room.id)
    ).toEqual(["carol-room", "alice-room", "bob-room", "dave-room"]);
  });

  test("uses live local messages ahead of stale room listing timestamps", () => {
    const rooms = [
      privateRoom("erin-room", "erin", 2_000, 1_000),
      privateRoom("frank-room", "frank", 5_000, 1_000),
    ];

    expect(
      sortPrivateRoomsForSidebar(rooms, {
        username: "me",
        roomMessages: {
          "erin-room": [message("erin-room", 7_000)],
        },
      }).map((room) => room.id)
    ).toEqual(["erin-room", "frank-room"]);
  });

  test("does not count the current user as the online private peer", () => {
    expect(
      isPrivateRoomOnline(privateRoom("self-room", "me", undefined, 1_000), "me", [
        "me",
      ])
    ).toBe(false);
  });
});
