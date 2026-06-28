import { describe, expect, test } from "bun:test";
import type { Redis } from "../api/_utils/redis.js";
import {
  createStoredUserAccount,
  getStoredUserRecord,
  patchStoredUserRecord,
  setStoredUserRecord,
  updateStoredUserTimeZone,
} from "../api/_utils/auth/_user-record.js";
import { redisKeys } from "../src/shared/redisKeys.js";
import { FakeRedis } from "./fake-redis.js";

function makeRedis(): { fake: FakeRedis; redis: Redis } {
  const fake = new FakeRedis();
  return { fake, redis: fake as unknown as Redis };
}

describe("auth user-record atomic operations", () => {
  test("exactly one concurrent account creator writes credentials and a session", async () => {
    const { fake, redis } = makeRedis();
    const username = "atomic-user";

    const results = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        createStoredUserAccount(
          redis,
          username,
          { username, createdAt: index, lastActive: index },
          `password-hash-${index}`,
          `token-hash-${index}`,
          index
        )
      )
    );

    expect(results.filter(Boolean)).toHaveLength(1);
    const winner = results.findIndex(Boolean);
    expect(await getStoredUserRecord(redis, username)).toMatchObject({
      username,
      createdAt: winner,
    });
    expect(await redis.get(redisKeys.auth.userPassword(username))).toBe(
      `password-hash-${winner}`
    );
    expect(await redis.smembers(redisKeys.auth.userSessions(username))).toEqual([
      `token-hash-${winner}`,
    ]);
    expect(fake.allKeys().filter((key) => key.startsWith("auth:session:"))).toEqual([
      `auth:session:token-hash-${winner}`,
    ]);
  });

  test("a ban remains sticky during concurrent timezone and profile updates", async () => {
    const { redis } = makeRedis();
    const username = "sticky-ban-user";
    await setStoredUserRecord(redis, username, {
      username,
      createdAt: 1,
      lastActive: 1,
    });

    await Promise.all([
      patchStoredUserRecord(redis, username, {
        banned: true,
        banReason: "concurrency test",
        bannedAt: 2,
      }),
      updateStoredUserTimeZone(redis, username, "Asia/Tokyo", 3),
      patchStoredUserRecord(redis, username, { lastActive: 4 }),
    ]);

    expect(await getStoredUserRecord(redis, username)).toEqual({
      username,
      createdAt: 1,
      lastActive: 4,
      banned: true,
      banReason: "concurrency test",
      bannedAt: 2,
      timeZone: "Asia/Tokyo",
      timeZoneUpdatedAt: 3,
    });
  });

  test("field removal does not replace unrelated profile fields", async () => {
    const { redis } = makeRedis();
    const username = "atomic-remove-user";
    await setStoredUserRecord(redis, username, {
      username,
      banned: true,
      email: "person@example.com",
      emailVerified: true,
      emailUpdatedAt: 1,
    });

    await patchStoredUserRecord(
      redis,
      username,
      {},
      ["email", "emailVerified", "emailUpdatedAt"]
    );

    expect(await getStoredUserRecord(redis, username)).toEqual({
      username,
      banned: true,
    });
  });
});
