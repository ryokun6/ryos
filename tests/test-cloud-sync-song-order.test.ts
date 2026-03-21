import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
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
};

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
  browserGlobals.localStorage = new MemoryStorage();
  seedPersistedStores();
});

beforeEach(async () => {
  browserGlobals.localStorage = new MemoryStorage();
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
