import { beforeEach, describe, expect, test } from "bun:test";
import { installTestLocalStorage } from "./setup";
import {
  resetPersistWritesForTests,
  settleAllPersistWrites,
} from "../src/utils/persistWriteQueue";

const LOCAL_STORAGE_QUOTA = 5 * 1024 * 1024;

class QuotaStorage implements Storage {
  private readonly map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    const nextSize =
      Array.from(this.map.entries()).reduce(
        (size, [storedKey, storedValue]) =>
          size + (storedKey === key ? 0 : storedValue.length),
        0
      ) + value.length;
    if (nextSize > LOCAL_STORAGE_QUOTA) {
      throw new DOMException("Storage quota exceeded", "QuotaExceededError");
    }
    this.map.set(key, value);
  }
}

const { ensureIndexedDBInitialized, STORES } = await import(
  "../src/utils/indexedDB"
);
const { useTextEditStore } = await import("../src/stores/useTextEditStore");
const { useStickiesStore } = await import("../src/stores/useStickiesStore");
const { useContactsStore } = await import("../src/stores/useContactsStore");

const stores = [useTextEditStore, useStickiesStore, useContactsStore];

await Promise.all(stores.map((store) => store.persist.rehydrate()));
await settleAllPersistWrites();

const resetDb = () =>
  new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase("ryOS");
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });

async function readPersistedRecord(key: string): Promise<unknown> {
  const db = await ensureIndexedDBInitialized();
  try {
    return await new Promise((resolve, reject) => {
      const request = db
        .transaction(STORES.PERSISTED_STATE, "readonly")
        .objectStore(STORES.PERSISTED_STATE)
        .get(key);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

beforeEach(async () => {
  await settleAllPersistWrites();
  resetPersistWritesForTests();
  await resetDb();
  installTestLocalStorage(new QuotaStorage());
  useTextEditStore.setState({ instances: {} });
  useStickiesStore.setState({ notes: [] });
  useContactsStore.setState({
    contacts: [],
    selectedContactId: null,
    myContactId: null,
    lastRemoteSyncAt: 0,
  });
  resetPersistWritesForTests();
});

describe("large store IndexedDB persistence", () => {
  test("migrates each legacy localStorage slice on hydration", async () => {
    localStorage.setItem(
      "ryos:textedit",
      JSON.stringify({
        state: {
          instances: {
            draft: {
              instanceId: "draft",
              filePath: null,
              contentJson: { type: "doc", content: [] },
              hasUnsavedChanges: true,
            },
          },
        },
        version: 0,
      })
    );
    localStorage.setItem(
      "stickies-storage",
      JSON.stringify({
        state: {
          notes: [
            {
              id: "note",
              content: "Remember me",
              color: "yellow",
              position: { x: 10, y: 20 },
              size: { width: 220, height: 240 },
              createdAt: 1,
              updatedAt: 1,
            },
          ],
        },
        version: 0,
      })
    );
    localStorage.setItem(
      "contacts-storage",
      JSON.stringify({
        state: {
          contacts: [
            {
              id: "friend",
              firstName: "Ada",
              lastName: "Lovelace",
              createdAt: 1,
              updatedAt: 1,
            },
          ],
          selectedContactId: "friend",
          myContactId: null,
          lastRemoteSyncAt: 0,
        },
        version: 0,
      })
    );

    await Promise.all(stores.map((store) => store.persist.rehydrate()));

    expect(useTextEditStore.getState().instances.draft).toBeDefined();
    expect(useStickiesStore.getState().notes[0]?.content).toBe("Remember me");
    expect(
      useContactsStore.getState().contacts.some((contact) => contact.id === "friend")
    ).toBe(true);
    expect(localStorage.getItem("ryos:textedit")).toBeNull();
    expect(localStorage.getItem("stickies-storage")).toBeNull();
    expect(localStorage.getItem("contacts-storage")).toBeNull();
  });

  test("persists document-sized payloads without consuming localStorage quota", async () => {
    const largeText = "x".repeat(3 * 1024 * 1024);
    useTextEditStore.setState({
      instances: {
        draft: {
          instanceId: "draft",
          filePath: null,
          contentJson: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: largeText }],
              },
            ],
          },
          hasUnsavedChanges: true,
        },
      },
    });
    useStickiesStore.setState({
      notes: [
        {
          id: "large-note",
          content: largeText,
          color: "yellow",
          position: { x: 10, y: 20 },
          size: { width: 220, height: 240 },
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });

    await settleAllPersistWrites();

    expect(await readPersistedRecord("ryos:textedit")).not.toBeNull();
    expect(await readPersistedRecord("stickies-storage")).not.toBeNull();
    expect(localStorage.getItem("ryos:textedit")).toBeNull();
    expect(localStorage.getItem("stickies-storage")).toBeNull();
  });
});
