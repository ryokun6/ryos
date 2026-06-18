import { describe, expect, test } from "bun:test";
import type { Redis } from "../api/_utils/redis";
import { validateAuth } from "../api/_utils/auth/_validate";
import {
  getUserPasswordHash,
  setUserPasswordHash,
} from "../api/_utils/auth/_password-storage";
import { getUserTokenKey, storeToken } from "../api/_utils/auth/_tokens";
import {
  getLegacyStoredUserKey,
  getStoredUserRecord,
  setStoredUserRecord,
} from "../api/_utils/auth/_user-record";
import { redisKeys, sha256RedisIdentifier } from "../src/shared/redisKeys";
import { FakeRedis } from "./fake-redis";

describe("canonical auth sessions", () => {
  test("validates after legacy chat token key is gone", async () => {
    const fake = new FakeRedis();
    const redis = fake as unknown as Redis;
    const username = "ryo";
    const token = "secret-token";

    await storeToken(redis, username, token);
    await redis.del(getUserTokenKey(username, token));

    const tokenHash = await sha256RedisIdentifier(token);
    expect(await redis.exists(redisKeys.auth.session(tokenHash))).toBe(1);
    expect(await validateAuth(redis, username, token)).toEqual({
      valid: true,
      expired: false,
    });
  });

  test("reads canonical user profile and password after legacy auth keys are gone", async () => {
    const fake = new FakeRedis();
    const redis = fake as unknown as Redis;

    await setStoredUserRecord(redis, "ryo", {
      username: "ryo",
      createdAt: 1,
      lastActive: 2,
    });
    await setUserPasswordHash(redis, "ryo", "hashed-password");
    await redis.del(getLegacyStoredUserKey("ryo"), "chat:password:ryo");

    expect(await getStoredUserRecord(redis, "ryo")).toMatchObject({
      username: "ryo",
      lastActive: 2,
    });
    expect(await getUserPasswordHash(redis, "ryo")).toBe("hashed-password");
    expect(await redis.get(redisKeys.auth.userProfile("ryo"))).not.toBeNull();
    expect(await redis.get(redisKeys.auth.userPassword("ryo"))).toBe("hashed-password");
  });
});
