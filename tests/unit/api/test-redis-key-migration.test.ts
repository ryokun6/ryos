import { describe, expect, test } from "bun:test";
import type { Redis } from "../../../api/_utils/redis";
import {
  backfillRedisKeyScheme,
  deleteLegacyRedisKeys,
  getRedisMigrationStatus,
  planRedisKeyMigration,
} from "../../../scripts/lib/redis-key-migration";
import { redisKeys, sha256RedisIdentifier } from "../../../src/shared/redisKeys";
import { FakeRedis } from "../../helpers/fake-redis";

describe("Redis key scheme migration helpers", () => {
  test("maps representative legacy keys to canonical targets", async () => {
    await expect(planRedisKeyMigration("chat:users:Alice")).resolves.toMatchObject({
      targetKey: "auth:user:alice:profile",
      action: "copy",
    });
    await expect(planRedisKeyMigration("chat:messages:RoomABC")).resolves.toMatchObject({
      targetKey: "chat:rooms:RoomABC:messages",
      action: "copy",
    });
    await expect(planRedisKeyMigration("song:meta:am:123")).resolves.toMatchObject({
      targetKey: "media:song:am:123:meta",
      action: "copy",
    });
    await expect(planRedisKeyMigration("airdrop:presence")).resolves.toMatchObject({
      targetKey: "presence:airdrop:lobby",
      action: "copy",
    });
    await expect(planRedisKeyMigration("ryos:presence:online")).resolves.toMatchObject({
      targetKey: "presence:global:online",
      action: "copy",
    });
    await expect(planRedisKeyMigration("rl:ai:anon:127.0.0.1")).resolves.toMatchObject({
      targetKey: null,
      action: "skip",
    });
  });

  test("backfills strings and preserves TTLs without deleting legacy keys", async () => {
    const fake = new FakeRedis();
    const redis = fake as unknown as Redis;
    fake.setSync("chat:users:alice", JSON.stringify({ username: "alice" }), {
      ex: 3600,
    });

    const result = await backfillRedisKeyScheme(redis, {
      pattern: "chat:users:*",
      limit: 10,
      dryRun: false,
    });

    expect(result.scanned).toBe(1);
    expect(result.copied).toBe(1);
    expect(await redis.get(redisKeys.auth.userProfile("alice"))).toBe(
      JSON.stringify({ username: "alice" })
    );
    expect(await redis.get("chat:users:alice")).toBe(JSON.stringify({ username: "alice" }));
    expect(fake.ttls.get(redisKeys.auth.userProfile("alice"))).toBe(3600);
  });

  test("backfills analytics visitor HyperLogLogs with a readable canonical count", async () => {
    const fake = new FakeRedis();
    const redis = fake as unknown as Redis;
    const today = new Date().toISOString().slice(0, 10);
    const legacyKey = `analytics:uv:${today}`;
    const canonicalKey = redisKeys.analytics.apiMetric("uv", today);

    await redis.pfadd(legacyKey, "ip:203.0.113.10");
    await redis.pfadd(canonicalKey, "ip:203.0.113.11");
    await redis.expire(legacyKey, 3600);

    const result = await backfillRedisKeyScheme(redis, {
      pattern: "analytics:uv:*",
      limit: 10,
      dryRun: false,
    });

    expect(result.scanned).toBe(1);
    expect(result.copied).toBe(1);
    expect(await redis.pfcount(canonicalKey)).toBe(2);
    expect(fake.ttls.get(canonicalKey)).toBe(3600);
    expect(await redis.pfcount(legacyKey)).toBe(1);
  });

  test("backfills analytics hashes without replacing canonical counts", async () => {
    const fake = new FakeRedis();
    const redis = fake as unknown as Redis;
    const today = new Date().toISOString().slice(0, 10);
    const legacyKey = `analytics:daily:${today}`;
    const canonicalKey = redisKeys.analytics.apiMetric("daily", today);

    await redis.hset(legacyKey, {
      calls: "3",
      ai: "2",
      latsum: "90",
      latcnt: "3",
    });
    await redis.hset(canonicalKey, {
      calls: "4",
      errors: "1",
      latsum: "80",
      latcnt: "4",
    });
    await redis.expire(legacyKey, 3600);

    const result = await backfillRedisKeyScheme(redis, {
      pattern: "analytics:daily:*",
      limit: 10,
      dryRun: false,
    });

    expect(result.scanned).toBe(1);
    expect(result.copied).toBe(1);
    expect(await redis.hgetall(canonicalKey)).toMatchObject({
      calls: "7",
      ai: "2",
      errors: "1",
      latsum: "170",
      latcnt: "7",
    });
    expect(fake.ttls.get(canonicalKey)).toBe(3600);
  });

  test("re-running an analytics hash backfill is idempotent (no double count)", async () => {
    const fake = new FakeRedis();
    const redis = fake as unknown as Redis;
    const today = new Date().toISOString().slice(0, 10);
    const legacyKey = `analytics:daily:${today}`;
    const canonicalKey = redisKeys.analytics.apiMetric("daily", today);

    await redis.hset(legacyKey, { calls: "3", ai: "2" });
    await redis.expire(legacyKey, 3600);

    const first = await backfillRedisKeyScheme(redis, {
      pattern: "analytics:daily:*",
      limit: 10,
      dryRun: false,
    });
    expect(first.copied).toBe(1);
    expect(first.skipped).toBe(0);
    expect(await redis.hgetall(canonicalKey)).toMatchObject({ calls: "3", ai: "2" });

    // A retried batch (e.g. after a partial/timed-out run) must skip the already
    // migrated key via its idempotency marker rather than incrementing again.
    const second = await backfillRedisKeyScheme(redis, {
      pattern: "analytics:daily:*",
      limit: 10,
      dryRun: false,
    });
    expect(second.copied).toBe(0);
    expect(second.skipped).toBe(1);
    expect(second.warnings).toEqual([]);
    expect(await redis.hgetall(canonicalKey)).toMatchObject({ calls: "3", ai: "2" });
  });

  test("re-running an analytics visitor HLL backfill does not re-merge", async () => {
    const fake = new FakeRedis();
    const redis = fake as unknown as Redis;
    const today = new Date().toISOString().slice(0, 10);
    const legacyKey = `analytics:uv:${today}`;
    const canonicalKey = redisKeys.analytics.apiMetric("uv", today);

    await redis.pfadd(legacyKey, "ip:203.0.113.10");
    await redis.pfadd(canonicalKey, "ip:203.0.113.11");

    const first = await backfillRedisKeyScheme(redis, {
      pattern: "analytics:uv:*",
      limit: 10,
      dryRun: false,
    });
    expect(first.copied).toBe(1);
    expect(await redis.pfcount(canonicalKey)).toBe(2);

    const second = await backfillRedisKeyScheme(redis, {
      pattern: "analytics:uv:*",
      limit: 10,
      dryRun: false,
    });
    expect(second.copied).toBe(0);
    expect(second.skipped).toBe(1);
    expect(await redis.pfcount(canonicalKey)).toBe(2);
  });

  test("backfills auth sessions with hashed token keys and user session index", async () => {
    const fake = new FakeRedis();
    const redis = fake as unknown as Redis;
    fake.setSync("chat:token:user:alice:secret-token", "123", { ex: 120 });
    const tokenHash = await sha256RedisIdentifier("secret-token");

    const result = await backfillRedisKeyScheme(redis, {
      pattern: "chat:token:*",
      limit: 10,
      dryRun: false,
    });

    expect(result.copied).toBe(1);
    expect(await redis.get(redisKeys.auth.session(tokenHash))).toBe("123");
    expect(await redis.smembers(redisKeys.auth.userSessions("alice"))).toEqual([tokenHash]);
    expect(fake.ttls.get(redisKeys.auth.session(tokenHash))).toBe(120);
    expect(fake.ttls.get(redisKeys.auth.userSessions("alice"))).toBe(120);
  });

  test("dry-run backfill plans without writing target keys", async () => {
    const fake = new FakeRedis();
    const redis = fake as unknown as Redis;
    fake.setSync("song:meta:abc", JSON.stringify({ id: "abc" }));

    const result = await backfillRedisKeyScheme(redis, {
      pattern: "song:*",
      limit: 10,
      dryRun: true,
    });

    expect(result.scanned).toBe(1);
    expect(result.planned).toBe(1);
    expect(result.copied).toBe(0);
    expect(await redis.get(redisKeys.media.songMeta("abc"))).toBeNull();
  });

  test("backfill returns cursors so the UI can continue through all batches", async () => {
    const fake = new FakeRedis();
    const redis = fake as unknown as Redis;
    fake.setSync("chat:users:alice", JSON.stringify({ username: "alice" }));
    fake.setSync("chat:users:bob", JSON.stringify({ username: "bob" }));

    const first = await backfillRedisKeyScheme(redis, {
      pattern: "chat:users:*",
      limit: 1,
      dryRun: false,
      cursor: "0",
    });
    expect(first.scanned).toBe(1);
    expect(first.cursor).not.toBe("0");

    let cursor = first.cursor;
    let scanned = first.scanned;
    for (let i = 0; i < 10 && cursor !== "0"; i += 1) {
      const next = await backfillRedisKeyScheme(redis, {
        pattern: "chat:users:*",
        limit: 1,
        dryRun: false,
        cursor,
      });
      scanned += next.scanned;
      cursor = next.cursor;
    }
    expect(cursor).toBe("0");
    expect(scanned).toBeGreaterThanOrEqual(2);
    expect(await redis.get(redisKeys.auth.userProfile("alice"))).not.toBeNull();
    expect(await redis.get(redisKeys.auth.userProfile("bob"))).not.toBeNull();
  });

  test("backfills sync2 journals as zsets while preserving scores", async () => {
    const fake = new FakeRedis();
    const redis = fake as unknown as Redis;
    await fake.zadd("sync2:jrnl:ryo", { score: 2, member: JSON.stringify({ seq: 2 }) });
    await fake.zadd("sync2:jrnl:ryo", { score: 1, member: JSON.stringify({ seq: 1 }) });

    const result = await backfillRedisKeyScheme(redis, {
      pattern: "sync2:*",
      limit: 10,
      dryRun: false,
    });

    expect(result.scanned).toBe(1);
    expect(result.copied).toBe(1);
    expect(result.warnings).toEqual([]);
    expect(await fake.zrangeWithScores(redisKeys.sync.v2Journal("ryo"), 0, -1)).toEqual([
      { score: 1, member: JSON.stringify({ seq: 1 }) },
      { score: 2, member: JSON.stringify({ seq: 2 }) },
    ]);
  });

  test("treats abandoned sync2 log keys as a silent backfill skip", async () => {
    const fake = new FakeRedis();
    const redis = fake as unknown as Redis;
    await fake.rpush("sync2:log:ryo", JSON.stringify({ seq: 1 }));

    await expect(planRedisKeyMigration("sync2:log:ryo")).resolves.toMatchObject({
      targetKey: null,
      action: "skip",
    });

    const result = await backfillRedisKeyScheme(redis, {
      pattern: "sync2:*",
      limit: 10,
      dryRun: false,
    });

    expect(result.scanned).toBe(1);
    expect(result.copied).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.warnings).toEqual([]);
  });

  test("reports legacy status and deletes legacy batches only when not dry-run", async () => {
    const fake = new FakeRedis();
    const redis = fake as unknown as Redis;
    fake.setSync("applet:share:a1", JSON.stringify({ id: "a1" }));
    fake.setSync("applet:share:a2", JSON.stringify({ id: "a2" }));

    const status = await getRedisMigrationStatus(redis, 10);
    const appletStatus = status.patterns.find((item) => item.pattern === "applet:*");
    expect(appletStatus?.count).toBe(2);

    const dryRun = await deleteLegacyRedisKeys(redis, {
      pattern: "applet:*",
      limit: 10,
      dryRun: true,
    });
    expect(dryRun.deleted).toBe(0);
    expect(await redis.get("applet:share:a1")).not.toBeNull();

    const deleted = await deleteLegacyRedisKeys(redis, {
      pattern: "applet:*",
      limit: 10,
      dryRun: false,
    });
    expect(deleted.deleted).toBe(2);
    expect(await redis.get("applet:share:a1")).toBeNull();
    expect(await redis.get("applet:share:a2")).toBeNull();
  });
});
