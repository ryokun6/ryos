import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { CustomChannel } from "../src/stores/useTvStore";
import type { CloudSyncDomainMetadata } from "../src/utils/cloudSyncShared";

class MemoryStorage implements Storage {
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
    this.map.set(key, value);
  }
}

const browserGlobals = globalThis as typeof globalThis & {
  localStorage?: Storage;
  document?: Document;
  window?: Window & typeof globalThis;
  navigator?: Navigator;
  fetch?: typeof fetch;
};

const originalLocalStorage = browserGlobals.localStorage;
const originalDocument = browserGlobals.document;
const originalWindow = browserGlobals.window;
const originalNavigator = browserGlobals.navigator;
const originalFetch = browserGlobals.fetch;

class MockAudioContext {
  state: AudioContextState = "running";
  destination = {};

  async resume(): Promise<void> {
    this.state = "running";
  }

  async close(): Promise<void> {
    this.state = "closed";
  }

  addEventListener(): void {}

  removeEventListener(): void {}

  createBuffer(): AudioBuffer {
    return {} as AudioBuffer;
  }

  createBufferSource(): AudioBufferSourceNode {
    return {
      connect: () => undefined,
      start: () => undefined,
      stop: () => undefined,
      buffer: null,
    } as unknown as AudioBufferSourceNode;
  }
}

function createBrowserTestEnvironment(): void {
  browserGlobals.localStorage = new MemoryStorage();
  browserGlobals.localStorage.setItem(
    "ryos:files",
    JSON.stringify({
      state: {
        items: {},
        libraryState: "cleared",
      },
      version: 13,
    })
  );
  browserGlobals.document = {
    documentElement: {
      dataset: {},
    },
    visibilityState: "visible",
    head: {
      appendChild: () => undefined,
    },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    createTextNode: () => ({}),
    createElementNS: () => ({
      getContext: () => null,
      style: {},
    }),
    createElement: () => ({
      dataset: {},
      style: {},
      styleSheet: null,
      appendChild: () => undefined,
      remove: () => undefined,
      replaceWith: () => undefined,
      getContext: () => null,
    }),
  } as unknown as Document;
  browserGlobals.navigator = {
    hardwareConcurrency: 1,
    onLine: true,
    userAgent: "bun-test",
    mediaDevices: {
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    },
  } as unknown as Navigator;
  browserGlobals.window = {
    AudioContext: MockAudioContext as unknown as typeof AudioContext,
    document: browserGlobals.document,
    navigator: browserGlobals.navigator,
    location: {
      host: "localhost:5173",
      origin: "http://localhost:5173",
    } as Location,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  } as unknown as Window & typeof globalThis;
  browserGlobals.fetch = (async (input) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const payload = url.endsWith("/data/filesystem.json")
      ? { directories: [], files: [] }
      : url.endsWith("/data/applets.json")
        ? { applets: [] }
        : { songs: [] };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
}

function makeMetadata(updatedAt: string): CloudSyncDomainMetadata {
  return {
    updatedAt,
    createdAt: updatedAt,
    version: 1,
    totalSize: 0,
    syncVersion: null,
  };
}

function makeChannel(id: string): CustomChannel {
  return {
    id,
    name: `Channel ${id}`,
    description: `Description ${id}`,
    videos: [
      {
        id: `${id}-video`,
        url: `https://youtu.be/${id}`,
        title: `Video ${id}`,
      },
    ],
    createdAt: 1,
  };
}

beforeAll(() => {
  createBrowserTestEnvironment();
});

beforeEach(() => {
  createBrowserTestEnvironment();
  browserGlobals.localStorage.setItem(
    "ryos:tv",
    JSON.stringify({
      state: {
        currentChannelId: "ryos-picks",
        customChannels: [],
        lcdFilterOn: true,
        closedCaptionsOn: true,
      },
      version: 4,
    })
  );
});

afterAll(() => {
  browserGlobals.localStorage = originalLocalStorage;
  browserGlobals.document = originalDocument;
  browserGlobals.window = originalWindow;
  browserGlobals.navigator = originalNavigator;
  browserGlobals.fetch = originalFetch;
});

describe("cloud sync TV upload apply", () => {
  test("resolved TV upload apply is treated as remote so it does not queue another TV upload", async () => {
    const { useTvStore } = await import("../src/stores/useTvStore");
    const { applyResolvedRedisUploadLocally } = await import("../src/sync/domains");
    const { isApplyingRemoteDomain } = await import(
      "../src/utils/cloudSyncRemoteApplyState"
    );

    useTvStore.setState({
      currentChannelId: "ryos-picks",
      customChannels: [],
      hiddenDefaultChannelIds: [],
      lcdFilterOn: true,
      closedCaptionsOn: true,
    });

    const queuedDuringApply: boolean[] = [];
    const unsubscribe = useTvStore.subscribe((state, prevState) => {
      if (
        state.customChannels !== prevState.customChannels ||
        state.hiddenDefaultChannelIds !== prevState.hiddenDefaultChannelIds ||
        state.lcdFilterOn !== prevState.lcdFilterOn ||
        state.closedCaptionsOn !== prevState.closedCaptionsOn
      ) {
        if (useTvStore.persist && !useTvStore.persist.hasHydrated()) return;
        if (isApplyingRemoteDomain("tv")) return;
        queuedDuringApply.push(true);
      }
    });

    try {
      await applyResolvedRedisUploadLocally(
        "tv",
        {
          customChannels: [makeChannel("local"), makeChannel("remote")],
          hiddenDefaultChannelIds: ["taiwan"],
          lcdFilterOn: true,
          closedCaptionsOn: true,
        },
        "2026-03-22T10:00:00.000Z"
      );

      expect(useTvStore.getState().customChannels.map((channel) => channel.id)).toEqual([
        "local",
        "remote",
      ]);
      expect(useTvStore.getState().hiddenDefaultChannelIds).toEqual(["taiwan"]);
      expect(queuedDuringApply).toEqual([]);
    } finally {
      unsubscribe();
    }
  });

  test("downloaded TV apply is still suppressed by the remote apply guard", async () => {
    const { useTvStore } = await import("../src/stores/useTvStore");
    const { applyDownloadedCloudSyncDomainPayload } = await import(
      "../src/sync/domains"
    );
    const { isApplyingRemoteDomain } = await import(
      "../src/utils/cloudSyncRemoteApplyState"
    );

    useTvStore.setState({
      currentChannelId: "ryos-picks",
      customChannels: [],
      hiddenDefaultChannelIds: [],
      lcdFilterOn: true,
      closedCaptionsOn: true,
    });

    const queuedDuringApply: boolean[] = [];
    const unsubscribe = useTvStore.subscribe((state, prevState) => {
      if (
        state.customChannels !== prevState.customChannels ||
        state.hiddenDefaultChannelIds !== prevState.hiddenDefaultChannelIds ||
        state.lcdFilterOn !== prevState.lcdFilterOn ||
        state.closedCaptionsOn !== prevState.closedCaptionsOn
      ) {
        if (useTvStore.persist && !useTvStore.persist.hasHydrated()) return;
        if (isApplyingRemoteDomain("tv")) return;
        queuedDuringApply.push(true);
      }
    });

    try {
      await applyDownloadedCloudSyncDomainPayload("tv", {
        metadata: makeMetadata("2026-03-22T10:05:00.000Z"),
        data: {
          customChannels: [makeChannel("downloaded")],
          hiddenDefaultChannelIds: ["taiwan"],
          lcdFilterOn: true,
          closedCaptionsOn: true,
        },
      });

      expect(useTvStore.getState().customChannels.map((channel) => channel.id)).toEqual([
        "downloaded",
      ]);
      expect(useTvStore.getState().hiddenDefaultChannelIds).toEqual(["taiwan"]);
      expect(queuedDuringApply).toEqual([]);
    } finally {
      unsubscribe();
    }
  });
});
