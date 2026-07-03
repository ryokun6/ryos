import "fake-indexeddb/auto";
import "./local-storage-stub";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import {
  createCloudSyncEngine,
  destroyCloudSyncEngine,
} from "../src/sync/engine";
import { SyncClientState } from "../src/sync/state";
import {
  deletePersistedSyncState,
  loadPersistedSyncState,
} from "../src/sync/stateStorage";
import {
  ensureIndexedDBInitialized,
  STORES,
} from "../src/utils/indexedDB";
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

async function readStoredState(username: string): Promise<unknown> {
  const db = await ensureIndexedDBInitialized();
  try {
    return await new Promise((resolve, reject) => {
      const request = db
        .transaction(STORES.SYNC2_STATE, "readonly")
        .objectStore(STORES.SYNC2_STATE)
        .get(username.toLowerCase());
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

beforeEach(async () => {
  await destroyCloudSyncEngine();
  await settleAllPersistWrites();
  resetPersistWritesForTests();
  await resetDb();
  localStorage.clear();
});

afterEach(async () => {
  await destroyCloudSyncEngine();
  await settleAllPersistWrites();
});

describe("Sync v2 IndexedDB state storage", () => {
  test("migrates legacy localStorage state into the dedicated store", async () => {
    localStorage.setItem(
      "ryos:sync2:state:alice",
      JSON.stringify({
        cursor: 42,
        lastHlc: "01718180000000-0000-test",
        shadow: {
          "stickies/note:one": {
            t: "01718180000000-0000-test",
            h: "hash-one",
          },
        },
        dirty: ["stickies"],
        localReconcileRequired: true,
      })
    );

    const state = await loadPersistedSyncState("Alice");

    expect(state.cursor).toBe(42);
    expect(state.shadow["stickies/note:one"]?.h).toBe("hash-one");
    expect(state.dirty).toEqual(["stickies"]);
    expect(state.localReconcileRequired).toBe(true);
    expect(localStorage.getItem("ryos:sync2:state:alice")).toBeNull();
    expect(await readStoredState("alice")).toEqual(state);
  });

  test("settles queued shadow writes and keeps users isolated", async () => {
    const alice = await SyncClientState.open("Alice");
    alice.setCursor(7);
    alice.setShadow("stickies/note:alice", {
      t: "01718180000000-0000-alice",
      h: "alice-hash",
    });

    const bob = await SyncClientState.open("Bob");
    bob.setCursor(9);
    bob.setShadow("stickies/note:bob", {
      t: "01718180000000-0000-bob",
      h: "bob-hash",
    });

    await settleAllPersistWrites();

    const reloadedAlice = await SyncClientState.open("alice");
    const reloadedBob = await SyncClientState.open("bob");
    expect(reloadedAlice.cursor).toBe(7);
    expect(reloadedAlice.getShadow("stickies/note:alice")?.h).toBe(
      "alice-hash"
    );
    expect(reloadedAlice.getShadow("stickies/note:bob")).toBeNull();
    expect(reloadedBob.cursor).toBe(9);
    expect(reloadedBob.getShadow("stickies/note:bob")?.h).toBe("bob-hash");
    expect(
      [...Array.from({ length: localStorage.length }, (_, index) =>
        localStorage.key(index)
      )].filter((key) => key?.startsWith("ryos:sync2:state:"))
    ).toEqual([]);
  });

  test("engine teardown persists the inactive-period reconcile marker", async () => {
    await createCloudSyncEngine("reconcile-user");
    await destroyCloudSyncEngine({ markLocalReconcileRequired: true });

    const reloaded = await SyncClientState.open("reconcile-user");
    expect(reloaded.localReconcileRequired).toBe(true);
  });

  test("delete helper clears IndexedDB and any legacy fallback", async () => {
    const state = await SyncClientState.open("delete-user");
    state.setCursor(5);
    await state.persistNow();
    localStorage.setItem("ryos:sync2:state:delete-user", "{}");

    await deletePersistedSyncState("delete-user");

    expect(await readStoredState("delete-user")).toBeUndefined();
    expect(localStorage.getItem("ryos:sync2:state:delete-user")).toBeNull();
  });
});
