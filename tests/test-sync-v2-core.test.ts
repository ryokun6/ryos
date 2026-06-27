import { describe, expect, test } from "bun:test";
import type { Redis } from "../api/_utils/redis";
import {
  applySyncOps,
  ensureSync2Initialized,
  readSyncChanges,
  readSyncDocsByPrefix,
  readSyncSnapshot,
  resolveSyncOp,
  lookupSyncBlobs,
  validateSyncOps,
  sync2KvKey,
  sync2JournalKey,
} from "../api/sync/v2/_core";
import {
  clampHlc,
  compareHlc,
  formatHlc,
  hlcFromTimestamp,
  isValidHlc,
  nextHlc,
  parseHlcMs,
} from "../src/shared/sync2/hlc";
import {
  getSyncKeyNamespace,
  getSyncNamespaceCategory,
  isValidSyncKey,
} from "../src/shared/sync2/namespaces";
import { FakeRedis } from "./fake-redis";

function redis(): Redis {
  return new FakeRedis() as unknown as Redis;
}

class TrackingRedis extends FakeRedis {
  directZaddCount = 0;
  pipelineZaddCount = 0;

  async zadd(
    key: string,
    entry: { score: number; member: string }
  ): Promise<number> {
    this.directZaddCount += 1;
    return super.zadd(key, entry);
  }

  pipeline(): ReturnType<FakeRedis["pipeline"]> {
    const pipeline = super.pipeline();
    const originalZadd = pipeline.zadd.bind(pipeline);
    pipeline.zadd = ((key, entry) => {
      this.pipelineZaddCount += 1;
      return originalZadd(key, entry);
    }) as typeof pipeline.zadd;
    return pipeline;
  }
}

const NOW = Date.now();
const t = (offsetMs: number, clientId = "client-a") =>
  formatHlc(NOW + offsetMs, 0, clientId);

describe("sync v2 HLC", () => {
  test("formats and parses fixed-width timestamps", () => {
    const hlc = formatHlc(1718180000000, 3, "abc123");
    expect(hlc).toBe("01718180000000-0003-abc123");
    expect(parseHlcMs(hlc)).toBe(1718180000000);
    expect(isValidHlc(hlc)).toBe(true);
  });

  test("string comparison respects physical time then counter", () => {
    expect(compareHlc(t(0), t(1000))).toBe(-1);
    expect(compareHlc(formatHlc(NOW, 2, "a"), formatHlc(NOW, 10, "a"))).toBe(-1);
  });

  test("nextHlc is monotonic even when the wall clock stalls", () => {
    const first = nextHlc(null, "c1", NOW);
    const second = nextHlc(first, "c1", NOW);
    const third = nextHlc(second, "c1", NOW - 5000);
    expect(second > first).toBe(true);
    expect(third > second).toBe(true);
  });

  test("clampHlc caps far-future timestamps", () => {
    const farFuture = formatHlc(NOW + 60 * 60 * 1000, 0, "bad-clock");
    const clamped = clampHlc(farFuture, "bad-clock", NOW);
    expect(parseHlcMs(clamped)).toBeLessThanOrEqual(NOW + 5 * 60 * 1000);
    const fine = formatHlc(NOW + 1000, 0, "ok");
    expect(clampHlc(fine, "ok", NOW)).toBe(fine);
  });

  test("hlcFromTimestamp converts ISO timestamps", () => {
    const iso = "2024-06-12T00:00:00.000Z";
    expect(parseHlcMs(hlcFromTimestamp(iso, "legacy"))).toBe(
      new Date(iso).getTime()
    );
  });
});

describe("sync v2 keys", () => {
  test("validates namespaced keys", () => {
    expect(isValidSyncKey("settings/theme")).toBe(true);
    expect(isValidSyncKey("files/item:/Documents/notes.md")).toBe(true);
    expect(isValidSyncKey("bogus/key")).toBe(false);
    expect(isValidSyncKey("settings")).toBe(false);
    expect(getSyncKeyNamespace("images/item:abc")).toBe("images");
    expect(getSyncNamespaceCategory("wallpapers")).toBe("files");
  });

  test("validateSyncOps rejects malformed batches", () => {
    expect(validateSyncOps([])).toBeTruthy();
    expect(validateSyncOps([{ k: "settings/theme", t: "junk", v: 1 }])).toBeTruthy();
    expect(
      validateSyncOps([{ k: "settings/theme", t: t(0) }])
    ).toBeTruthy(); // neither v nor del
    expect(
      validateSyncOps([{ k: "settings/theme", t: t(0), v: { a: 1 } }])
    ).toBeNull();
  });
});

describe("sync v2 ops + LWW", () => {
  test("accepts new keys and assigns sequential seqs", async () => {
    const r = redis();
    const result = await applySyncOps(
      r,
      "user1",
      [
        { k: "settings/theme", v: { current: "macosx" }, t: t(0) },
        { k: "stickies/note:1", v: { id: "1", content: "hi" }, t: t(1) },
      ],
      "client-a"
    );
    expect(result.seq).toBe(2);
    expect(result.results.every((res) => res.accepted)).toBe(true);
    expect(result.accepted.map((op) => op.seq)).toEqual([1, 2]);
  });

  test("rejects older writes and returns the winner inline", async () => {
    const r = redis();
    await applySyncOps(
      r,
      "user1",
      [{ k: "settings/theme", v: { current: "macosx" }, t: t(1000) }],
      "client-a"
    );
    const stale = await applySyncOps(
      r,
      "user1",
      [{ k: "settings/theme", v: { current: "system7" }, t: t(0, "client-b") }],
      "client-b"
    );
    expect(stale.results[0].accepted).toBe(false);
    expect(stale.results[0].winner?.v).toEqual({ current: "macosx" });
    expect(stale.seq).toBe(1);
  });

  test("re-sending the same op is an idempotent no-op", async () => {
    const r = redis();
    const op = { k: "settings/theme", v: { current: "macosx" }, t: t(0) };
    const first = await applySyncOps(r, "user1", [op], "client-a");
    const second = await applySyncOps(r, "user1", [op], "client-a");
    expect(first.results[0].accepted).toBe(true);
    expect(second.results[0].accepted).toBe(false);
    expect(second.seq).toBe(first.seq);
  });

  test("tombstones win over older values and snapshot keeps them", async () => {
    const r = redis();
    await applySyncOps(
      r,
      "user1",
      [{ k: "stickies/note:1", v: { id: "1" }, t: t(0) }],
      "client-a"
    );
    await applySyncOps(
      r,
      "user1",
      [{ k: "stickies/note:1", del: true, t: t(1000) }],
      "client-b"
    );

    const snapshot = await readSyncSnapshot(r, "user1");
    expect(snapshot.entries["stickies/note:1"].del).toBe(true);

    const docs = await readSyncDocsByPrefix(r, "user1", "stickies/");
    expect(Object.keys(docs)).toHaveLength(0);
  });

  test("resolveSyncOp is pure LWW", () => {
    const existing = { v: 1, t: t(1000), seq: 5 };
    expect(resolveSyncOp(null, { k: "a/b", v: 2, t: t(0) })).toBe("accept");
    expect(resolveSyncOp(existing, { k: "a/b", v: 2, t: t(0) })).toBe("reject");
    expect(resolveSyncOp(existing, { k: "a/b", v: 2, t: t(2000) })).toBe("accept");
  });

  test("registers content-addressed blob refs from accepted docs", async () => {
    const r = redis();
    const sha = "a".repeat(64);
    await applySyncOps(
      r,
      "user1",
      [
        {
          k: "images/item:abc",
          v: { blob: { url: "s3://bucket/sync/user1/blobs/aa.gz", size: 10, sha256: sha } },
          t: t(0),
        },
      ],
      "client-a"
    );
    const [entry] = await lookupSyncBlobs(r, "user1", [sha]);
    expect(entry?.url).toBe("s3://bucket/sync/user1/blobs/aa.gz");
  });

  test("pipelines journal writes for large accepted batches", async () => {
    const r = new TrackingRedis();
    const ops = Array.from({ length: 25 }, (_, index) => ({
      k: `settings/bulk-${index}`,
      v: { value: index },
      t: t(index),
    }));

    await applySyncOps(r as unknown as Redis, "bulk-user", ops, "client-a");

    expect(r.directZaddCount).toBe(0);
    expect(r.pipelineZaddCount).toBe(ops.length);
    expect(await r.zcard(sync2JournalKey("bulk-user"))).toBe(ops.length);
  });
});

describe("sync v2 changes feed", () => {
  test("returns only ops after the cursor", async () => {
    const r = redis();
    await applySyncOps(
      r,
      "user1",
      [
        { k: "settings/theme", v: { current: "macosx" }, t: t(0) },
        { k: "settings/audio", v: { masterVolume: 1 }, t: t(1) },
      ],
      "client-a"
    );
    await applySyncOps(
      r,
      "user1",
      [{ k: "settings/dock", v: { scale: 1 }, t: t(2) }],
      "client-b"
    );

    const fromZero = await readSyncChanges(r, "user1", 0);
    expect(fromZero.ops).toHaveLength(3);
    expect(fromZero.seq).toBe(3);

    const fromTwo = await readSyncChanges(r, "user1", 2);
    expect(fromTwo.ops).toHaveLength(1);
    expect(fromTwo.ops?.[0].k).toBe("settings/dock");

    const upToDate = await readSyncChanges(r, "user1", 3);
    expect(upToDate.ops).toEqual([]);
  });

  test("requires a snapshot when the journal no longer covers the cursor", async () => {
    const r = redis();
    await applySyncOps(
      r,
      "user1",
      [{ k: "settings/theme", v: { current: "macosx" }, t: t(0) }],
      "client-a"
    );
    // Simulate journal trimming by clearing the sorted-set journal.
    (r as unknown as FakeRedis).zsets.clear();
    const result = await readSyncChanges(r, "user1", 0);
    expect(result.snapshotRequired).toBe(true);
  });

  test("coalesces repeated writes to the same key to the latest op", async () => {
    const r = redis();
    // Three writes to one key + one write to another, ascending seq.
    await applySyncOps(
      r,
      "user1",
      [{ k: "settings/theme/current", v: { value: "system7" }, t: t(0) }],
      "client-a"
    );
    await applySyncOps(
      r,
      "user1",
      [{ k: "settings/theme/current", v: { value: "macosx" }, t: t(1000) }],
      "client-a"
    );
    await applySyncOps(
      r,
      "user1",
      [{ k: "settings/theme/current", v: { value: "win98" }, t: t(2000) }],
      "client-a"
    );
    await applySyncOps(
      r,
      "user1",
      [{ k: "settings/audio/masterVolume", v: 1, t: t(3000) }],
      "client-a"
    );

    const changes = await readSyncChanges(r, "user1", 0);
    // Four accepted ops, but catch-up collapses the theme key to its latest.
    expect(changes.seq).toBe(4);
    expect(changes.ops).toHaveLength(2);
    const theme = changes.ops?.find((op) => op.k === "settings/theme/current");
    expect(theme?.v).toEqual({ value: "win98" });
    expect(theme?.seq).toBe(3);
    // Ops remain ordered ascending by seq after coalescing.
    expect(changes.ops?.map((op) => op.seq)).toEqual([3, 4]);
  });

  test("coalescing from a mid-journal cursor keeps only newer per-key ops", async () => {
    const r = redis();
    await applySyncOps(
      r,
      "user1",
      [{ k: "settings/theme/current", v: { value: "a" }, t: t(0) }],
      "client-a"
    );
    const afterFirst = (await readSyncChanges(r, "user1", 0)).seq; // 1
    await applySyncOps(
      r,
      "user1",
      [{ k: "settings/theme/current", v: { value: "b" }, t: t(1000) }],
      "client-a"
    );
    await applySyncOps(
      r,
      "user1",
      [{ k: "settings/theme/current", v: { value: "c" }, t: t(2000) }],
      "client-a"
    );

    const changes = await readSyncChanges(r, "user1", afterFirst);
    expect(changes.seq).toBe(3);
    expect(changes.ops).toHaveLength(1);
    expect(changes.ops?.[0].v).toEqual({ value: "c" });
  });
});

describe("sync v2 initialization", () => {
  test("reads refresh sync data TTLs (throttled once per day)", async () => {
    const r = redis();
    const fake = r as unknown as FakeRedis;
    await applySyncOps(
      r,
      "user1",
      [{ k: "settings/theme", v: { current: "macosx" }, t: t(0) }],
      "client-a"
    );

    // Simulate TTLs decaying (e.g. an idle device only ever reads).
    fake.ttls.delete(sync2KvKey("user1"));
    fake.ttls.delete(sync2JournalKey("user1"));

    await readSyncChanges(r, "user1", 0);
    expect(fake.ttls.get(sync2KvKey("user1"))).toBeGreaterThan(0);
    expect(fake.ttls.get(sync2JournalKey("user1"))).toBeGreaterThan(0);

    // Throttle marker prevents refreshing again within the same day.
    fake.ttls.delete(sync2KvKey("user1"));
    await readSyncChanges(r, "user1", 0);
    expect(fake.ttls.get(sync2KvKey("user1"))).toBeUndefined();
  });

  test("initialization is idempotent and writes proceed normally", async () => {
    const r = redis();
    await ensureSync2Initialized(r, "user1");
    await ensureSync2Initialized(r, "user1");
    const result = await applySyncOps(
      r,
      "user1",
      [{ k: "settings/theme", v: { current: "system7" }, t: t(0) }],
      "client-a"
    );
    expect(result.seq).toBe(1);
    const kv = await (r as unknown as FakeRedis).hgetall(sync2KvKey("user1"));
    expect(kv).toBeTruthy();
  });

  test("brand-new user initializes with an empty snapshot", async () => {
    const r = redis();
    await ensureSync2Initialized(r, "newuser");
    const snapshot = await readSyncSnapshot(r, "newuser");
    expect(snapshot.seq).toBe(0);
    expect(Object.keys(snapshot.entries)).toHaveLength(0);
    const result = await applySyncOps(
      r,
      "newuser",
      [{ k: "settings/theme", v: { current: "macosx" }, t: t(0) }],
      "client-a"
    );
    expect(result.seq).toBe(1);
  });
});
