import { describe, expect, test } from "bun:test";
import type { Redis } from "../api/_utils/redis";
import { validateAuth } from "../api/_utils/auth/_validate";
import {
  getUserPasswordHash,
  setUserPasswordHash,
} from "../api/_utils/auth/_password-storage";
import { storeToken } from "../api/_utils/auth/_tokens";
import {
  getStoredUserRecord,
  setStoredUserRecord,
} from "../api/_utils/auth/_user-record";
import { redisKeys, sha256RedisIdentifier } from "../src/shared/redisKeys";
import { FakeRedis } from "./fake-redis";

// Legacy key shapes that must no longer be read by the app once seeded data
// only lives under the canonical scheme.
const legacyUserTokenKey = (username: string, token: string) =>
  `chat:token:user:${username.toLowerCase()}:${token}`;
const legacyStoredUserKey = (username: string) =>
  `chat:users:${username.toLowerCase()}`;

describe("canonical auth sessions", () => {
  test("validates against canonical session keys only", async () => {
    const fake = new FakeRedis();
    const redis = fake as unknown as Redis;
    const username = "ryo";
    const token = "secret-token";

    await storeToken(redis, username, token);
    // A stray legacy token key must never be relied upon.
    await redis.del(legacyUserTokenKey(username, token));

    const tokenHash = await sha256RedisIdentifier(token);
    expect(await redis.exists(redisKeys.auth.session(tokenHash))).toBe(1);
    expect(await validateAuth(redis, username, token)).toEqual({
      valid: true,
      expired: false,
    });
  });

  test("does not validate tokens that only exist under the legacy scheme", async () => {
    const fake = new FakeRedis();
    const redis = fake as unknown as Redis;
    const username = "ryo";
    const token = "legacy-only-token";

    // Seed ONLY the legacy token key; canonical session is absent.
    await redis.set(legacyUserTokenKey(username, token), Date.now());

    expect(await validateAuth(redis, username, token)).toEqual({ valid: false });
  });

  test("reads canonical user profile and password, ignoring legacy auth keys", async () => {
    const fake = new FakeRedis();
    const redis = fake as unknown as Redis;

    await setStoredUserRecord(redis, "ryo", {
      username: "ryo",
      createdAt: 1,
      lastActive: 2,
    });
    await setUserPasswordHash(redis, "ryo", "hashed-password");
    await redis.del(legacyStoredUserKey("ryo"), "chat:password:ryo");

    expect(await getStoredUserRecord(redis, "ryo")).toMatchObject({
      username: "ryo",
      lastActive: 2,
    });
    expect(await getUserPasswordHash(redis, "ryo")).toBe("hashed-password");
    expect(await redis.get(redisKeys.auth.userProfile("ryo"))).not.toBeNull();
    expect(await redis.get(redisKeys.auth.userPassword("ryo"))).toBe("hashed-password");
  });
});
