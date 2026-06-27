import { describe, expect, test } from "bun:test";
import type { Redis } from "../api/_utils/redis";
import { applySyncOps, ensureSync2Initialized, sync2BlobsKey } from "../api/sync/v2/_core";
import { runSyncMaintenance } from "../api/sync/v2/_maintenance";
import { redisKeys } from "../src/shared/redisKeys";
import { formatHlc } from "../src/shared/sync2/hlc";
import { FakeRedis } from "./fake-redis";

/**
 * Cloud Sync v2 maintenance (cron) unit tests:
 * - blob GC mark-and-sweep with grace period
 * - bounded batching via the persisted scan cursor
 */

const NOW = Date.now();
const t = (offsetMs: number) => formatHlc(NOW + offsetMs, 0, "client-a");

function createDeleteSpy() {
  const deleted: string[] = [];
  return {
    deleted,
    deleteObject: async (url: string) => {
      deleted.push(url);
    },
  };
}

/** Seed an initialized v2 user with one synced sticky note. */
async function seedUser(redis: Redis, username: string): Promise<void> {
  await applySyncOps(
    redis,
    username,
    [{ k: "stickies/note:n1", v: { id: "n1", content: "hi" }, t: t(0) }],
    "client-a"
  );
}

describe("sync maintenance: user records", () => {
  test("removes stale TTLs from user records (persist forever)", async () => {
    const fake = new FakeRedis();
    const redis = fake as unknown as Redis;

    const canonicalUserKey = redisKeys.auth.userProfile("alice");
    fake.setSync(canonicalUserKey, JSON.stringify({ username: "alice" }), {
      ex: 90 * 24 * 60 * 60,
    });
    fake.setSync("chat:users:alice", JSON.stringify({ username: "alice" }), {
      ex: 90 * 24 * 60 * 60,
    });
    await seedUser(redis, "alice");

    const { deleteObject } = createDeleteSpy();
    const stats = await runSyncMaintenance(redis, { deleteObject, now: NOW });

    expect(stats.userRecordsPersisted).toBe(1);
    expect(fake.ttls.has(canonicalUserKey)).toBe(false);
    expect(fake.ttls.has("chat:users:alice")).toBe(true);

    // Already-persistent records are untouched on subsequent runs.
    const again = await runSyncMaintenance(redis, { deleteObject, now: NOW + 1 });
    expect(again.userRecordsPersisted).toBe(0);
  });

});

describe("sync maintenance: blob GC mark-and-sweep", () => {
  const sha = (char: string) => char.repeat(64);
  const blobOp = (key: string, digest: string, offsetMs: number) => ({
    k: key,
    v: {
      blob: {
        url: `s3://bucket/sync/alice/blobs/${digest}.gz`,
        size: 100,
        sha256: digest,
      },
    },
    t: t(offsetMs),
  });

  async function seedBlobUser(redis: Redis): Promise<void> {
    await applySyncOps(
      redis,
      "alice",
      [blobOp("images/item:keep", sha("a"), 0), blobOp("images/item:drop", sha("b"), 1)],
      "client-a"
    );
    // Replacing the doc's content leaves sha("b") unreferenced in the registry.
    await applySyncOps(
      redis,
      "alice",
      [blobOp("images/item:drop", sha("c"), 2000)],
      "client-a"
    );
  }

  test("marks unreferenced blobs first, deletes only after the grace period", async () => {
    const fake = new FakeRedis();
    const redis = fake as unknown as Redis;
    await seedBlobUser(redis);

    const spy = createDeleteSpy();

    // Run 1: sha("b") becomes marked, nothing deleted.
    const first = await runSyncMaintenance(redis, {
      deleteObject: spy.deleteObject,
      now: NOW,
    });
    expect(first.blobsMarked).toBe(1);
    expect(first.blobsDeleted).toBe(0);
    expect(spy.deleted).toEqual([]);

    // Run 2 within the grace window: still nothing deleted.
    const second = await runSyncMaintenance(redis, {
      deleteObject: spy.deleteObject,
      now: NOW + 1000,
      graceMs: 60_000,
    });
    expect(second.blobsDeleted).toBe(0);

    // Run 3 past the grace window: swept.
    const third = await runSyncMaintenance(redis, {
      deleteObject: spy.deleteObject,
      now: NOW + 120_000,
      graceMs: 60_000,
    });
    expect(third.blobsDeleted).toBe(1);
    expect(spy.deleted).toEqual([`s3://bucket/sync/alice/blobs/${sha("b")}.gz`]);

    // Referenced blobs are untouched.
    const registry = await fake.hgetall(sync2BlobsKey("alice"));
    expect(Object.keys(registry || {})).toContain(sha("a"));
    expect(Object.keys(registry || {})).toContain(sha("c"));
    expect(Object.keys(registry || {})).not.toContain(sha("b"));
  });

  test("never deletes a blob that becomes referenced again before the sweep", async () => {
    const fake = new FakeRedis();
    const redis = fake as unknown as Redis;
    await seedBlobUser(redis);

    const spy = createDeleteSpy();
    await runSyncMaintenance(redis, { deleteObject: spy.deleteObject, now: NOW });

    // Re-reference sha("b") before the sweep.
    await applySyncOps(
      redis,
      "alice",
      [blobOp("images/item:restored", sha("b"), 5000)],
      "client-a"
    );

    const sweep = await runSyncMaintenance(redis, {
      deleteObject: spy.deleteObject,
      now: NOW + 120_000,
      graceMs: 60_000,
    });
    expect(sweep.blobsDeleted).toBe(0);
    expect(spy.deleted).toEqual([]);
    const registry = await fake.hgetall(sync2BlobsKey("alice"));
    expect(Object.keys(registry || {})).toContain(sha("b"));
  });

  test("clears a stale mark on a blob that is referenced", async () => {
    const fake = new FakeRedis();
    const redis = fake as unknown as Redis;
    await seedBlobUser(redis);

    // Simulate a leftover mark on a referenced blob (e.g. interrupted run).
    const registryKey = sync2BlobsKey("alice");
    const marked = JSON.parse(
      (await fake.hget<string>(registryKey, sha("a")))!
    );
    await fake.hset(registryKey, {
      [sha("a")]: JSON.stringify({ ...marked, gc: NOW - 1000 }),
    });

    const spy = createDeleteSpy();
    const stats = await runSyncMaintenance(redis, {
      deleteObject: spy.deleteObject,
      now: NOW + 120_000,
      graceMs: 60_000,
    });
    expect(stats.blobsUnmarked).toBe(1);
    expect(spy.deleted).toEqual([]);
    const entry = JSON.parse((await fake.hget<string>(registryKey, sha("a")))!);
    expect(entry.gc).toBeUndefined();
  });
});

describe("sync maintenance: batching", () => {
  test("ignores users that exist only under pre-canonical sync2:kv keys", async () => {
    const fake = new FakeRedis();
    const redis = fake as unknown as Redis;

    fake.setSync("sync2:seq:legacyonly", "1");
    await fake.hset("sync2:kv:legacyonly", {
      "settings/theme": JSON.stringify({
        v: { current: "aqua" },
        t: t(0),
        seq: 1,
      }),
    });
    const { deleteObject } = createDeleteSpy();
    const stats = await runSyncMaintenance(redis, { deleteObject, now: NOW });

    expect(stats.usersProcessed).toBe(0);
  });

  test("walks all users across runs via the persisted scan cursor", async () => {
    const fake = new FakeRedis();
    const redis = fake as unknown as Redis;
    const users = Array.from({ length: 8 }, (_, index) => `user${index}`);
    for (const username of users) {
      await seedUser(redis, username);
    }

    const spy = createDeleteSpy();
    const runs: number[] = [];
    let scanComplete = false;
    // Small scan windows force multiple runs; the cursor persists between.
    for (let run = 0; run < 20 && !scanComplete; run += 1) {
      const stats = await runSyncMaintenance(redis, {
        deleteObject: spy.deleteObject,
        now: NOW,
        maxUsers: 2,
        scanCount: 5,
      });
      runs.push(stats.usersProcessed);
      scanComplete = stats.scanComplete;
    }

    expect(scanComplete).toBe(true);
    expect(runs.length).toBeGreaterThan(1);
    expect(runs.reduce((sum, count) => sum + count, 0)).toBe(users.length);
  });
});
