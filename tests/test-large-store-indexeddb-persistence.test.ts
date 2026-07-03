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
const { useBooksStore } = await import("../src/stores/useBooksStore");
const { useCalendarStore } = await import("../src/stores/useCalendarStore");
const { useVideoStore } = await import("../src/stores/useVideoStore");
const { useTvStore } = await import("../src/stores/useTvStore");

const stores = [
  useTextEditStore,
  useStickiesStore,
  useContactsStore,
  useBooksStore,
  useCalendarStore,
  useVideoStore,
  useTvStore,
];

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
  useBooksStore.setState({
    progressByPath: {},
    highlightsByPath: {},
    bookmarksByPath: {},
  });
  useCalendarStore.setState({ events: [], todos: [] });
  useVideoStore.setState({ videos: [], currentVideoId: null });
  useTvStore.setState({ customChannels: [], hiddenDefaultChannelIds: [] });
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
              displayName: "Ada Lovelace",
              firstName: "Ada",
              lastName: "Lovelace",
              nickname: "",
              organization: "",
              title: "",
              notes: "",
              emails: [],
              phones: [],
              addresses: [],
              urls: [],
              birthday: null,
              telegramUsername: "",
              telegramUserId: "",
              picture: null,
              source: "manual",
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
    localStorage.setItem(
      "ryos:books",
      JSON.stringify({
        state: {
          progressByPath: {
            "/Books/migrated.epub": {
              cfi: "epubcfi(/6/2)",
              percentage: 0.5,
              updatedAt: 1,
            },
          },
          highlightsByPath: {},
          bookmarksByPath: {},
        },
        version: 9,
      })
    );
    localStorage.setItem(
      "calendar-storage",
      JSON.stringify({
        state: {
          events: [
            {
              id: "migrated-event",
              title: "Migrated event",
              date: "2026-07-03",
              color: "blue",
              calendarId: "home",
              createdAt: 1,
              updatedAt: 1,
            },
          ],
          calendars: [],
          todos: [],
        },
        version: 0,
      })
    );
    localStorage.setItem(
      "ryos:videos",
      JSON.stringify({
        state: {
          videos: [
            {
              id: "migrated-video",
              url: "https://youtu.be/migrated-video",
              title: "Migrated video",
              artist: "ryOS",
            },
          ],
          currentVideoId: "migrated-video",
          loopAll: true,
          loopCurrent: false,
          isShuffled: false,
        },
        version: 8,
      })
    );
    localStorage.setItem(
      "ryos:tv",
      JSON.stringify({
        state: {
          currentChannelId: "migrated-channel",
          customChannels: [
            {
              id: "migrated-channel",
              name: "Migrated channel",
              videos: [],
              createdAt: 1,
            },
          ],
          hiddenDefaultChannelIds: [],
          hiddenDefaultChannelIdsUpdatedAt: null,
          hiddenDefaultChannelIdsResetAt: null,
          lcdFilterOn: true,
          closedCaptionsOn: false,
        },
        version: 5,
      })
    );

    await Promise.all(stores.map((store) => store.persist.rehydrate()));

    expect(useTextEditStore.getState().instances.draft).toBeDefined();
    expect(useStickiesStore.getState().notes[0]?.content).toBe("Remember me");
    expect(
      useContactsStore.getState().contacts.some((contact) => contact.id === "friend")
    ).toBe(true);
    expect(
      useBooksStore.getState().progressByPath["/Books/migrated.epub"]?.percentage
    ).toBe(0.5);
    expect(useCalendarStore.getState().events[0]?.id).toBe("migrated-event");
    expect(useVideoStore.getState().videos[0]?.id).toBe("migrated-video");
    expect(useTvStore.getState().customChannels[0]?.id).toBe(
      "migrated-channel"
    );
    for (const key of [
      "ryos:textedit",
      "stickies-storage",
      "contacts-storage",
      "ryos:books",
      "calendar-storage",
      "ryos:videos",
      "ryos:tv",
    ]) {
      expect(localStorage.getItem(key)).toBeNull();
      expect(await readPersistedRecord(key)).not.toBeNull();
    }
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
