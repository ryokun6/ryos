import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { shouldRequestCloudSyncOnAppLaunch } from "../src/utils/cloudSyncLaunch";
import {
  beginApplyingRemoteDomain,
  endApplyingRemoteDomain,
  isApplyingRemoteDomain,
} from "../src/utils/cloudSyncRemoteApplyState";

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

type StoreModule = typeof import("../src/stores/useCloudSyncStore");

const browserGlobals = globalThis as typeof globalThis & {
  localStorage?: Storage;
};

let storeModulePromise: Promise<StoreModule> | null = null;

async function getStoreModule(): Promise<StoreModule> {
  if (!storeModulePromise) {
    storeModulePromise = import("../src/stores/useCloudSyncStore");
  }

  return storeModulePromise;
}

beforeAll(() => {
  browserGlobals.localStorage = new MemoryStorage();
});

beforeEach(async () => {
  browserGlobals.localStorage = new MemoryStorage();
  const { useCloudSyncStore } = await getStoreModule();
  useCloudSyncStore.setState((state) => ({
    ...state,
    lastError: null,
    domainStatus: {
      ...state.domainStatus,
      settings: {
        lastUploadedAt: null,
        lastFetchedAt: null,
        lastAppliedRemoteAt: null,
        lastKnownServerVersion: null,
        isUploading: false,
        isDownloading: false,
      },
    },
  }));
});

describe("cloud sync app launch checks", () => {
  test("requests a sync check when opening synced settings and content apps", () => {
    expect(shouldRequestCloudSyncOnAppLaunch("control-panels")).toBe(true);
    expect(shouldRequestCloudSyncOnAppLaunch("finder")).toBe(true);
    expect(shouldRequestCloudSyncOnAppLaunch("ipod")).toBe(true);
    expect(shouldRequestCloudSyncOnAppLaunch("videos")).toBe(true);
  });

  test("skips launch-time sync checks for unrelated apps", () => {
    expect(shouldRequestCloudSyncOnAppLaunch("terminal")).toBe(false);
    expect(shouldRequestCloudSyncOnAppLaunch("soundboard")).toBe(false);
    expect(shouldRequestCloudSyncOnAppLaunch("photo-booth")).toBe(false);
  });
});

describe("cloud sync remote apply guard", () => {
  test("tracks domains being applied from remote sync", () => {
    expect(isApplyingRemoteDomain("songs")).toBe(false);

    beginApplyingRemoteDomain("songs");
    expect(isApplyingRemoteDomain("songs")).toBe(true);
    expect(isApplyingRemoteDomain("videos")).toBe(false);

    endApplyingRemoteDomain("songs");
    expect(isApplyingRemoteDomain("songs")).toBe(false);
  });
});

describe("cloud sync store download audit timestamps", () => {
  test("tracks fetch and apply timestamps independently", async () => {
    const { useCloudSyncStore } = await getStoreModule();
    const metadata = {
      updatedAt: "2026-03-15T11:25:00.000Z",
      syncVersion: {
        serverVersion: 7,
        latestClientId: "client-b",
        latestClientVersion: 2,
        clientVersions: {
          "client-a": 1,
          "client-b": 2,
        },
      },
    };

    useCloudSyncStore.getState().markDownloadStart("settings");
    expect(useCloudSyncStore.getState().domainStatus.settings.isDownloading).toBe(
      true
    );

    useCloudSyncStore.getState().markDownloadSuccess("settings", metadata);

    expect(useCloudSyncStore.getState().domainStatus.settings).toMatchObject({
      lastFetchedAt: metadata.updatedAt,
      lastAppliedRemoteAt: null,
      lastKnownServerVersion: 7,
      isDownloading: false,
    });

    useCloudSyncStore.getState().markRemoteApplied("settings", metadata);

    expect(
      useCloudSyncStore.getState().domainStatus.settings.lastAppliedRemoteAt
    ).toBe(metadata.updatedAt);
    expect(useCloudSyncStore.getState().domainStatus.settings.lastFetchedAt).toBe(
      metadata.updatedAt
    );
  });
});
