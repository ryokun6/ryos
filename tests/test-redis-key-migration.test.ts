import { describe, expect, test } from "bun:test";
import type { Redis } from "../api/_utils/redis";
import {
  backfillRedisKeyScheme,
  deleteLegacyRedisKeys,
  getRedisMigrationStatus,
  planRedisKeyMigration,
} from "../api/_utils/redis-key-migration";
import { redisKeys, sha256RedisIdentifier } from "../src/shared/redisKeys";
import { FakeRedis } from "./fake-redis";

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
    await expect(planRedisKeyMigration("rl:ai:anon:127.0.0.1")).resolves.toMatchObject({
      targetKey: null,
      action: "skip",
    });
    await expect(planRedisKeyMigration("sync:state:alice:settings")).resolves.toMatchObject({
      targetKey: "sync:v2:user:alice:kv",
      action: "import-v1-sync",
      username: "alice",
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

  test("imports legacy sync v1 keys into sync2 instead of warning", async () => {
    const fake = new FakeRedis();
    const redis = fake as unknown as Redis;
    fake.setSync(
      "sync:state:alice:settings",
      JSON.stringify({
        data: {
          display: { desktopScale: 1 },
        },
        updatedAt: "2026-01-01T00:00:00.000Z",
      })
    );

    const result = await backfillRedisKeyScheme(redis, {
      pattern: "sync:state:*",
      limit: 10,
      dryRun: false,
    });

    expect(result.scanned).toBe(1);
    expect(result.planned).toBe(1);
    expect(result.copied).toBe(1);
    expect(result.warnings).toEqual([]);
    expect(await redis.get("sync2:seq:alice")).toBe("0");
    const kv = await redis.hgetall("sync2:kv:alice");
    expect(Object.keys(kv || {})).toContain("settings/display");
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
