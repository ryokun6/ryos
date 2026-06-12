import { describe, expect, test } from "bun:test";
import type { Redis } from "../api/_utils/redis";
import { applySyncOps, ensureSync2Initialized } from "../api/sync/v2/_core";
import {
  runSyncMaintenance,
  V1_RETIREMENT_TTL_SECONDS,
} from "../api/sync/v2/_maintenance";
import { formatHlc } from "../src/shared/sync2/hlc";
import { FakeRedis } from "./fake-redis";

/**
 * Cloud Sync v2 maintenance (cron) unit tests:
 * - retirement TTLs on frozen v1 keys
 * - blob GC mark-and-sweep with grace period
 * - legacy v1 storage object sweep with manifest pruning
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

describe("sync maintenance: v1 key retirement", () => {
  test("puts TTLs on persistent v1 keys, including per-track song keys", async () => {
    const fake = new FakeRedis();
    const redis = fake as unknown as Redis;

    fake.setSync("sync:state:alice:settings", JSON.stringify({ data: {} }));
    fake.setSync("sync:state:meta:alice", JSON.stringify({}));
    fake.setSync(
      "sync:songs:alice:meta",
      JSON.stringify({ trackOrder: ["a", "b"], libraryState: "loaded" })
    );
    fake.setSync("sync:songs:alice:track:a", JSON.stringify({ id: "a" }));
    fake.setSync("sync:songs:alice:track:b", JSON.stringify({ id: "b" }));
    await seedUser(redis, "alice");

    const { deleteObject } = createDeleteSpy();
    const stats = await runSyncMaintenance(redis, { deleteObject, now: NOW });

    expect(stats.usersProcessed).toBe(1);
    expect(stats.scanComplete).toBe(true);
    expect(stats.v1KeysExpired).toBe(5);
    expect(fake.ttls.get("sync:state:alice:settings")).toBe(
      V1_RETIREMENT_TTL_SECONDS
    );
    expect(fake.ttls.get("sync:songs:alice:track:b")).toBe(
      V1_RETIREMENT_TTL_SECONDS
    );
  });

  test("does not reset TTLs that already exist", async () => {
    const fake = new FakeRedis();
    const redis = fake as unknown as Redis;

    fake.setSync("sync:state:alice:settings", JSON.stringify({ data: {} }), {
      ex: 123,
    });
    await seedUser(redis, "alice");

    const { deleteObject } = createDeleteSpy();
    const stats = await runSyncMaintenance(redis, { deleteObject, now: NOW });

    expect(stats.v1KeysExpired).toBe(0);
    expect(fake.ttls.get("sync:state:alice:settings")).toBe(123);
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
    const registry = await fake.hgetall("sync2:blobs:alice");
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
    const registry = await fake.hgetall("sync2:blobs:alice");
    expect(Object.keys(registry || {})).toContain(sha("b"));
  });

  test("clears a stale mark on a blob that is referenced", async () => {
    const fake = new FakeRedis();
    const redis = fake as unknown as Redis;
    await seedBlobUser(redis);

    // Simulate a leftover mark on a referenced blob (e.g. interrupted run).
    const registryKey = "sync2:blobs:alice";
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

describe("sync maintenance: legacy v1 object sweep", () => {
  test("deletes unreferenced legacy objects, prunes the manifest, keeps referenced ones", async () => {
    const fake = new FakeRedis();
    const redis = fake as unknown as Redis;

    // v1 manifest with one item the user still has (imported → referenced)
    // and one that was deleted in v2, plus a monolithic snapshot object.
    fake.setSync(
      "sync:auto:meta:alice",
      JSON.stringify({
        "files-images": {
          updatedAt: "2026-01-01T00:00:00.000Z",
          storageUrl: "s3://bucket/sync/alice/files-images.gz",
          items: {
            kept: {
              storageUrl: "s3://bucket/sync/alice/files-images/items/kept.gz",
              signature: "d".repeat(64),
              size: 10,
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
            orphaned: {
              storageUrl: "s3://bucket/sync/alice/files-images/items/orphaned.gz",
              signature: "e".repeat(64),
              size: 10,
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          },
        },
      })
    );

    // Import seeds KV from the manifest; then the user deletes "orphaned".
    await ensureSync2Initialized(redis, "alice");
    await applySyncOps(
      redis,
      "alice",
      [{ k: "images/item:orphaned", del: true, t: t(1000) }],
      "client-a"
    );

    const spy = createDeleteSpy();
    const stats = await runSyncMaintenance(redis, {
      deleteObject: spy.deleteObject,
      now: NOW,
    });

    expect(stats.legacyObjectsDeleted).toBe(2); // monolithic + orphaned item
    expect(spy.deleted.sort()).toEqual([
      "s3://bucket/sync/alice/files-images.gz",
      "s3://bucket/sync/alice/files-images/items/orphaned.gz",
    ]);

    // Manifest rewritten without the swept entries, kept item intact.
    const manifest = JSON.parse(fake.kv.get("sync:auto:meta:alice")!);
    expect(manifest["files-images"].storageUrl).toBeUndefined();
    expect(Object.keys(manifest["files-images"].items)).toEqual(["kept"]);

    // Re-running does not retry deletes (manifest was pruned).
    const again = await runSyncMaintenance(redis, {
      deleteObject: spy.deleteObject,
      now: NOW + 1,
    });
    expect(again.legacyObjectsDeleted).toBe(0);
    expect(spy.deleted).toHaveLength(2);
  });

  test("respects the storage deletion budget", async () => {
    const fake = new FakeRedis();
    const redis = fake as unknown as Redis;

    fake.setSync(
      "sync:auto:meta:alice",
      JSON.stringify({
        "files-images": {
          items: {
            a: { storageUrl: "s3://b/sync/alice/i/a.gz", signature: "1".repeat(64), size: 1, updatedAt: "2026-01-01T00:00:00.000Z" },
            b: { storageUrl: "s3://b/sync/alice/i/b.gz", signature: "2".repeat(64), size: 1, updatedAt: "2026-01-01T00:00:00.000Z" },
            c: { storageUrl: "s3://b/sync/alice/i/c.gz", signature: "3".repeat(64), size: 1, updatedAt: "2026-01-01T00:00:00.000Z" },
          },
        },
      })
    );
    await ensureSync2Initialized(redis, "alice");
    // Delete all three items in v2 so every legacy object is sweepable.
    await applySyncOps(
      redis,
      "alice",
      ["a", "b", "c"].map((id, index) => ({
        k: `images/item:${id}`,
        del: true,
        t: t(1000 + index),
      })),
      "client-a"
    );

    const spy = createDeleteSpy();
    const stats = await runSyncMaintenance(redis, {
      deleteObject: spy.deleteObject,
      now: NOW,
      maxStorageDeletes: 2,
    });
    expect(stats.legacyObjectsDeleted).toBe(2);

    // The remaining object is swept on the next run.
    const next = await runSyncMaintenance(redis, {
      deleteObject: spy.deleteObject,
      now: NOW + 1,
      maxStorageDeletes: 10,
    });
    expect(next.legacyObjectsDeleted).toBe(1);
    expect(spy.deleted).toHaveLength(3);
  });
});

describe("sync maintenance: batching", () => {
  test("walks all users across runs via the persisted scan cursor", async () => {
    const fake = new FakeRedis();
    const redis = fake as unknown as Redis;
    const users = Array.from({ length: 8 }, (_, index) => `user${index}`);
    for (const username of users) {
      await seedUser(redis, username);
    }

    const spy = createDeleteSpy();
    // v1 keys let us verify every user was actually visited.
    for (const username of users) {
      fake.setSync(`sync:state:${username}:settings`, JSON.stringify({ data: {} }));
    }

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
    // Every user's v1 key was retired across the combined runs.
    for (const username of users) {
      expect(fake.ttls.get(`sync:state:${username}:settings`)).toBe(
        V1_RETIREMENT_TTL_SECONDS
      );
    }
  });
});
