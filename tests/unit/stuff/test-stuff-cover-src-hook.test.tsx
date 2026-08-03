/**
 * Guards against the cover-src infinite update loop:
 * bumpStuffCoversRevision → setState in every mounted cover subscriber →
 * "Maximum update depth exceeded".
 *
 * Object-URL resolution is mocked: happy-dom's IndexedDB does not round-trip
 * Blob values (see test-stuff-cover-ingest for real IDB coverage).
 */

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
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const coverUrls = new Map<string, string>();
let mockRevision = 0;
const mockListeners = new Set<() => void>();

function notifyMockListeners(): void {
  for (const listener of [...mockListeners]) {
    listener();
  }
}

mock.module("../../../src/apps/stuff/utils/stuffCoverBlobs", () => ({
  getStuffCoversRevision: () => mockRevision,
  subscribeStuffCoversRevision: (listener: () => void) => {
    mockListeners.add(listener);
    return () => {
      mockListeners.delete(listener);
    };
  },
  getStuffCoverObjectUrl: async (coverBlobId: string) =>
    coverUrls.get(coverBlobId),
  bumpStuffCoversRevision: () => {
    mockRevision += 1;
    notifyMockListeners();
  },
  invalidateStuffCoverCache: (_coverBlobId?: string) => {
    mockRevision += 1;
    notifyMockListeners();
  },
}));

const { useStuffItemCoverSrc } = await import(
  "../../../src/apps/stuff/hooks/useStuffItemCoverSrc"
);
const {
  bumpStuffCoversRevision,
  invalidateStuffCoverCache,
} = await import("../../../src/apps/stuff/utils/stuffCoverBlobs");

let registeredDomForSuite = false;
let host: HTMLDivElement | null = null;
let root: Root | null = null;
let previousActEnv: PropertyDescriptor | undefined;

function CoverSrcProbe({
  coverBlobId,
  onSrc,
}: {
  coverBlobId: string;
  onSrc: (src: string | undefined) => void;
}) {
  const src = useStuffItemCoverSrc({ coverBlobId });
  onSrc(src);
  return null;
}

async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("useStuffItemCoverSrc revision subscription", () => {
  beforeAll(() => {
    if (!GlobalRegistrator.isRegistered) {
      GlobalRegistrator.register();
      registeredDomForSuite = true;
    }
    previousActEnv = Object.getOwnPropertyDescriptor(
      globalThis,
      "IS_REACT_ACT_ENVIRONMENT"
    );
    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
      configurable: true,
      writable: true,
      value: true,
    });
  });

  afterAll(() => {
    if (previousActEnv) {
      Object.defineProperty(
        globalThis,
        "IS_REACT_ACT_ENVIRONMENT",
        previousActEnv
      );
    } else {
      Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
    }
    if (registeredDomForSuite && GlobalRegistrator.isRegistered) {
      GlobalRegistrator.unregister();
    }
  });

  beforeEach(() => {
    coverUrls.clear();
    mockRevision = 0;
    mockListeners.clear();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    host?.remove();
    host = null;
  });

  test("many mounted covers survive repeated revision bumps without max depth", async () => {
    const id = "cover-hook-stable";
    coverUrls.set(id, "blob:mock-cover-v1");

    const latest: Array<string | undefined> = Array.from(
      { length: 24 },
      () => undefined
    );

    await act(async () => {
      root!.render(
        <>
          {latest.map((_, index) => (
            <CoverSrcProbe
              key={index}
              coverBlobId={id}
              onSrc={(src) => {
                latest[index] = src;
              }}
            />
          ))}
        </>
      );
    });

    await flushMicrotasks();
    expect(latest.every((src) => src === "blob:mock-cover-v1")).toBe(true);

    expect(() => {
      act(() => {
        for (let i = 0; i < 40; i++) {
          bumpStuffCoversRevision();
        }
      });
    }).not.toThrow();

    await flushMicrotasks();
    expect(latest.every((src) => src === "blob:mock-cover-v1")).toBe(true);

    // Upload / remove-bg: bytes replaced → new object URL, then revision bump.
    coverUrls.set(id, "blob:mock-cover-v2");
    await act(async () => {
      invalidateStuffCoverCache(id);
    });
    await flushMicrotasks();

    expect(latest.every((src) => src === "blob:mock-cover-v2")).toBe(true);
  });
});
