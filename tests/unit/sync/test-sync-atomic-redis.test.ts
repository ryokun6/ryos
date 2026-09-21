import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import IORedis from "ioredis";
import { COMMIT_SYNC_BATCH, CLAIM_SYNC_BLOB, LEASE_SYNC_BLOBS, MARK_SYNC_BLOB } from "../../../api/sync/v2/_atomic";

// Explicitly local and disposable. Never use the application's Redis URL here.
const port = Number(process.env.SYNC_TEST_REDIS_PORT);
const enabled = Number.isInteger(port) && port > 0;
const redis = enabled ? new IORedis({ host: "127.0.0.1", port, maxRetriesPerRequest: 0 }) : null;
const prefix = `sync-atomic-test:${crypto.randomUUID()}`;
const keys = ["seq", "kv", "journal", "blobs"].map(key => `${prefix}:${key}`);
const digest = "a".repeat(64);
const blob = { url: "s3://test/content", size: 12, gc: 1 };
const commit = (expected = 0, blobs = {}) => redis!.eval(COMMIT_SYNC_BATCH, 4, ...keys,
  expected, expected + 1, JSON.stringify({ "files/item:/test": JSON.stringify({ t: "time", v: {} }) }),
  JSON.stringify([{ seq: expected + 1, member: JSON.stringify({ k: "files/item:/test", seq: expected + 1 }) }]),
  JSON.stringify(blobs), 4096);

beforeEach(async () => { if (redis) await redis.del(...keys); });
afterAll(async () => { if (redis) { await redis.del(...keys); await redis.quit(); } });

describe.skipIf(!enabled)("real Redis sync atomicity", () => {
  test("concurrent writers cannot share a sequence or publish half a batch", async () => {
    expect((await Promise.all([commit(), commit()])).sort()).toEqual([0, 1]);
    expect(await redis!.get(keys[0])).toBe("1");
    expect(await redis!.hlen(keys[1])).toBe(1);
    expect(await redis!.zcard(keys[2])).toBe(1);
    expect(await redis!.ttl(keys[0])).toBe(-1);
  });
  test("wrong Redis types fail before any mutation", async () => {
    await redis!.set(keys[2], "corrupt");
    await expect(commit()).rejects.toThrow("Invalid sync storage type");
    expect(await redis!.get(keys[0])).toBeNull();
    expect(await redis!.hlen(keys[1])).toBe(0);
  });
  test("a reservation prevents a stale garbage collector from marking or claiming", async () => {
    await redis!.hset(keys[3], digest, JSON.stringify(blob));
    await redis!.eval(LEASE_SYNC_BLOBS, 1, keys[3], JSON.stringify([digest]), 1000);
    for (const script of [MARK_SYNC_BLOB, CLAIM_SYNC_BLOB]) {
      expect(await redis!.eval(script, 2, keys[0], keys[3], 0, digest, JSON.stringify(blob), 100)).toBe(0);
    }
  });
  test("catalog changes prevent collection; JSON property order does not prevent safe collection", async () => {
    await redis!.hset(keys[3], digest, JSON.stringify(blob));
    await redis!.set(keys[0], 1);
    expect(await redis!.eval(CLAIM_SYNC_BLOB, 2, keys[0], keys[3], 0, digest, JSON.stringify(blob), 100)).toBe(0);
    const reordered = JSON.stringify({ gc: 1, size: 12, url: blob.url });
    expect(await redis!.eval(CLAIM_SYNC_BLOB, 2, keys[0], keys[3], 1, digest, reordered, 100)).toBe(1);
    await expect(commit(1, { [digest]: JSON.stringify(blob) })).rejects.toThrow("being collected");
    expect(await redis!.get(keys[0])).toBe("1");
    expect(await redis!.hlen(keys[1])).toBe(0);
    await expect(redis!.eval(LEASE_SYNC_BLOBS, 1, keys[3], JSON.stringify([digest]), 1000)).rejects.toThrow("being collected");
  });
});
