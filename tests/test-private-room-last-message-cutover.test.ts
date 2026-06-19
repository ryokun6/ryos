import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { redisKeys } from "../src/shared/redisKeys";
import { FakeRedis } from "./fake-redis";
import * as actualRedis from "../api/_utils/redis";
import * as actualRedisHelpers from "../api/_utils/redis-helpers";

let fake: FakeRedis;

// Presence helpers resolve their client through createRedis() in this module.
// Spread the real module so other exports (e.g. supportsRedisPubSub) survive —
// Bun module mocks are global and persist across files in the same run.
mock.module("../api/_utils/redis.js", () => ({
  ...actualRedis,
  createRedis: () => fake,
}));

// Room discovery (getAllRoomIds) resolves its client through redis-helpers.
mock.module("../api/_utils/redis-helpers.js", () => ({
  ...actualRedisHelpers,
  createRedisClient: () => fake,
  generateRandomHexId: (byteLength: number) => "a".repeat(byteLength * 2),
  getCurrentTimestamp: () => 1_718_180_000_000,
  parseJSON: <T>(data: unknown): T | null => {
    if (!data) return null;
    if (typeof data === "object") return data as T;
    if (typeof data === "string") {
      try {
        return JSON.parse(data) as T;
      } catch {
        return null;
      }
    }
    return null;
  },
}));

// Restore the real modules after this file so the overrides do not leak.
afterAll(() => {
  mock.module("../api/_utils/redis.js", () => actualRedis);
  mock.module("../api/_utils/redis-helpers.js", () => actualRedisHelpers);
});

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

  test("ignores the legacy messages list for canonical-only reads", async () => {
    const roomId = "me-carol";
    await seedPrivateRoom(roomId);
    // Seed ONLY the legacy list — it must no longer be read.
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
    expect(room?.lastMessageAt).not.toBe(4_200);
  });
});
