import { describe, expect, test } from "bun:test";
import type { Redis } from "../../../api/_utils/redis";
import { makeKey } from "../../../api/_utils/_rate-limit";
import { deleteLegacyRedisKeys } from "../../../scripts/lib/redis-key-migration";
import { FakeRedis } from "../../helpers/fake-redis";

describe("rate-limit Redis keys", () => {
  test("emits runtime counters under canonical rate prefix with hashed identifiers", () => {
    const key = makeKey(["rl", "parse-title", "burst", "ip", "203.0.113.9"]);

    expect(key).toMatch(/^rate:parse-title:burst:ip:[a-f0-9]{64}$/);
    expect(key.startsWith("rl:")).toBe(false);
    expect(key).not.toContain("203.0.113.9");
  });

  test("legacy rl cleanup does not delete newly generated runtime counters", async () => {
    const fake = new FakeRedis();
    const redis = fake as unknown as Redis;
    const key = makeKey(["rl", "parse-title", "burst", "ip", "203.0.113.9"]);

    await redis.incr(key);
    await redis.expire(key, 60);

    const deletion = await deleteLegacyRedisKeys(redis, {
      pattern: "rl:*",
      limit: 10,
      dryRun: false,
    });

    expect(deletion.deleted).toBe(0);
    expect(await redis.exists(key)).toBe(1);
    expect(await redis.ttl(key)).toBe(60);
  });
});
