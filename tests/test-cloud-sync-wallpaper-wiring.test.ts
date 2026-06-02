import { describe, expect, test } from "bun:test";
import { subscribeToCloudSyncDomainCheckRequests } from "../src/utils/cloudSyncEvents";

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

describe("wallpaper cloud sync wiring", () => {
  test("requests custom-wallpapers sync when an indexeddb wallpaper is missing locally", async () => {
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

    const { useDisplaySettingsStore, DEFAULT_WALLPAPER_PATH } = await import(
      "../src/stores/useDisplaySettingsStore"
    );
    const originalState = useDisplaySettingsStore.getState();
    const syncDomainChecks: string[] = [];
    const unsubscribe = subscribeToCloudSyncDomainCheckRequests((domain) => {
      syncDomainChecks.push(domain);
    });

    try {
      useDisplaySettingsStore.setState({
        currentWallpaper: DEFAULT_WALLPAPER_PATH,
        wallpaperSource: DEFAULT_WALLPAPER_PATH,
        getWallpaperData: async () => null,
      });

      await useDisplaySettingsStore
        .getState()
        .setWallpaper("indexeddb://wallpaper-1");

      expect(useDisplaySettingsStore.getState().currentWallpaper).toBe(
        "indexeddb://wallpaper-1"
      );
      expect(useDisplaySettingsStore.getState().wallpaperSource).toBe(
        DEFAULT_WALLPAPER_PATH
      );
      expect(syncDomainChecks).toEqual(["custom-wallpapers"]);
    } finally {
      unsubscribe();
      useDisplaySettingsStore.setState({
        currentWallpaper: originalState.currentWallpaper,
        wallpaperSource: originalState.wallpaperSource,
        getWallpaperData: originalState.getWallpaperData,
      });
      browserGlobals.window = originalWindow;
      browserGlobals.CustomEvent = originalCustomEvent;
      browserGlobals.localStorage = originalLocalStorage;
    }
  });
});
