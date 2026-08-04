import "../../helpers/local-storage-stub";
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { CloudSyncEngine } from "../../../src/sync/engine";
import { gzipJson, sha256Json } from "../../../src/sync/blobs";
import { SyncClientState } from "../../../src/sync/state";
import { useCloudSyncStore } from "../../../src/stores/useCloudSyncStore";
import { useFilesStore } from "../../../src/stores/useFilesStore";
import {
  dbOperations,
  ensureIndexedDBInitialized,
  STORES,
} from "../../../src/utils/indexedDB";
import { serializeStoreItem } from "../../../src/utils/indexedDBBackup";
import type { SyncOp } from "../../../src/shared/sync2/types";
import { resetFakeIndexedDB } from "../../helpers/reset-fake-indexeddb";

const t = "01718180000000-0000-test";
const BOOK_UUID = "a66df7db-ef19-4b22-a23c-587dbd2ac620";
const BOOK_UUID_REMOTE = "b77ef8ec-f020-5c33-b34d-698ece3bd731";
const SYNC_KEY = `books/item:${BOOK_UUID}`;
const BOOK_PATH = "/Books/Steve Jobs in Exile.epub";
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
    // Fresh factory so prior happy-dom unregister / leaked connections can't
    // leave deleteDatabase hanging until the suite timeout.
    resetFakeIndexedDB();
    await deleteRyOsDatabase();
    useCloudSyncStore.setState({
      autoSyncEnabled: true,
      syncFiles: true,
      syncBooks: true,
      deletionMarkers: {
        ...useCloudSyncStore.getState().deletionMarkers,
        fileBookKeys: {},
      },
    });
    useFilesStore.setState({
      items: {},
      libraryState: "loaded",
    } as never);
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

  test("does not tombstone a missing local book blob without a deletion marker", async () => {
    const uploadedOps: SyncOp[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/sync/v2/ops")) {
        const body = JSON.parse(String(init?.body)) as { ops: SyncOp[] };
        uploadedOps.push(...body.ops);
        return Response.json({
          ok: true,
          seq: body.ops.length,
          results: body.ops.map((op) => ({
            k: op.k,
            accepted: true,
            seq: 1,
          })),
        });
      }
      if (url.includes("/api/sync/v2/snapshot")) {
        return Response.json({ ok: true, seq: 0, entries: {} });
      }
      if (url.includes("/api/sync/v2/changes")) {
        return Response.json({ ok: true, seq: 0, ops: [] });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    const engine = await CloudSyncEngine.create(
      `blob-no-tombstone-${crypto.randomUUID()}`
    );
    try {
      const state = (engine as unknown as { state: SyncClientState }).state;
      // Shadow says the book was synced, but IndexedDB no longer has bytes.
      state.setShadow(SYNC_KEY, { t, h: "a".repeat(64) });
      engine.markDirty("books", [SYNC_KEY]);
      await engine.flush({ throwOnError: true });

      expect(uploadedOps.some((op) => op.k === SYNC_KEY && op.del)).toBe(false);
      // Shadow kept — we did not locally record a tombstone either.
      expect(state.getShadow(SYNC_KEY)?.h).toBe("a".repeat(64));
    } finally {
      await engine.stop();
    }
  });

  test("tombstones a missing local book blob when explicitly marked deleted", async () => {
    const uploadedOps: SyncOp[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/sync/v2/ops")) {
        const body = JSON.parse(String(init?.body)) as { ops: SyncOp[] };
        uploadedOps.push(...body.ops);
        return Response.json({
          ok: true,
          seq: body.ops.length,
          results: body.ops.map((op) => ({
            k: op.k,
            accepted: true,
            seq: 1,
          })),
        });
      }
      if (url.includes("/api/sync/v2/snapshot")) {
        return Response.json({ ok: true, seq: 0, entries: {} });
      }
      if (url.includes("/api/sync/v2/changes")) {
        return Response.json({ ok: true, seq: 0, ops: [] });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    useCloudSyncStore
      .getState()
      .markDeletedKeys("fileBookKeys", [BOOK_UUID]);

    const engine = await CloudSyncEngine.create(
      `blob-tombstone-${crypto.randomUUID()}`
    );
    try {
      const state = (engine as unknown as { state: SyncClientState }).state;
      state.setShadow(SYNC_KEY, { t, h: "a".repeat(64) });
      engine.markDirty("books", [SYNC_KEY]);
      await engine.flush({ throwOnError: true });

      expect(uploadedOps.some((op) => op.k === SYNC_KEY && op.del)).toBe(true);
      // Accepted deletes clear the local shadow (see sendOps) rather than
      // leaving an "__del__" placeholder.
      expect(state.getShadow(SYNC_KEY)).toBeNull();
    } finally {
      await engine.stop();
    }
  });

  test("ensureBlobItemLocal adopts a newer remote files UUID when local blob is gone", async () => {
    const remoteItem = await serializeStoreItem({
      key: BOOK_UUID_REMOTE,
      value: {
        name: BOOK_NAME,
        content: new Blob([new TextEncoder().encode("replacement")], {
          type: "application/epub+zip",
        }),
      },
    });
    const digest = await sha256Json(remoteItem);
    const compressed = await gzipJson(remoteItem);
    const remoteFilesKey = `files/item:${BOOK_PATH}`;
    const remoteBlobKey = `books/item:${BOOK_UUID_REMOTE}`;

    useFilesStore.setState({
      items: {
        [BOOK_PATH]: {
          path: BOOK_PATH,
          name: BOOK_NAME,
          isDirectory: false,
          type: "epub",
          status: "active",
          uuid: BOOK_UUID,
          modifiedAt: 1,
        },
      },
      libraryState: "loaded",
    } as never);

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/sync/v2/snapshot")) {
        if (url.includes(encodeURIComponent(SYNC_KEY))) {
          // Local orphan UUID has no cloud blob (tombstoned / never uploaded).
          return Response.json({ ok: true, seq: 9, entries: {} });
        }
        if (url.includes(encodeURIComponent(remoteFilesKey))) {
          return Response.json({
            ok: true,
            seq: 9,
            entries: {
              [remoteFilesKey]: {
                v: {
                  path: BOOK_PATH,
                  name: BOOK_NAME,
                  isDirectory: false,
                  type: "epub",
                  status: "active",
                  uuid: BOOK_UUID_REMOTE,
                  modifiedAt: 2,
                },
                t: `${t}-remote-files`,
                seq: 8,
              },
            },
          });
        }
        if (url.includes(encodeURIComponent(remoteBlobKey))) {
          return Response.json({
            ok: true,
            seq: 9,
            entries: {
              [remoteBlobKey]: {
                v: {
                  blob: {
                    url: "https://example.test/book.gz",
                    size: compressed.byteLength,
                    sha256: digest,
                  },
                },
                t: `${t}-remote-blob`,
                seq: 9,
              },
            },
          });
        }
        return Response.json({ ok: true, seq: 9, entries: {} });
      }
      if (url.includes("example.test/book.gz")) {
        return new Response(new Blob([compressed]), {
          status: 200,
          headers: { "content-length": String(compressed.byteLength) },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    const engine = await CloudSyncEngine.create(
      `blob-repair-path-${crypto.randomUUID()}`
    );
    try {
      const ok = await engine.ensureBlobItemLocal("books", BOOK_UUID, {
        path: BOOK_PATH,
      });
      expect(ok).toBe(true);
      expect(useFilesStore.getState().items[BOOK_PATH]?.uuid).toBe(
        BOOK_UUID_REMOTE
      );
      const restored = await dbOperations.get<{ content: ArrayBuffer }>(
        STORES.BOOKS,
        BOOK_UUID_REMOTE
      );
      expect(new TextDecoder().decode(restored!.content)).toBe("replacement");
    } finally {
      await engine.stop();
    }
  });
});

describe("files store orphan UUID rotation", () => {
  test("addItem keeps an explicitly rotated content UUID on update", () => {
    useFilesStore.setState({
      items: {
        "/Books": {
          path: "/Books",
          name: "Books",
          isDirectory: true,
          type: "directory",
          status: "active",
          createdAt: 1,
          modifiedAt: 1,
        },
        [BOOK_PATH]: {
          path: BOOK_PATH,
          name: BOOK_NAME,
          isDirectory: false,
          type: "epub",
          status: "active",
          uuid: BOOK_UUID,
          createdAt: 1,
          modifiedAt: 1,
        },
      },
      libraryState: "loaded",
    } as never);

    useFilesStore.getState().addItem({
      path: BOOK_PATH,
      name: BOOK_NAME,
      isDirectory: false,
      type: "epub",
      status: "active",
      uuid: BOOK_UUID_REMOTE,
      modifiedAt: 2,
    });

    expect(useFilesStore.getState().items[BOOK_PATH]?.uuid).toBe(
      BOOK_UUID_REMOTE
    );
    expect(useFilesStore.getState().items[BOOK_PATH]?.createdAt).toBe(1);
  });
});
