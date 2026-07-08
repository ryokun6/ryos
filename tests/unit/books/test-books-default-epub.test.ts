import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import "fake-indexeddb/auto";

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

const { readBookBlobContent } = await import(
  "../../../src/services/vfs/FileContentRepository"
);
const { useFilesStore } = await import("../../../src/stores/useFilesStore");
const { dbOperations, STORES } = await import("../../../src/utils/indexedDB");
const { ensureFileContentLoaded } = await import("../../../src/stores/useFilesStore");

const BOOK_PATH = "/Books/Meditations - Marcus Aurelius.epub";
const BOOK_ASSET_PATH = "/assets/books/meditations-marcus-aurelius.epub";
const originalFetch = globalThis.fetch;
let bookAssetFetchCount = 0;

const filesystemJson = readFileSync("public/data/filesystem.json", "utf8");
const meditationsEpub = readFileSync(
  "public/assets/books/meditations-marcus-aurelius.epub"
);

async function deleteRyOsDatabase(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("ryOS");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

beforeEach(async () => {
  bookAssetFetchCount = 0;
  await deleteRyOsDatabase();
  useFilesStore.setState({
    items: {},
    libraryState: "uninitialized",
  });

  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === "/data/filesystem.json") {
        return new Response(filesystemJson, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url === BOOK_ASSET_PATH) {
        bookAssetFetchCount += 1;
        return new Response(meditationsEpub, {
          status: 200,
          headers: { "Content-Type": "application/epub+zip" },
        });
      }
      return originalFetch(input);
    },
  });
});

afterAll(() => {
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: originalFetch,
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: originalLocalStorage,
    writable: true,
  });
});

describe("default Books EPUB", () => {
  test("seeds Meditations and lazy-loads its EPUB bytes through the VFS", async () => {
    await useFilesStore.getState().resetLibrary();

    const item = useFilesStore.getState().getItem(BOOK_PATH);
    expect(item).toMatchObject({
      path: BOOK_PATH,
      name: "Meditations - Marcus Aurelius.epub",
      type: "epub",
      icon: "/icons/default/books.png",
      size: meditationsEpub.byteLength,
      status: "active",
    });
    expect(item?.uuid).toBeTruthy();

    const blob = await readBookBlobContent(BOOK_PATH);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob?.type).toBe("application/epub+zip");

    const bytes = new Uint8Array(await blob!.arrayBuffer(), 0, 4);
    expect(Array.from(bytes)).toEqual([0x50, 0x4b, 0x03, 0x04]);

    const stored = await dbOperations.get<{ content: unknown }>(
      STORES.BOOKS,
      item!.uuid!
    );
    expect(stored?.content).toBeInstanceOf(ArrayBuffer);
    expect(bookAssetFetchCount).toBe(1);
  });

  test("reuses cached default EPUB bytes across repeated reads", async () => {
    await useFilesStore.getState().resetLibrary();

    const item = useFilesStore.getState().getItem(BOOK_PATH);
    expect(item?.uuid).toBeTruthy();

    await dbOperations.delete(STORES.BOOKS, item!.uuid!);

    const first = await readBookBlobContent(BOOK_PATH);
    const second = await readBookBlobContent(BOOK_PATH);

    expect(first?.size).toBe(meditationsEpub.byteLength);
    expect(second?.size).toBe(meditationsEpub.byteLength);
    expect(bookAssetFetchCount).toBe(1);
  });

  test("force-reloads default EPUB bytes over an unreadable stored record", async () => {
    await useFilesStore.getState().resetLibrary();
    const item = useFilesStore.getState().getItem(BOOK_PATH);
    expect(item?.uuid).toBeTruthy();

    await dbOperations.put(
      STORES.BOOKS,
      { name: item!.name, content: new Blob(["bad"]) },
      item!.uuid!
    );

    await ensureFileContentLoaded(BOOK_PATH, item!.uuid!, { forceReload: true });
    const stored = await dbOperations.get<{ content: unknown }>(
      STORES.BOOKS,
      item!.uuid!
    );
    expect(stored?.content).toBeInstanceOf(ArrayBuffer);
  });
});
