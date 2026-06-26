import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import "fake-indexeddb/auto";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { dbOperations, STORES } from "../src/utils/indexedDB";
import type { FileSystemItem } from "../src/stores/useFilesStore";

let activeParses = 0;
let maxActiveParses = 0;
let epubCreates = 0;

mock.module("epubjs", () => ({
  default: mock(() => {
    epubCreates += 1;
    activeParses += 1;
    maxActiveParses = Math.max(maxActiveParses, activeParses);
    const ready = new Promise<void>((resolve) => {
      setTimeout(() => {
        activeParses -= 1;
        resolve();
      }, 20);
    });
    return {
      ready,
      loaded: { metadata: Promise.resolve({ title: "T", creator: "A" }) },
      coverUrl: async () => null,
      destroy: () => {},
    };
  }),
}));

const { useBookCover } = await import("../src/apps/books/utils/useBookCover");
const { useFilesStore } = await import("../src/stores/useFilesStore");

const EPUB_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

function arrayBufferFromBytes(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  );
}

async function deleteRyOsDatabase(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("ryOS");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

async function seedBookContent(
  path: string,
  bytes: Uint8Array = EPUB_BYTES
): Promise<void> {
  const name = path.split("/").pop() ?? "book.epub";
  const uuid = `uuid:${path}`;
  const item: FileSystemItem = {
    path,
    name,
    isDirectory: false,
    type: "epub",
    uuid,
    size: bytes.byteLength,
    status: "active",
    createdAt: 1,
    modifiedAt: 1,
  };
  useFilesStore.setState((state) => ({
    items: {
      ...state.items,
      [path]: item,
    },
  }));
  await dbOperations.put(
    STORES.BOOKS,
    { name, content: arrayBufferFromBytes(bytes) },
    uuid
  );
}

function CoverProbe({
  path,
  onSnapshot,
}: {
  path: string;
  onSnapshot?: (snapshot: ReturnType<typeof useBookCover>) => void;
}) {
  const snapshot = useBookCover(path, 1);
  React.useEffect(() => {
    onSnapshot?.(snapshot);
  }, [onSnapshot, snapshot]);
  return null;
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 80; i += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for cover probes");
}

describe("Books cover loading queue", () => {
  let root: Root | null = null;

  beforeAll(() => {
    if (typeof document === "undefined") {
      GlobalRegistrator.register();
    }
  });

  beforeEach(async () => {
    activeParses = 0;
    maxActiveParses = 0;
    epubCreates = 0;
    await deleteRyOsDatabase();
    useFilesStore.setState({ items: {}, libraryState: "loaded" });
  });

  afterEach(async () => {
    root?.unmount();
    root = null;
    document.body.replaceChildren();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  afterAll(async () => {
    root?.unmount();
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (GlobalRegistrator.isRegistered) {
      GlobalRegistrator.unregister();
    }
  });

  test("serializes shelf EPUB cover reads to limit startup memory", async () => {
    const paths = Array.from(
      { length: 12 },
      (_, index) => `/Books/queued-book-${index}.epub`
    );
    await Promise.all(paths.map((path) => seedBookContent(path)));

    const host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    root.render(
      React.createElement(
        React.Fragment,
        null,
        paths.map((path) =>
          React.createElement(CoverProbe, {
            key: path,
            path,
          })
        )
      )
    );

    await waitFor(() => epubCreates === 12);

    expect(maxActiveParses).toBeLessThanOrEqual(1);

    const cached = await dbOperations.get<{ title?: string; author?: string }>(
      STORES.BOOK_THUMBNAILS,
      "/Books/queued-book-0.epub::1"
    );
    expect(cached).toMatchObject({ title: "T", author: "A" });
  });

  test("uses cached shelf thumbnail metadata without reading EPUB bytes", async () => {
    const path = "/Books/cached-thumbnail.epub";
    await dbOperations.put(
      STORES.BOOK_THUMBNAILS,
      {
        version: 1,
        title: "Cached title",
        author: "Cached author",
        coverBlob: null,
      },
      `${path}::1`
    );

    const host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    let latest: ReturnType<typeof useBookCover> | null = null;

    root.render(
      React.createElement(CoverProbe, {
        path,
        onSnapshot: (snapshot) => {
          latest = snapshot;
        },
      })
    );

    await waitFor(
      () => latest?.loading === false && latest.info?.title === "Cached title"
    );

    expect(latest?.info).toMatchObject({
      title: "Cached title",
      author: "Cached author",
    });
    expect(epubCreates).toBe(0);
  });

  test("does not parse invalid synced blobs as EPUB covers", async () => {
    const path = "/Books/invalid-synced-payload.epub";
    await seedBookContent(
      path,
      new TextEncoder().encode('{"error":"Not found"}')
    );

    const host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    let latest: ReturnType<typeof useBookCover> | null = null;

    root.render(
      React.createElement(CoverProbe, {
        path,
        onSnapshot: (snapshot) => {
          latest = snapshot;
        },
      })
    );

    await waitFor(() => latest?.loading === false);

    expect(epubCreates).toBe(0);
    expect(latest?.info).toMatchObject({
      coverUrl: null,
      title: null,
      author: null,
    });
  });
});
