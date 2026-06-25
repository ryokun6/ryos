import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import React from "react";
import { createRoot, type Root } from "react-dom/client";

let activeReads = 0;
let maxActiveReads = 0;
let readCalls = 0;
let epubCreates = 0;

mock.module("@/services/vfs/FileContentRepository", () => ({
  readBookBlobContent: mock(async () => {
    readCalls += 1;
    activeReads += 1;
    maxActiveReads = Math.max(maxActiveReads, activeReads);
    await new Promise((resolve) => setTimeout(resolve, 20));
    activeReads -= 1;
    return new Blob([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], {
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

function CoverProbe({ path }: { path: string }) {
  useBookCover(path, 1);
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

  test("limits concurrent shelf EPUB cover reads", async () => {
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
    expect(maxActiveReads).toBeLessThanOrEqual(3);
  });
});
