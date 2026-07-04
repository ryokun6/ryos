import "./local-storage-stub";
import { describe, expect, test } from "bun:test";
import { gunzipJson, hashDoc, sha256Json } from "../src/sync/contentCodec";
import {
  runDecodeBlobTask,
  runHashDocsTask,
  runPrepareBlobUpsertTask,
} from "../src/sync/workerTasks";
import {
  decodeBlobItemOffThread,
  hashDocsOffThread,
  prepareBlobUpsertsOffThread,
} from "../src/sync/workerClient";
import { serializeStoreItem } from "../src/utils/storeItemSerialization";
import type { IndexedDBStoreItemWithKey } from "../src/utils/indexedDBBackup";

/**
 * Cloud sync worker tasks: the pure transforms that run in the sync Web
 * Worker (or its main-thread fallback) must produce byte-identical results
 * to the previous inline implementations — shadow hashes and server-side
 * blob dedupe both depend on the exact serialization formula.
 */

const rawItem: IndexedDBStoreItemWithKey = {
  key: "img-1",
  value: {
    name: "photo.png",
    content: new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/png" }),
    meta: { width: 2, height: 2 },
  },
};

describe("runHashDocsTask", () => {
  test("matches hashDoc for every entry", () => {
    const docs = [
      { key: "stickies/note:n1", doc: { id: "n1", content: "hello" } },
      { key: "settings/display/theme", doc: "system7" },
      { key: "maps/home", doc: null },
    ];
    const hashes = runHashDocsTask(docs);
    for (const { key, doc } of docs) {
      expect(hashes.get(key)).toBe(hashDoc(doc));
    }
  });
});

describe("runPrepareBlobUpsertTask", () => {
  test("digest matches the legacy sha256Json(serializeStoreItem(item)) formula", async () => {
    const serialized = await serializeStoreItem(rawItem);
    const legacySha = await sha256Json(serialized);
    const candidate = await runPrepareBlobUpsertTask(
      { key: "images/item:img-1", item: rawItem },
      undefined,
      false
    );
    expect(candidate.sha256).toBe(legacySha);
  });

  test("skips compression when the shadow hash matches", async () => {
    const serialized = await serializeStoreItem(rawItem);
    const sha = await sha256Json(serialized);
    const candidate = await runPrepareBlobUpsertTask(
      { key: "images/item:img-1", item: rawItem },
      sha,
      false
    );
    expect(candidate.compressed).toBeUndefined();
  });

  test("force compresses even when the shadow hash matches", async () => {
    const serialized = await serializeStoreItem(rawItem);
    const sha = await sha256Json(serialized);
    const candidate = await runPrepareBlobUpsertTask(
      { key: "images/item:img-1", item: rawItem },
      sha,
      true
    );
    expect(candidate.compressed).toBeDefined();
  });

  test("compressed payload round-trips to the serialized wire form", async () => {
    const candidate = await runPrepareBlobUpsertTask(
      { key: "images/item:img-1", item: rawItem },
      undefined,
      false
    );
    const decoded = await gunzipJson<IndexedDBStoreItemWithKey>(
      candidate.compressed!
    );
    expect(decoded).toEqual(await serializeStoreItem(rawItem));
    expect(typeof decoded.value.content).toBe("string");
    expect(
      (decoded.value.content as string).startsWith("data:image/png;base64,")
    ).toBe(true);
    expect(decoded.value._isBlob_content).toBe(true);
  });
});

describe("runDecodeBlobTask", () => {
  test("round-trips a prepared upload payload", async () => {
    const candidate = await runPrepareBlobUpsertTask(
      { key: "images/item:img-1", item: rawItem },
      undefined,
      true
    );
    const decoded = await runDecodeBlobTask(candidate.compressed!);
    expect(decoded).toEqual(await serializeStoreItem(rawItem));
  });
});

describe("workerClient main-thread fallback (no Worker in bun)", () => {
  test("hashDocsOffThread matches hashDoc", async () => {
    const docs = Array.from({ length: 60 }, (_, index) => ({
      key: `stickies/note:n${index}`,
      doc: { id: `n${index}`, content: `note ${index}` },
    }));
    const hashes = await hashDocsOffThread(docs);
    expect(hashes.size).toBe(docs.length);
    for (const { key, doc } of docs) {
      expect(hashes.get(key)).toBe(hashDoc(doc));
    }
  });

  test("prepareBlobUpsertsOffThread applies shadow skip per key", async () => {
    const otherItem: IndexedDBStoreItemWithKey = {
      key: "img-2",
      value: { name: "other.png", content: new ArrayBuffer(8) },
    };
    const unchangedSha = (
      await runPrepareBlobUpsertTask(
        { key: "images/item:img-1", item: rawItem },
        undefined,
        false
      )
    ).sha256;

    const candidates = await prepareBlobUpsertsOffThread(
      [
        { key: "images/item:img-1", item: rawItem },
        { key: "images/item:img-2", item: otherItem },
      ],
      { "images/item:img-1": unchangedSha },
      false
    );

    const byKey = new Map(candidates.map((c) => [c.key, c]));
    expect(byKey.get("images/item:img-1")!.compressed).toBeUndefined();
    expect(byKey.get("images/item:img-2")!.compressed).toBeDefined();
  });

  test("decodeBlobItemOffThread round-trips", async () => {
    const candidate = await runPrepareBlobUpsertTask(
      { key: "images/item:img-1", item: rawItem },
      undefined,
      true
    );
    const decoded = await decodeBlobItemOffThread(
      candidate.compressed!.slice().buffer as ArrayBuffer
    );
    expect(decoded).toEqual(await serializeStoreItem(rawItem));
  });
});
