import { describe, expect, test } from "bun:test";
import { subscribeToCloudSyncCheckRequests } from "../src/utils/cloudSyncEvents";
import { planIndividualBlobDownload } from "../src/utils/cloudSyncIndividualBlobMerge";
import { shouldApplyRemoteUpdate } from "../src/utils/cloudSyncShared";

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

describe("wallpaper cloud sync debug reproduction", () => {
  test("shows missing local indexeddb wallpaper is blocked by metadata freshness gate", async () => {
    const shouldApply = shouldApplyRemoteUpdate({
      remoteUpdatedAt: "2026-03-15T03:00:00.000Z",
      remoteSyncVersion: {
        serverVersion: 7,
        latestClientId: "client-b",
        latestClientVersion: 3,
        clientVersions: {
          "client-a": 4,
          "client-b": 3,
        },
      },
      lastAppliedRemoteAt: "2026-03-15T03:00:00.000Z",
      lastUploadedAt: "2026-03-15T03:00:00.000Z",
      lastLocalChangeAt: "2026-03-15T03:00:00.000Z",
      hasPendingUpload: false,
      lastKnownServerVersion: 7,
    });

    expect(shouldApply).toBe(false);

    const downloadPlan = planIndividualBlobDownload(
      [],
      {
        "wallpaper-1": {
          updatedAt: "2026-03-15T03:00:00.000Z",
          signature: "wallpaper-signature-1",
          size: 1024,
          storageUrl: "s3://bucket/wallpaper-1.gz",
          downloadUrl: "https://example.test/wallpaper-1.gz",
        },
      },
      {
        "wallpaper-1": {
          signature: "wallpaper-signature-1",
          updatedAt: "2026-03-15T02:59:00.000Z",
        },
      }
    );

    expect(downloadPlan.itemKeysToDownload).toEqual(["wallpaper-1"]);
    expect(downloadPlan.keysToDelete).toEqual([]);

    const browserGlobals = globalThis as typeof globalThis & {
      window?: { dispatchEvent: (event: unknown) => boolean };
      CustomEvent?: new (type: string, init?: unknown) => unknown;
      localStorage?: Storage;
    };
    const originalWindow = browserGlobals.window;
    const originalCustomEvent = browserGlobals.CustomEvent;
    const originalLocalStorage = browserGlobals.localStorage;

    browserGlobals.window = {
      dispatchEvent: () => true,
    };
    browserGlobals.CustomEvent = class {
      constructor(
        public readonly type: string,
        public readonly init?: unknown
      ) {}
    } as unknown as new (type: string, init?: unknown) => unknown;
    browserGlobals.localStorage = new MemoryStorage();

    const { useDisplaySettingsStore } = await import(
      "../src/stores/useDisplaySettingsStore"
    );
    let syncChecks = 0;
    const unsubscribe = subscribeToCloudSyncCheckRequests(() => {
      syncChecks += 1;
    });

    try {
      useDisplaySettingsStore.setState({
        currentWallpaper: "/wallpapers/photos/aqua/water.jpg",
        wallpaperSource: "/wallpapers/photos/aqua/water.jpg",
        getWallpaperData: async () => null,
      });

      await useDisplaySettingsStore
        .getState()
        .setWallpaper("indexeddb://wallpaper-1");

      expect(useDisplaySettingsStore.getState().currentWallpaper).toBe(
        "indexeddb://wallpaper-1"
      );
      expect(useDisplaySettingsStore.getState().wallpaperSource).toBe(
        "/wallpapers/photos/aqua/water.jpg"
      );
      expect(syncChecks).toBe(1);
    } finally {
      unsubscribe();
      browserGlobals.window = originalWindow;
      browserGlobals.CustomEvent = originalCustomEvent;
      browserGlobals.localStorage = originalLocalStorage;
    }
  });
});
