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

let activeReads = 0;
let maxActiveReads = 0;
let readCalls = 0;
let epubCreates = 0;
let readBlobBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

mock.module("@/services/vfs/FileContentRepository", () => ({
  readBookBlobContent: mock(async () => {
    readCalls += 1;
    activeReads += 1;
    maxActiveReads = Math.max(maxActiveReads, activeReads);
    await new Promise((resolve) => setTimeout(resolve, 20));
    activeReads -= 1;
    return new Blob([readBlobBytes], {
      type: "application/epub+zip",
    });
  }),
}));

mock.module("epubjs", () => ({
  default: mock(() => {
    epubCreates += 1;
    return {
      ready: Promise.resolve(),
      loaded: { metadata: Promise.resolve({ title: "T", creator: "A" }) },
      coverUrl: async () => null,
      destroy: () => {},
    };
  }),
}));

const { useBookCover } = await import("../src/apps/books/utils/useBookCover");

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
  for (let i = 0; i < 30; i += 1) {
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

  beforeEach(() => {
    activeReads = 0;
    maxActiveReads = 0;
    readCalls = 0;
    epubCreates = 0;
    readBlobBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
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
    const host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    root.render(
      React.createElement(
        React.Fragment,
        null,
        Array.from({ length: 12 }, (_, index) =>
          React.createElement(CoverProbe, {
            key: index,
            path: `/Books/queued-book-${index}.epub`,
          })
        )
      )
    );

    await waitFor(() => epubCreates === 12);

    expect(readCalls).toBe(12);
    expect(maxActiveReads).toBeLessThanOrEqual(1);

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
    expect(readCalls).toBe(0);
    expect(epubCreates).toBe(0);
  });

  test("does not parse invalid synced blobs as EPUB covers", async () => {
    readBlobBytes = new TextEncoder().encode('{"error":"Not found"}');
    const path = "/Books/invalid-synced-payload.epub";

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

    expect(readCalls).toBe(1);
    expect(epubCreates).toBe(0);
    expect(latest?.info).toMatchObject({
      coverUrl: null,
      title: null,
      author: null,
    });
  });
});
