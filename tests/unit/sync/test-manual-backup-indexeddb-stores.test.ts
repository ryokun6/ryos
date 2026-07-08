import { describe, expect, test } from "bun:test";
import {
  ensureIndexedDBInitialized,
  STORES,
} from "../../../src/utils/indexedDB";
import {
  createEmptyManualBackupIndexedDBData,
  MANUAL_BACKUP_INDEXEDDB_STORES,
  MANUAL_BACKUP_VERSION,
  readStoreItems,
  restoreStoreItems,
  restoreStoreItemsAtomically,
  serializeStoreItems,
} from "../../../src/utils/indexedDBBackup";

describe("manual IndexedDB backup manifest", () => {
  test("includes user data and persisted Zustand slices", () => {
    expect(MANUAL_BACKUP_VERSION).toBe(6);
    expect(MANUAL_BACKUP_INDEXEDDB_STORES).toContain(STORES.DOCUMENTS);
    expect(MANUAL_BACKUP_INDEXEDDB_STORES).toContain(STORES.IMAGES);
    expect(MANUAL_BACKUP_INDEXEDDB_STORES).toContain(STORES.BOOKS);
    expect(MANUAL_BACKUP_INDEXEDDB_STORES).toContain(
      STORES.BOOK_THUMBNAILS
    );
    expect(MANUAL_BACKUP_INDEXEDDB_STORES).toContain(STORES.APPLETS);
    expect(MANUAL_BACKUP_INDEXEDDB_STORES).toContain(STORES.PERSISTED_STATE);
    expect(MANUAL_BACKUP_INDEXEDDB_STORES).toContain(
      STORES.SOUNDBOARD_AUDIO
    );
    expect(MANUAL_BACKUP_INDEXEDDB_STORES).toContain(
      STORES.CHATS_AI_MESSAGES
    );
    expect(MANUAL_BACKUP_INDEXEDDB_STORES).toContain(
      STORES.CHATS_ROOM_MESSAGES
    );
    expect(MANUAL_BACKUP_INDEXEDDB_STORES).toContain(
      STORES.TEXTEDIT_INSTANCES
    );
    expect(MANUAL_BACKUP_INDEXEDDB_STORES).toContain(STORES.VFS_ITEMS);
  });

  test("excludes rebuildable caches and Sync v2 metadata", () => {
    const includedStores: readonly string[] = MANUAL_BACKUP_INDEXEDDB_STORES;
    expect(includedStores).not.toContain(STORES.APPLE_MUSIC_LIBRARY);
    expect(includedStores).not.toContain(STORES.APPLE_MUSIC_PLAYLISTS);
    expect(includedStores).not.toContain(
      STORES.APPLE_MUSIC_PLAYLIST_TRACKS
    );
    expect(includedStores).not.toContain(STORES.SYNC2_STATE);
  });

  test("creates an empty entry for every manifest store", () => {
    const data = createEmptyManualBackupIndexedDBData();
    expect(Object.keys(data).sort()).toEqual(
      [...MANUAL_BACKUP_INDEXEDDB_STORES].sort()
    );
    expect(
      MANUAL_BACKUP_INDEXEDDB_STORES.every(
        (storeName) => data[storeName].length === 0
      )
    ).toBe(true);
  });

  test("round-trips EPUB blobs through the backup serializer", async () => {
    const db = await ensureIndexedDBInitialized();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORES.BOOKS, "readwrite");
        transaction.objectStore(STORES.BOOKS).put(
          {
            uuid: "book-1",
            content: new TextEncoder().encode("epub bytes").buffer,
          },
          "book-1"
        );
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });

      const serialized = await serializeStoreItems(
        await readStoreItems(db, STORES.BOOKS)
      );
      await restoreStoreItems(db, STORES.BOOKS, serialized);
      const restored = (await readStoreItems(db, STORES.BOOKS)).find(
        (item) => item.key === "book-1"
      );

      expect(restored?.value.content).toBeInstanceOf(ArrayBuffer);
      expect(
        new TextDecoder().decode(restored?.value.content as ArrayBuffer)
      ).toBe("epub bytes");
    } finally {
      db.close();
    }
  });

  test("rolls back every store when an atomic restore fails", async () => {
    const db = await ensureIndexedDBInitialized();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORES.DOCUMENTS, "readwrite");
        transaction
          .objectStore(STORES.DOCUMENTS)
          .put({ content: "original" }, "atomic-doc");
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });

      await expect(
        restoreStoreItemsAtomically(db, [
          {
            storeName: STORES.DOCUMENTS,
            items: [{ key: "atomic-doc", value: { content: "replacement" } }],
          },
          {
            storeName: STORES.BOOKS,
            items: [
              {
                key: "uncloneable",
                value: { callback: () => undefined },
              },
            ],
          },
        ])
      ).rejects.toBeInstanceOf(DOMException);

      const restored = (await readStoreItems(db, STORES.DOCUMENTS)).find(
        (item) => item.key === "atomic-doc"
      );
      expect(restored?.value.content).toBe("original");
    } finally {
      db.close();
    }
  });
});
