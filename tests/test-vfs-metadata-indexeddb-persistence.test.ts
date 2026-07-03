import "fake-indexeddb/auto";
import { beforeEach, describe, expect, test } from "bun:test";
import { installTestLocalStorage } from "./setup";
import {
  resetPersistWritesForTests,
  settleAllPersistWrites,
} from "../src/utils/persistWriteQueue";

const resetDb = () =>
  new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase("ryOS");
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });

beforeEach(async () => {
  resetPersistWritesForTests();
  installTestLocalStorage();
  localStorage.clear();
  await resetDb();
});

describe("Files metadata normalized persistence", () => {
  test("migrates the items map into path-keyed VFS rows", async () => {
    const item = {
      path: "/Documents",
      name: "Documents",
      isDirectory: true,
      type: "directory",
      status: "active",
      createdAt: 1,
      modifiedAt: 1,
    };
    localStorage.setItem(
      "ryos:files",
      JSON.stringify({
        state: {
          items: { "/Documents": item },
          libraryState: "loaded",
        },
        version: 14,
      })
    );

    const { useFilesStore } = await import("../src/stores/useFilesStore");
    await useFilesStore.persist.rehydrate();
    expect(useFilesStore.getState().items["/Documents"]).toEqual(item);
    expect(localStorage.getItem("ryos:files")).toBeNull();

    const { ensureIndexedDBInitialized, STORES } = await import(
      "../src/utils/indexedDB"
    );
    const db = await ensureIndexedDBInitialized();
    try {
      const metadata = await new Promise<Record<string, unknown>>(
        (resolve, reject) => {
          const request = db
            .transaction(STORES.PERSISTED_STATE, "readonly")
            .objectStore(STORES.PERSISTED_STATE)
            .get("ryos:files");
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        }
      );
      const row = await new Promise<Record<string, unknown>>(
        (resolve, reject) => {
          const request = db
            .transaction(STORES.VFS_ITEMS, "readonly")
            .objectStore(STORES.VFS_ITEMS)
            .get("/Documents");
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        }
      );
      expect(metadata.state).toEqual({
        items: {},
        libraryState: "loaded",
      });
      expect(row.item).toEqual(item);
    } finally {
      db.close();
    }

    useFilesStore.getState().updateItemMetadata("/Documents", {
      name: "My Documents",
    });
    await settleAllPersistWrites();

    const verifyDb = await ensureIndexedDBInitialized();
    try {
      const updated = await new Promise<Record<string, unknown>>(
        (resolve, reject) => {
          const request = verifyDb
            .transaction(STORES.VFS_ITEMS, "readonly")
            .objectStore(STORES.VFS_ITEMS)
            .get("/Documents");
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        }
      );
      expect((updated.item as { name: string }).name).toBe("My Documents");
    } finally {
      verifyDb.close();
    }
  });
});
