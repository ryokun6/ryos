import { expect, test } from "bun:test";
import { auditFileSync } from "../../../api/sync/v2/_fileAudit";
import { applySyncOps, sync2BlobsKey } from "../../../api/sync/v2/_core";
import { runSyncMaintenance } from "../../../api/sync/v2/_maintenance";
import { FakeRedis } from "../../helpers/fake-redis";
import type { Redis } from "../../../api/_utils/redis";

const t = "01718180000000-0000-test";
test("audit distinguishes missing, deleted and valid content without matching book titles", () => {
  const file = (uuid: string) => ({ t, seq: 1, v: { uuid, status: "active" } });
  expect(auditFileSync({
    "files/item:/Books/a.epub": file("a"),
    "files/item:/Books/b.epub": file("b"),
    "files/item:/Images/c.png": file("c"),
    "books/item:b": { t, seq: 1, del: true },
    "images/item:c": { t, seq: 1, v: { blob: { url: "s3://test/c", size: 1 } } },
  })).toEqual([
    { path: "/Books/a.epub", uuid: "a", contentKey: "books/item:a", reason: "missing-content" },
    { path: "/Books/b.epub", uuid: "b", contentKey: "books/item:b", reason: "deleted-content" },
  ]);
});

test("an account needing recovery retains even old unreferenced objects", async () => {
  const redis = new FakeRedis() as unknown as Redis;
  await applySyncOps(redis, "recover", [{ k: "files/item:/Books/broken.epub", t, v: { uuid: "lost", status: "active" } }], "test");
  await redis.hset(sync2BlobsKey("recover"), { candidate: JSON.stringify({ url: "s3://test/recovery", size: 1, gc: 1 }) });
  const deleted: string[] = [];
  const stats = await runSyncMaintenance(redis, { now: Date.now(), deleteObject: async url => { deleted.push(url); } });
  expect(stats.recoveryProtectedUsers).toBe(1);
  expect(deleted).toEqual([]);
  expect(await redis.hget(sync2BlobsKey("recover"), "candidate")).not.toBeNull();
});
