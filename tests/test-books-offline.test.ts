import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import "fake-indexeddb/auto";

const ROOT = path.resolve(import.meta.dir, "..");

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
  "../src/services/vfs/FileContentRepository"
);
const {
  useFilesStore,
  ensureFileContentLoaded,
  warmPendingBookContent,
  clearWarmedBookPaths,
} = await import("../src/stores/useFilesStore");
const { dbOperations, STORES } = await import("../src/utils/indexedDB");

const BOOK_PATH = "/Books/Meditations - Marcus Aurelius.epub";
const BOOK_ASSET_PATH = "/assets/books/meditations-marcus-aurelius.epub";
const originalFetch = globalThis.fetch;
const originalNavigator = globalThis.navigator;
let bookAssetFetchCount = 0;
let networkAvailable = true;

const filesystemJson = readFileSync("public/data/filesystem.json", "utf8");
const meditationsEpub = readFileSync(
  "public/assets/books/meditations-marcus-aurelius.epub"
);

function setNavigatorOnLine(onLine: boolean): void {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { ...originalNavigator, onLine },
    writable: true,
  });
}

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
  networkAvailable = true;
  setNavigatorOnLine(true);
  clearWarmedBookPaths();
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
        if (!networkAvailable) {
          throw new TypeError("Failed to fetch");
        }
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
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: originalNavigator,
    writable: true,
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: originalLocalStorage,
    writable: true,
  });
});

describe("Books offline behavior", () => {
  test("cached EPUB bytes stay readable while offline", async () => {
    await useFilesStore.getState().resetLibrary();

    // Cache the book bytes while "online".
    const online = await readBookBlobContent(BOOK_PATH);
    expect(online).toBeInstanceOf(Blob);
    expect(bookAssetFetchCount).toBe(1);

    // Go offline — the cached bytes must be served from IndexedDB without
    // any network access.
    setNavigatorOnLine(false);
    networkAvailable = false;

    const offline = await readBookBlobContent(BOOK_PATH);
    expect(offline).toBeInstanceOf(Blob);
    expect(offline?.size).toBe(meditationsEpub.byteLength);
    expect(bookAssetFetchCount).toBe(1);
  });

  test("ensureFileContentLoaded fails fast offline instead of fetching", async () => {
    await useFilesStore.getState().resetLibrary();
    const item = useFilesStore.getState().getItem(BOOK_PATH);
    expect(item?.uuid).toBeTruthy();

    setNavigatorOnLine(false);
    networkAvailable = false;

    const loaded = await ensureFileContentLoaded(BOOK_PATH, item!.uuid!);
    expect(loaded).toBe(false);
    expect(bookAssetFetchCount).toBe(0);
  });

  test("warmPendingBookContent caches default book bytes without opening the book", async () => {
    await useFilesStore.getState().resetLibrary();
    const item = useFilesStore.getState().getItem(BOOK_PATH);
    expect(item?.uuid).toBeTruthy();

    await warmPendingBookContent();

    const stored = await dbOperations.get<{ content: unknown }>(
      STORES.BOOKS,
      item!.uuid!
    );
    expect(stored?.content).toBeInstanceOf(ArrayBuffer);
    expect(bookAssetFetchCount).toBe(1);

    // Warmed bytes remain readable offline.
    setNavigatorOnLine(false);
    networkAvailable = false;
    const blob = await readBookBlobContent(BOOK_PATH);
    expect(blob?.size).toBe(meditationsEpub.byteLength);
    expect(bookAssetFetchCount).toBe(1);
  });

  test("warmPendingBookContent is a no-op while offline", async () => {
    await useFilesStore.getState().resetLibrary();

    setNavigatorOnLine(false);
    await warmPendingBookContent();
    expect(bookAssetFetchCount).toBe(0);
  });

  test("warmup runs once per book, not on every boot", async () => {
    await useFilesStore.getState().resetLibrary();
    const item = useFilesStore.getState().getItem(BOOK_PATH);
    expect(item?.uuid).toBeTruthy();

    await warmPendingBookContent();
    expect(bookAssetFetchCount).toBe(1);

    // Repeated warmups (e.g. later boots) must not re-download the book,
    // even if the stored bytes were dropped in the meantime.
    await warmPendingBookContent();
    await dbOperations.delete(STORES.BOOKS, item!.uuid!);
    await warmPendingBookContent();
    expect(bookAssetFetchCount).toBe(1);

    // The reader's recovery path (forceReload) still restores the bytes.
    const recovered = await ensureFileContentLoaded(BOOK_PATH, item!.uuid!, {
      forceReload: true,
    });
    expect(recovered).toBe(true);
    expect(bookAssetFetchCount).toBe(2);
    const blob = await readBookBlobContent(BOOK_PATH);
    expect(blob?.size).toBe(meditationsEpub.byteLength);
  });

  test("resetLibrary clears the warmed marker so defaults re-warm", async () => {
    await useFilesStore.getState().resetLibrary();
    await warmPendingBookContent();
    expect(bookAssetFetchCount).toBe(1);

    // Reset regenerates file UUIDs, orphaning the warmed bytes.
    await useFilesStore.getState().resetLibrary();
    await warmPendingBookContent();
    expect(bookAssetFetchCount).toBe(2);
  });
});

describe("offline caching config", () => {
  test("service worker runtime-caches bundled EPUB assets", () => {
    const config = readFileSync(path.join(ROOT, "vite.config.ts"), "utf8");
    expect(config).toContain("assets\\/books\\/.+\\.epub");
    expect(config).toContain('cacheName: "books-assets"');
  });

  test("stale-bundle recovery verifies reachability before nuking caches", () => {
    const indexHtml = readFileSync(path.join(ROOT, "index.html"), "utf8");
    expect(indexHtml).toContain("probeServerReachable");
    expect(indexHtml).toContain(
      "Offline - skipping stale-bundle recovery"
    );

    const mainSource = readFileSync(path.join(ROOT, "src/main.tsx"), "utf8");
    expect(mainSource).toContain("verifyServerReachable");
  });
});
