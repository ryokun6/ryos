import "fake-indexeddb/auto";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { ensureIndexedDBInitialized, STORES } from "../src/utils/indexedDB";
import {
  createSplitIndexedDBPersistStorage,
  type SplitPersistSnapshot,
} from "../src/utils/splitIndexedDBPersistStorage";
import {
  advancePersistEpoch,
  resetPersistWritesForTests,
  settleAllPersistWrites,
} from "../src/utils/persistWriteQueue";
import { installTestLocalStorage } from "./setup";

interface TestEntity {
  id: string;
  value: string;
}

interface TestState {
  label: string;
  items: Record<string, TestEntity>;
}

const resetDb = () =>
  new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase("ryOS");
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });

const splitState = (
  state: TestState
): SplitPersistSnapshot<TestState> => ({
  metadata: { ...state, items: {} },
  rows: {
    [STORES.TEXTEDIT_INSTANCES]: Object.entries(state.items).map(
      ([key, item]) => ({
        key,
        value: { item },
        revision: item,
      })
    ),
  },
});

const mergeState = (
  metadata: TestState,
  rows: Readonly<
    Record<
      string,
      readonly { key: string; value: Record<string, unknown> }[]
    >
  >
): TestState => ({
  ...metadata,
  items: Object.fromEntries(
    (rows[STORES.TEXTEDIT_INSTANCES] ?? []).flatMap((row) => {
      const item = row.value.item;
      return item && typeof item === "object"
        ? [[row.key, item as TestEntity]]
        : [];
    })
  ),
});

const createStorage = () =>
  createSplitIndexedDBPersistStorage<TestState>({
    stores: [STORES.TEXTEDIT_INSTANCES],
    layoutVersion: 1,
    persistVersion: 1,
    delayMs: 5,
    split: splitState,
    merge: mergeState,
  });

beforeEach(async () => {
  resetPersistWritesForTests();
  installTestLocalStorage();
  localStorage.clear();
  await resetDb();
});

afterEach(() => {
  resetPersistWritesForTests();
});

describe("createSplitIndexedDBPersistStorage", () => {
  test("atomically migrates an inline legacy snapshot into entity rows", async () => {
    localStorage.setItem(
      "ryos:test-split",
      JSON.stringify({
        state: {
          label: "legacy",
          items: { a: { id: "a", value: "one" } },
        },
        version: 1,
      })
    );

    const value = await createStorage().getItem("ryos:test-split");
    expect(value).toEqual({
      state: {
        label: "legacy",
        items: { a: { id: "a", value: "one" } },
      },
      version: 1,
    });
    expect(localStorage.getItem("ryos:test-split")).toBeNull();

    const db = await ensureIndexedDBInitialized();
    try {
      const metadata = await new Promise<Record<string, unknown>>(
        (resolve, reject) => {
          const request = db
            .transaction(STORES.PERSISTED_STATE, "readonly")
            .objectStore(STORES.PERSISTED_STATE)
            .get("ryos:test-split");
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        }
      );
      const row = await new Promise<Record<string, unknown>>(
        (resolve, reject) => {
          const request = db
            .transaction(STORES.TEXTEDIT_INSTANCES, "readonly")
            .objectStore(STORES.TEXTEDIT_INSTANCES)
            .get("a");
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        }
      );

      expect(metadata.__ryosSplitLayout).toMatchObject({ version: 1 });
      expect(metadata.state).toEqual({ label: "legacy", items: {} });
      expect(row.item).toEqual({ id: "a", value: "one" });
    } finally {
      db.close();
    }
  });

  test("updates and deletes individual entity rows", async () => {
    const storage = createStorage();
    const entityA = { id: "a", value: "one" };
    const entityB = { id: "b", value: "two" };
    storage.setItem("ryos:test-split", {
      state: { label: "initial", items: { a: entityA, b: entityB } },
      version: 1,
    });
    await settleAllPersistWrites();

    storage.setItem("ryos:test-split", {
      state: {
        label: "updated",
        items: { b: { ...entityB, value: "changed" } },
      },
      version: 1,
    });
    await settleAllPersistWrites();

    const fresh = createStorage();
    expect(await fresh.getItem("ryos:test-split")).toEqual({
      state: {
        label: "updated",
        items: { b: { id: "b", value: "changed" } },
      },
      version: 1,
    });
  });

  test("removeItem clears metadata and owned entity stores", async () => {
    const storage = createStorage();
    storage.setItem("ryos:test-split", {
      state: {
        label: "remove",
        items: { a: { id: "a", value: "one" } },
      },
      version: 1,
    });
    await settleAllPersistWrites();
    await storage.removeItem("ryos:test-split");

    expect(await createStorage().getItem("ryos:test-split")).toBeNull();
    const db = await ensureIndexedDBInitialized();
    try {
      const count = await new Promise<number>((resolve, reject) => {
        const request = db
          .transaction(STORES.TEXTEDIT_INSTANCES, "readonly")
          .objectStore(STORES.TEXTEDIT_INSTANCES)
          .count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      expect(count).toBe(0);
    } finally {
      db.close();
    }
  });

  test("replaces stale entity baselines after another adapter commits", async () => {
    const seed = createStorage();
    seed.setItem("ryos:test-split", {
      state: {
        label: "seed",
        items: { a: { id: "a", value: "one" } },
      },
      version: 1,
    });
    await settleAllPersistWrites();

    const tabA = createStorage();
    const tabB = createStorage();
    const stateA = await tabA.getItem("ryos:test-split");
    const stateB = await tabB.getItem("ryos:test-split");
    expect(stateA?.state.items.a.value).toBe("one");
    expect(stateB?.state.items.a.value).toBe("one");

    tabB.setItem("ryos:test-split", {
      state: {
        label: "tab-b",
        items: {
          a: { id: "a", value: "one" },
          b: { id: "b", value: "from-b" },
        },
      },
      version: 1,
    });
    await settleAllPersistWrites();

    tabA.setItem("ryos:test-split", {
      state: {
        label: "tab-a",
        items: { a: { id: "a", value: "from-a" } },
      },
      version: 1,
    });
    await settleAllPersistWrites();

    expect(await createStorage().getItem("ryos:test-split")).toEqual({
      state: {
        label: "tab-a",
        items: { a: { id: "a", value: "from-a" } },
      },
      version: 1,
    });
  });

  test("drops snapshots queued while asynchronous hydration is in flight", async () => {
    const seed = createStorage();
    seed.setItem("ryos:test-split", {
      state: {
        label: "saved",
        items: { a: { id: "a", value: "saved" } },
      },
      version: 1,
    });
    await settleAllPersistWrites();

    const fresh = createStorage();
    const hydration = fresh.getItem("ryos:test-split");
    fresh.setItem("ryos:test-split", {
      state: { label: "default", items: {} },
      version: 1,
    });
    expect((await hydration)?.state.label).toBe("saved");
    await settleAllPersistWrites();
    expect((await createStorage().getItem("ryos:test-split"))?.state.label).toBe(
      "saved"
    );
  });

  test("epoch invalidation preserves legacy localStorage during migration", async () => {
    localStorage.setItem(
      "ryos:test-split",
      JSON.stringify({
        state: {
          label: "legacy",
          items: { a: { id: "a", value: "one" } },
        },
        version: 1,
      })
    );
    const stale = createStorage();
    const hydration = stale.getItem("ryos:test-split");
    advancePersistEpoch();
    expect((await hydration)?.state.label).toBe("legacy");
    expect(localStorage.getItem("ryos:test-split")).not.toBeNull();
  });
});
