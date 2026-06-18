import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { redisKeys } from "../src/shared/redisKeys";
import { FakeRedis } from "./fake-redis";

let fake: FakeRedis;

// Presence helpers resolve their client through createRedis() in this module.
mock.module("../api/_utils/redis.js", () => ({
  createRedis: () => fake,
}));

let presence: typeof import("../api/rooms/_helpers/_presence");

beforeAll(async () => {
  presence = await import("../api/rooms/_helpers/_presence");
});

beforeEach(() => {
  fake = new FakeRedis();
});

async function seedPrivateRoom(roomId: string): Promise<void> {
  await fake.sadd(redisKeys.chat.roomIds(), roomId);
  await fake.set(
    redisKeys.chat.roomMeta(roomId),
    JSON.stringify({
      id: roomId,
      name: "@me, @bob",
      type: "private",
      members: ["me", "bob"],
      createdAt: 1_000,
    })
  );
}

describe("private room lastMessageAt canonical cutover", () => {
  test("derives lastMessageAt from the canonical messages list", async () => {
    const roomId = "me-bob";
    await seedPrivateRoom(roomId);
    // Newest message lives at index 0 of the canonical list (LPUSH order).
    await fake.lpush(
      redisKeys.chat.roomMessages(roomId),
      JSON.stringify({
        id: "m1",
        roomId,
        username: "bob",
        content: "hi",
        timestamp: 7_000,
      })
    );

    const rooms = await presence.getDetailedRooms();
    const room = rooms.find((r) => r.id === roomId);
    expect(room?.lastMessageAt).toBe(7_000);
  });

  test("falls back to the legacy messages list for pre-cutover rooms", async () => {
    const roomId = "me-carol";
    await seedPrivateRoom(roomId);
    await fake.lpush(
      `chat:messages:${roomId}`,
      JSON.stringify({
        id: "m2",
        roomId,
        username: "carol",
        content: "yo",
        timestamp: 4_200,
      })
    );

    const rooms = await presence.getDetailedRooms();
    const room = rooms.find((r) => r.id === roomId);
    expect(room?.lastMessageAt).toBe(4_200);
  });
});
