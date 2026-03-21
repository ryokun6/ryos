import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { CloudSyncDomainMetadata } from "../src/utils/cloudSyncShared";
import type { Track } from "../src/stores/useIpodStore";

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

type DomainsModule = typeof import("../src/sync/domains");
type IpodStoreModule = typeof import("../src/stores/useIpodStore");
type CloudSyncStoreModule = typeof import("../src/stores/useCloudSyncStore");

const browserGlobals = globalThis as typeof globalThis & {
  localStorage?: Storage;
  document?: Document;
  window?: Window & typeof globalThis;
  navigator?: Navigator;
};

const originalLocalStorage = browserGlobals.localStorage;
const originalDocument = browserGlobals.document;
const originalWindow = browserGlobals.window;
const originalNavigator = browserGlobals.navigator;

class MockAudioContext {
  state: AudioContextState = "running";
  destination = {};
  onstatechange: (() => void) | null = null;

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
    createElement: () => ({
      dataset: {},
      styleSheet: null,
      appendChild: () => undefined,
      remove: () => undefined,
      replaceWith: () => undefined,
    }),
  } as unknown as Document;
  browserGlobals.navigator = {
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
    location: { host: "localhost:5173", origin: "http://localhost:5173" } as Location,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  } as unknown as Window & typeof globalThis;
}

let domainsModulePromise: Promise<DomainsModule> | null = null;
let ipodStoreModulePromise: Promise<IpodStoreModule> | null = null;
let cloudSyncStoreModulePromise: Promise<CloudSyncStoreModule> | null = null;

function seedPersistedStores(): void {
  browserGlobals.localStorage?.setItem(
    "ryos:ipod",
    JSON.stringify({
      state: {
        tracks: [],
        libraryState: "loaded",
        lastKnownVersion: 0,
      },
      version: 31,
    })
  );
}

async function getDomainsModule(): Promise<DomainsModule> {
  if (!domainsModulePromise) {
    domainsModulePromise = import("../src/sync/domains");
  }
  return domainsModulePromise;
}

async function getIpodStoreModule(): Promise<IpodStoreModule> {
  if (!ipodStoreModulePromise) {
    ipodStoreModulePromise = import("../src/stores/useIpodStore");
  }
  return ipodStoreModulePromise;
}

async function getCloudSyncStoreModule(): Promise<CloudSyncStoreModule> {
  if (!cloudSyncStoreModulePromise) {
    cloudSyncStoreModulePromise = import("../src/stores/useCloudSyncStore");
  }
  return cloudSyncStoreModulePromise;
}

function makeMetadata(updatedAt: string): CloudSyncDomainMetadata {
  return {
    updatedAt,
    createdAt: updatedAt,
    version: 31,
    totalSize: 0,
    syncVersion: null,
  };
}

function makeTrack(
  id: string,
  createdAt: number,
  importOrder = 0,
  updatedAt = createdAt
): Track {
  return {
    id,
    url: `https://www.youtube.com/watch?v=${id}`,
    title: `Song ${id}`,
    createdAt,
    importOrder,
    updatedAt,
  };
}

beforeAll(() => {
  createBrowserTestEnvironment();
  seedPersistedStores();
});

beforeEach(async () => {
  createBrowserTestEnvironment();
  seedPersistedStores();

  const { useIpodStore } = await getIpodStoreModule();
  const { useCloudSyncStore } = await getCloudSyncStoreModule();

  useIpodStore.setState({
    tracks: [],
    currentSongId: null,
    libraryState: "loaded",
    lastKnownVersion: 0,
    isPlaying: false,
  });

  useCloudSyncStore.setState((state) => ({
    ...state,
    lastError: null,
    remoteMetadata: {
      ...state.remoteMetadata,
      songs: null,
    },
    deletionMarkers: {
      ...state.deletionMarkers,
      songTrackIds: {},
    },
  }));
});

afterAll(() => {
  browserGlobals.localStorage = originalLocalStorage;
  browserGlobals.document = originalDocument;
  browserGlobals.window = originalWindow;
  browserGlobals.navigator = originalNavigator;
});

describe("cloud sync songs ordering", () => {
  test("prepareCloudSyncDomainWrite reorders merged songs newest first", async () => {
    const { useIpodStore } = await getIpodStoreModule();
    const { prepareCloudSyncDomainWrite, invalidateRedisStateSnapshotForUpload } =
      await getDomainsModule();

    const older = makeTrack("older-song", 100);
    const newest = makeTrack("newest-song", 200);
    useIpodStore.setState({
      // Reproduce the stale local order reported after prior cloud sync merges.
      tracks: [older, newest],
      libraryState: "loaded",
      lastKnownVersion: 2,
    });

    const username = `songs-order-upload-${Date.now()}`;
    invalidateRedisStateSnapshotForUpload(username, "songs");

    const originalFetch = globalThis.fetch;
    const fetchCalls: string[] = [];

    globalThis.fetch = (async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      fetchCalls.push(url);

      if (url.endsWith("/api/sync/domains/songs")) {
        return new Response(
          JSON.stringify({
            parts: {
              songs: {
                metadata: makeMetadata("2026-03-21T17:45:00.000Z"),
                data: {
                  tracks: [older],
                  libraryState: "loaded",
                  lastKnownVersion: 1,
                },
              },
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      throw new Error(`Unexpected fetch in test: ${url}`);
    }) as typeof fetch;

    try {
      const prepared = await prepareCloudSyncDomainWrite("songs", {
        username,
        isAuthenticated: true,
      });

      const payload = prepared.payload as {
        data: {
          tracks: Track[];
          libraryState: "uninitialized" | "loaded" | "cleared";
          lastKnownVersion: number;
        };
      };

      expect(payload.data.tracks.map((track) => track.id)).toEqual([
        "newest-song",
        "older-song",
      ]);
      expect(payload.data.lastKnownVersion).toBe(2);
      expect(fetchCalls).toEqual(["/api/sync/domains/songs"]);
    } finally {
      globalThis.fetch = originalFetch;
      invalidateRedisStateSnapshotForUpload(username, "songs");
    }
  });

  test("applyDownloadedCloudSyncDomainPayload reorders downloaded songs newest first", async () => {
    const { useIpodStore } = await getIpodStoreModule();
    const { applyDownloadedCloudSyncDomainPayload } = await getDomainsModule();

    const older = makeTrack("older-song", 100);
    const newest = makeTrack("newest-song", 200);

    await applyDownloadedCloudSyncDomainPayload("songs", {
      metadata: makeMetadata("2026-03-21T17:50:00.000Z"),
      data: {
        tracks: [older, newest],
        libraryState: "loaded",
        lastKnownVersion: 7,
      },
    });

    expect(useIpodStore.getState().tracks.map((track) => track.id)).toEqual([
      "newest-song",
      "older-song",
    ]);
    expect(useIpodStore.getState().libraryState).toBe("loaded");
    expect(useIpodStore.getState().lastKnownVersion).toBe(7);
  });
});
