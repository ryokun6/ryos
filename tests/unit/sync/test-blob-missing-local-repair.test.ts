import "../../helpers/local-storage-stub";
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { CloudSyncEngine } from "../../../src/sync/engine";
import { gzipJson, sha256Json } from "../../../src/sync/blobs";
import { SyncClientState } from "../../../src/sync/state";
import { useCloudSyncStore } from "../../../src/stores/useCloudSyncStore";
import {
  dbOperations,
  ensureIndexedDBInitialized,
  STORES,
} from "../../../src/utils/indexedDB";
import { serializeStoreItem } from "../../../src/utils/indexedDBBackup";

const t = "01718180000000-0000-test";
const BOOK_UUID = "a66df7db-ef19-4b22-a23c-587dbd2ac620";
const SYNC_KEY = `books/item:${BOOK_UUID}`;
const BOOK_NAME = "Steve Jobs in Exile.epub";

async function deleteRyOsDatabase(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("ryOS");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

async function bookStoreItem(content = "epub-bytes") {
  // Match the on-wire shape used by blob upload (Blob → base64 envelope).
  return serializeStoreItem({
    key: BOOK_UUID,
    value: {
      name: BOOK_NAME,
      content: new Blob([new TextEncoder().encode(content)], {
        type: "application/epub+zip",
      }),
    },
  });
}

describe("cloud sync blob missing-local repair", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    await deleteRyOsDatabase();
    useCloudSyncStore.setState({
      autoSyncEnabled: true,
      syncFiles: true,
      syncBooks: true,
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("applyBlobOps re-downloads when shadow hash matches but IndexedDB is empty", async () => {
    const item = await bookStoreItem();
    const digest = await sha256Json(item);
    const compressed = await gzipJson(item);
    let downloadCount = 0;

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("example.test/book.gz")) {
        downloadCount += 1;
        return new Response(new Blob([compressed]), {
          status: 200,
          headers: { "content-length": String(compressed.byteLength) },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    const engine = await CloudSyncEngine.create(
      `blob-repair-${crypto.randomUUID()}`
    );
    try {
      const state = (engine as unknown as { state: SyncClientState }).state;
      // Simulate a device that previously synced this blob (shadow present)
      // but later lost the IndexedDB payload.
      state.setShadow(SYNC_KEY, { t, h: digest });

      const before = await dbOperations.get(STORES.BOOKS, BOOK_UUID);
      expect(before).toBeUndefined();

      // Newer timestamp so applyRemoteOps admits the op; same content hash so
      // the old code path would skip the download based on shadow alone.
      await engine.applyRemoteOps([
        {
          k: SYNC_KEY,
          v: {
            blob: {
              url: "https://example.test/book.gz",
              size: compressed.byteLength,
              sha256: digest,
            },
          },
          t: `${t}-newer`,
        },
      ]);

      expect(downloadCount).toBe(1);
      const restored = await dbOperations.get<{
        name: string;
        content: ArrayBuffer;
      }>(STORES.BOOKS, BOOK_UUID);
      expect(restored?.name).toBe(BOOK_NAME);
      expect(restored?.content).toBeInstanceOf(ArrayBuffer);
      expect(new TextDecoder().decode(restored!.content)).toBe("epub-bytes");
    } finally {
      await engine.stop();
    }
  });

  test("force apply re-enters blob applier even when shadow timestamp matches", async () => {
    const item = await bookStoreItem("forced");
    const digest = await sha256Json(item);
    const compressed = await gzipJson(item);
    let downloadCount = 0;

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("example.test/book.gz")) {
        downloadCount += 1;
        return new Response(new Blob([compressed]), {
          status: 200,
          headers: { "content-length": String(compressed.byteLength) },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    const engine = await CloudSyncEngine.create(
      `blob-force-${crypto.randomUUID()}`
    );
    try {
      const state = (engine as unknown as { state: SyncClientState }).state;
      state.setShadow(SYNC_KEY, { t, h: digest });

      // Without force, matching timestamp would skip before applyBlobOps.
      await engine.applyRemoteOps(
        [
          {
            k: SYNC_KEY,
            v: {
              blob: {
                url: "https://example.test/book.gz",
                size: compressed.byteLength,
                sha256: digest,
              },
            },
            t,
          },
        ],
        { force: true }
      );

      expect(downloadCount).toBe(1);
      const restored = await dbOperations.get<{ content: ArrayBuffer }>(
        STORES.BOOKS,
        BOOK_UUID
      );
      expect(new TextDecoder().decode(restored!.content)).toBe("forced");
    } finally {
      await engine.stop();
    }
  });

  test("ensureBlobItemLocal restores a missing book blob from a prefixed snapshot", async () => {
    const item = await bookStoreItem("from-cloud");
    const digest = await sha256Json(item);
    const compressed = await gzipJson(item);
    let snapshotCalls = 0;
    let downloadCount = 0;

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/sync/v2/snapshot")) {
        snapshotCalls += 1;
        expect(url).toContain(`prefix=${encodeURIComponent(SYNC_KEY)}`);
        return Response.json({
          ok: true,
          seq: 42,
          entries: {
            [SYNC_KEY]: {
              v: {
                blob: {
                  url: "https://example.test/book.gz",
                  size: compressed.byteLength,
                  sha256: digest,
                },
              },
              t,
              seq: 42,
            },
          },
        });
      }
      if (url.includes("example.test/book.gz")) {
        downloadCount += 1;
        return new Response(new Blob([compressed]), {
          status: 200,
          headers: { "content-length": String(compressed.byteLength) },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    const engine = await CloudSyncEngine.create(
      `blob-ensure-${crypto.randomUUID()}`
    );
    try {
      const state = (engine as unknown as { state: SyncClientState }).state;
      state.setShadow(SYNC_KEY, { t, h: digest });

      const ok = await engine.ensureBlobItemLocal("books", BOOK_UUID);
      expect(ok).toBe(true);
      expect(snapshotCalls).toBe(1);
      expect(downloadCount).toBe(1);

      const restored = await dbOperations.get<{ content: ArrayBuffer }>(
        STORES.BOOKS,
        BOOK_UUID
      );
      expect(new TextDecoder().decode(restored!.content)).toBe("from-cloud");

      // Second call is a no-op once bytes are local.
      const again = await engine.ensureBlobItemLocal("books", BOOK_UUID);
      expect(again).toBe(true);
      expect(snapshotCalls).toBe(1);
      expect(downloadCount).toBe(1);
    } finally {
      await engine.stop();
    }
  });

  test("ensureBlobItemLocal forceReload replaces an existing corrupt local blob", async () => {
    const item = await bookStoreItem("good-bytes");
    const digest = await sha256Json(item);
    const compressed = await gzipJson(item);
    let downloadCount = 0;

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/sync/v2/snapshot")) {
        return Response.json({
          ok: true,
          seq: 7,
          entries: {
            [SYNC_KEY]: {
              v: {
                blob: {
                  url: "https://example.test/book.gz",
                  size: compressed.byteLength,
                  sha256: digest,
                },
              },
              t,
              seq: 7,
            },
          },
        });
      }
      if (url.includes("example.test/book.gz")) {
        downloadCount += 1;
        return new Response(new Blob([compressed]), {
          status: 200,
          headers: { "content-length": String(compressed.byteLength) },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    await dbOperations.put(
      STORES.BOOKS,
      { name: BOOK_NAME, content: new Blob(["bad"]) },
      BOOK_UUID
    );

    const engine = await CloudSyncEngine.create(
      `blob-force-reload-${crypto.randomUUID()}`
    );
    try {
      const state = (engine as unknown as { state: SyncClientState }).state;
      state.setShadow(SYNC_KEY, { t, h: digest });

      // Without forceReload, presence short-circuits.
      const skipped = await engine.ensureBlobItemLocal("books", BOOK_UUID);
      expect(skipped).toBe(true);
      expect(downloadCount).toBe(0);

      const ok = await engine.ensureBlobItemLocal("books", BOOK_UUID, {
        forceReload: true,
      });
      expect(ok).toBe(true);
      expect(downloadCount).toBe(1);

      const restored = await dbOperations.get<{ content: ArrayBuffer }>(
        STORES.BOOKS,
        BOOK_UUID
      );
      expect(new TextDecoder().decode(restored!.content)).toBe("good-bytes");
    } finally {
      await engine.stop();
    }
  });

  test("matching shadow with local content still skips download", async () => {
    const item = await bookStoreItem("already-local");
    const digest = await sha256Json(item);
    let downloadCount = 0;

    globalThis.fetch = (async () => {
      downloadCount += 1;
      throw new Error("should not download");
    }) as typeof fetch;

    const db = await ensureIndexedDBInitialized();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORES.BOOKS, "readwrite");
        // Local presence check only needs a record under the UUID key.
        tx.objectStore(STORES.BOOKS).put(
          {
            name: BOOK_NAME,
            content: new TextEncoder().encode("already-local").buffer,
          },
          BOOK_UUID
        );
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }

    const engine = await CloudSyncEngine.create(
      `blob-skip-${crypto.randomUUID()}`
    );
    try {
      const state = (engine as unknown as { state: SyncClientState }).state;
      state.setShadow(SYNC_KEY, { t, h: digest });

      await engine.applyRemoteOps([
        {
          k: SYNC_KEY,
          v: {
            blob: {
              url: "https://example.test/book.gz",
              size: 10,
              sha256: digest,
            },
          },
          t: `${t}-newer`,
        },
      ]);

      expect(downloadCount).toBe(0);
      expect(state.getShadow(SYNC_KEY)?.t).toBe(`${t}-newer`);
      expect(state.getShadow(SYNC_KEY)?.h).toBe(digest);
    } finally {
      await engine.stop();
    }
  });
});
