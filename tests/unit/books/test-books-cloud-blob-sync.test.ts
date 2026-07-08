import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import "fake-indexeddb/auto";
import type { IndexedDBStoreItemWithKey } from "../../../src/utils/indexedDBBackup";

const originalLocalStorage = globalThis.localStorage;
const localStorageMap = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value:
    originalLocalStorage ??
    ({
      getItem: (key: string) => localStorageMap.get(key) ?? null,
      setItem: (key: string, value: string) => {
        localStorageMap.set(key, value);
      },
      removeItem: (key: string) => {
        localStorageMap.delete(key);
      },
    } satisfies Pick<Storage, "getItem" | "setItem" | "removeItem">),
  writable: true,
});

const { SYNC_CODECS, isBlobCodec } = await import("../../../src/sync/codecs");
const { STORES, dbOperations, ensureIndexedDBInitialized } = await import(
  "../../../src/utils/indexedDB"
);

async function deleteRyOsDatabase(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("ryOS");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

describe("Books cloud blob sync", () => {
  beforeEach(async () => {
    await deleteRyOsDatabase();
  });

  afterAll(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: originalLocalStorage,
      writable: true,
    });
  });

  test("uploads local ArrayBuffer EPUB content as a file blob payload", async () => {
    const uuid = "book-uuid";
    const epubHeader = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);

    await dbOperations.put(
      STORES.BOOKS,
      {
        name: "synced-book.epub",
        content: epubHeader.buffer,
      },
      uuid
    );

    const db = await ensureIndexedDBInitialized();
    const docs = await SYNC_CODECS.books.collect({ db });
    db.close();

    const item = docs.get(`books/item:${uuid}`) as IndexedDBStoreItemWithKey;
    const uploaded = JSON.parse(JSON.stringify(item)) as IndexedDBStoreItemWithKey;

    expect(typeof uploaded.value.content).toBe("string");
    expect(
      (uploaded.value.content as string).startsWith(
        "data:application/epub+zip;base64,"
      )
    ).toBe(true);
    expect(uploaded.value._isBlob_content).toBe(true);
    expect(uploaded.value._isArrayBuffer_content).toBeUndefined();
  });

  test("stores downloaded EPUB blob payloads as ArrayBuffer for Safari", async () => {
    const codec = SYNC_CODECS.books;
    expect(isBlobCodec(codec)).toBe(true);
    if (!isBlobCodec(codec)) return;

    const uuid = "book-uuid";
    const epubHeader = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
    const remoteItem: IndexedDBStoreItemWithKey = {
      key: uuid,
      value: {
        name: "synced-book.epub",
        content: `data:application/epub+zip;base64,${bytesToBase64(epubHeader)}`,
        _isBlob_content: true,
      },
    };

    const db = await ensureIndexedDBInitialized();
    await codec.putItems([remoteItem], { db });
    db.close();

    const stored = await dbOperations.get<{ content: unknown }>(STORES.BOOKS, uuid);
    expect(stored?.content).toBeInstanceOf(ArrayBuffer);
    expect(Array.from(new Uint8Array(stored!.content as ArrayBuffer))).toEqual(
      Array.from(epubHeader)
    );
  });

  test("collects only explicitly dirty book keys", async () => {
    await dbOperations.put(
      STORES.BOOKS,
      { name: "a.epub", content: new Uint8Array([1]).buffer },
      "book-a"
    );
    await dbOperations.put(
      STORES.BOOKS,
      { name: "b.epub", content: new Uint8Array([2]).buffer },
      "book-b"
    );

    const db = await ensureIndexedDBInitialized();
    const docs = await SYNC_CODECS.books.collect(
      { db },
      new Set(["books/item:book-b"])
    );
    db.close();

    expect([...docs.keys()]).toEqual(["books/item:book-b"]);
  });
});
