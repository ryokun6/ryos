import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { redisKeys } from "../src/shared/redisKeys";
import { FakeRedis } from "./fake-redis";

let fake: FakeRedis;

mock.module("../api/_utils/redis-helpers.js", () => ({
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

let chatRedis: typeof import("../api/rooms/_helpers/_redis");

beforeAll(async () => {
  chatRedis = await import("../api/rooms/_helpers/_redis");
});

beforeEach(() => {
  fake = new FakeRedis();
});

describe("chat message canonical cutover", () => {
  test("writes canonical messages only while reading and deleting legacy backlog", async () => {
    const roomId = "room-1";
    const canonicalKey = redisKeys.chat.roomMessages(roomId);
    const legacyKey = `chat:messages:${roomId}`;
    const legacyMessage = {
      id: "legacy-message",
      roomId,
      username: "ryo",
      content: "old",
      timestamp: 1,
    };
    const canonicalMessage = {
      id: "canonical-message",
      roomId,
      username: "ryo",
      content: "new",
      timestamp: 2,
    };

    await fake.lpush(legacyKey, JSON.stringify(legacyMessage));
    await chatRedis.addMessage(roomId, canonicalMessage);

    expect(await fake.llen(canonicalKey)).toBe(1);
    expect(await fake.llen(legacyKey)).toBe(1);
    expect((await chatRedis.getMessages(roomId, 10)).map((message) => message.id)).toEqual([
      "canonical-message",
      "legacy-message",
    ]);
    expect((await chatRedis.getLastMessage(roomId))?.id).toBe("canonical-message");

    expect(await chatRedis.deleteMessage(roomId, "legacy-message")).toBe(true);
    expect(await fake.llen(legacyKey)).toBe(0);
    expect(await fake.llen(canonicalKey)).toBe(1);
  });
});
