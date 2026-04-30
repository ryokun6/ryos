import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { shouldRequestCloudSyncOnAppLaunch } from "../src/utils/cloudSyncLaunch";
import {
  beginApplyingRemoteDomain,
  endApplyingRemoteDomain,
  isApplyingRemoteDomain,
} from "../src/utils/cloudSyncRemoteApplyState";
import { subscribeToCloudSyncDomainChanges } from "../src/utils/cloudSyncEvents";
import { LyricsFont } from "../src/types/lyrics";

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
type IpodStoreModule = typeof import("../src/stores/useIpodStore");

const browserGlobals = globalThis as typeof globalThis & {
  localStorage?: Storage;
  window?: typeof globalThis;
};

let storeModulePromise: Promise<StoreModule> | null = null;
let ipodStoreModulePromise: Promise<IpodStoreModule> | null = null;

async function getStoreModule(): Promise<StoreModule> {
  if (!storeModulePromise) {
    storeModulePromise = import("../src/stores/useCloudSyncStore");
  }

  return storeModulePromise;
}

async function getIpodStoreModule(): Promise<IpodStoreModule> {
  if (!ipodStoreModulePromise) {
    ipodStoreModulePromise = import("../src/stores/useIpodStore");
  }

  return ipodStoreModulePromise;
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
    expect(shouldRequestCloudSyncOnAppLaunch("tv")).toBe(true);
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

  test("suppresses song subscriber churn during remote apply", async () => {
    const { useIpodStore } = await getIpodStoreModule();
    let localUploadSignals = 0;

    useIpodStore.setState({
      tracks: [],
      libraryState: "loaded",
      lastKnownVersion: 1,
    });

    const unsubscribe = useIpodStore.subscribe((state, prevState) => {
      if (
        state.tracks !== prevState.tracks ||
        state.libraryState !== prevState.libraryState ||
        state.lastKnownVersion !== prevState.lastKnownVersion
      ) {
        if (isApplyingRemoteDomain("songs")) return;
        localUploadSignals += 1;
      }
    });

    try {
      beginApplyingRemoteDomain("songs");
      useIpodStore.setState({
        tracks: [
          {
            id: "remote-song-1",
            url: "https://www.youtube.com/watch?v=remote-song-1",
            title: "Remote Song",
          },
        ],
        libraryState: "loaded",
        lastKnownVersion: 2,
      });
      endApplyingRemoteDomain("songs");

      expect(localUploadSignals).toBe(0);

      useIpodStore.setState({
        tracks: [
          {
            id: "remote-song-1",
            url: "https://www.youtube.com/watch?v=remote-song-1",
            title: "Remote Song",
          },
          {
            id: "local-song-2",
            url: "https://www.youtube.com/watch?v=local-song-2",
            title: "Local Song",
          },
        ],
        lastKnownVersion: 3,
      });

      expect(localUploadSignals).toBe(1);
    } finally {
      unsubscribe();
      endApplyingRemoteDomain("songs");
    }
  });
});

describe("ipod lyrics settings sync events", () => {
  test("emits settings domain change when lyrics font changes", async () => {
    const { useIpodStore } = await getIpodStoreModule();
    const domains: string[] = [];
    const unsubscribe = subscribeToCloudSyncDomainChanges((domain) => {
      domains.push(domain);
    });

    try {
      useIpodStore.setState({ lyricsFont: LyricsFont.SerifRed });
      useIpodStore.getState().setLyricsFont(LyricsFont.Gradient);

      expect(domains).toEqual(["settings"]);
      expect(useIpodStore.getState().lyricsFont).toBe(LyricsFont.Gradient);
    } finally {
      unsubscribe();
    }
  });

  test("does not emit settings domain change when lyrics font stays the same", async () => {
    const { useIpodStore } = await getIpodStoreModule();
    let eventCount = 0;
    const unsubscribe = subscribeToCloudSyncDomainChanges(() => {
      eventCount += 1;
    });

    try {
      useIpodStore.setState({ lyricsFont: LyricsFont.SerifRed });
      useIpodStore.getState().setLyricsFont(LyricsFont.SerifRed);

      expect(eventCount).toBe(0);
    } finally {
      unsubscribe();
    }
  });
});

describe("ipod translation settings sync events", () => {
  test("emits settings domain change when translation language changes", async () => {
    const { useIpodStore } = await getIpodStoreModule();
    const domains: string[] = [];
    const unsubscribe = subscribeToCloudSyncDomainChanges((domain) => {
      domains.push(domain);
    });

    try {
      useIpodStore.setState({ lyricsTranslationLanguage: "auto" });
      useIpodStore.getState().setLyricsTranslationLanguage("en");

      expect(domains).toEqual(["settings"]);
      expect(useIpodStore.getState().lyricsTranslationLanguage).toBe("en");
    } finally {
      unsubscribe();
    }
  });

  test("does not emit settings domain change when translation language stays the same", async () => {
    const { useIpodStore } = await getIpodStoreModule();
    let eventCount = 0;
    const unsubscribe = subscribeToCloudSyncDomainChanges(() => {
      eventCount += 1;
    });

    try {
      useIpodStore.setState({ lyricsTranslationLanguage: "ja" });
      useIpodStore.getState().setLyricsTranslationLanguage("ja");

      expect(eventCount).toBe(0);
    } finally {
      unsubscribe();
    }
  });

  test("emits settings domain change when translation language changes to null", async () => {
    const { useIpodStore } = await getIpodStoreModule();
    const domains: string[] = [];
    const unsubscribe = subscribeToCloudSyncDomainChanges((domain) => {
      domains.push(domain);
    });

    try {
      useIpodStore.setState({ lyricsTranslationLanguage: "en" });
      useIpodStore.getState().setLyricsTranslationLanguage(null);

      expect(domains).toEqual(["settings"]);
      expect(useIpodStore.getState().lyricsTranslationLanguage).toBeNull();
    } finally {
      unsubscribe();
    }
  });

  test("emits settings domain change when translation language changes from null to auto", async () => {
    const { useIpodStore } = await getIpodStoreModule();
    const domains: string[] = [];
    const unsubscribe = subscribeToCloudSyncDomainChanges((domain) => {
      domains.push(domain);
    });

    try {
      useIpodStore.setState({ lyricsTranslationLanguage: null });
      useIpodStore.getState().setLyricsTranslationLanguage("auto");

      expect(domains).toEqual(["settings"]);
      expect(useIpodStore.getState().lyricsTranslationLanguage).toBe("auto");
    } finally {
      unsubscribe();
    }
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

describe("getEffectiveTranslationLanguage", () => {
  let ensureLanguageResources: (language: string) => Promise<void>;
  let i18nDefault: typeof import("../src/lib/i18n").default;

  beforeAll(async () => {
    browserGlobals.window = globalThis as typeof globalThis;
    if (!globalThis.navigator?.language) {
      Object.defineProperty(globalThis, "navigator", {
        value: { languages: ["en-US"], language: "en-US" },
        configurable: true,
      });
    }
    const i18nMod = await import("../src/lib/i18n");
    ensureLanguageResources = i18nMod.ensureLanguageResources;
    i18nDefault = i18nMod.default;
    const storage = browserGlobals.localStorage ?? new MemoryStorage();
    browserGlobals.localStorage = storage;
    Object.defineProperty(browserGlobals.window, "localStorage", {
      value: storage,
      configurable: true,
    });
    await i18nMod.initializeI18n();
  });

  beforeEach(() => {
    if (browserGlobals.window && browserGlobals.localStorage) {
      Object.defineProperty(browserGlobals.window, "localStorage", {
        value: browserGlobals.localStorage,
        configurable: true,
      });
    }
  });

  afterAll(async () => {
    await ensureLanguageResources("en");
    await i18nDefault.changeLanguage("en");
  });

  test('"auto" resolves to the current i18n language after changeLanguage', async () => {
    const { getEffectiveTranslationLanguage, LYRICS_TRANSLATION_AUTO } =
      await getIpodStoreModule();
    const before = i18nDefault.resolvedLanguage || i18nDefault.language;
    expect(getEffectiveTranslationLanguage(LYRICS_TRANSLATION_AUTO)).toBe(before);

    await ensureLanguageResources("ja");
    await i18nDefault.changeLanguage("ja");
    expect(getEffectiveTranslationLanguage(LYRICS_TRANSLATION_AUTO)).toBe("ja");
  });

  test("null stays off (original lyrics)", async () => {
    const { getEffectiveTranslationLanguage } = await getIpodStoreModule();
    expect(getEffectiveTranslationLanguage(null)).toBeNull();
  });

  test("explicit codes are unaffected by app locale", async () => {
    const { getEffectiveTranslationLanguage } = await getIpodStoreModule();
    await ensureLanguageResources("ja");
    await i18nDefault.changeLanguage("ja");
    expect(getEffectiveTranslationLanguage("de")).toBe("de");
  });
});
