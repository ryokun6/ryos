import "./local-storage-stub";
import { beforeEach, describe, expect, test } from "bun:test";
import { SYNC_CODECS } from "../src/sync/codecs";
import { CloudSyncEngine } from "../src/sync/engine";
import {
  hashDoc,
  markSyncLocalReconcileRequired,
  SyncClientState,
} from "../src/sync/state";
import { useStickiesStore } from "../src/stores/useStickiesStore";
import { useCalendarStore } from "../src/stores/useCalendarStore";
import { useVideoStore } from "../src/stores/useVideoStore";
import { useTvStore } from "../src/stores/useTvStore";
import { useIpodStore } from "../src/stores/useIpodStore";
import { useMapsStore } from "../src/stores/useMapsStore";
import {
  DEFAULT_BOOKS_SETTINGS,
  useBooksStore,
} from "../src/stores/useBooksStore";
import { useAudioSettingsStore } from "../src/stores/useAudioSettingsStore";
import {
  mergePersistedCloudSyncCategoryStatus,
  useCloudSyncStore,
} from "../src/stores/useCloudSyncStore";
import {
  formatFetchingStatus,
  formatSyncStatus,
  formatUploadingStatus,
} from "../src/apps/control-panels/components/control-panels-app/syncUtils";
import { downloadBlobItem, gzipJson } from "../src/sync/blobs";
import {
  fetchAutoSyncPreferenceFromServer,
  persistAutoSyncPreferenceToServer,
} from "../src/utils/autoSyncPreference";
import {
  summarizeDirtyScope,
  summarizeSyncOps,
} from "../src/sync/logging";
import type { SyncOp } from "../src/shared/sync2/types";

/**
 * Cloud Sync v2 codec round-trips: collect must decompose store state into
 * per-key docs, and apply must write remote ops back onto the stores.
 * (Codecs that need IndexedDB — files and the blob namespaces — are covered
 * by the API integration + manual paths instead; bun has no IndexedDB.)
 */

const ctx = {};
const t = "01718180000000-0000-test";

describe("stickies codec", () => {
  beforeEach(() => {
    useStickiesStore.setState({ notes: [] });
  });

  test("collect emits one key per note", () => {
    useStickiesStore.setState({
      notes: [
        { id: "n1", content: "hello" },
        { id: "n2", content: "world" },
      ] as never,
    });
    const docs = SYNC_CODECS.stickies.collect(ctx) as Map<string, unknown>;
    expect([...docs.keys()].sort()).toEqual([
      "stickies/note:n1",
      "stickies/note:n2",
    ]);
  });

  test("apply upserts and deletes notes", async () => {
    useStickiesStore.setState({
      notes: [{ id: "n1", content: "old" }] as never,
    });
    await SYNC_CODECS.stickies.apply(
      [
        { k: "stickies/note:n1", del: true, t },
        { k: "stickies/note:n3", v: { id: "n3", content: "new" }, t },
      ],
      ctx
    );
    const notes = useStickiesStore.getState().notes;
    expect(notes.map((note) => note.id)).toEqual(["n3"]);
  });
});

describe("calendar codec", () => {
  beforeEach(() => {
    useCalendarStore.setState({ events: [], calendars: [], todos: [] } as never);
  });

  test("round-trips events, calendars, and todos", async () => {
    await SYNC_CODECS.calendar.apply(
      [
        { k: "calendar/event:e1", v: { id: "e1", title: "Meeting" }, t },
        { k: "calendar/cal:c1", v: { id: "c1", name: "Work" }, t },
        { k: "calendar/todo:t1", v: { id: "t1", title: "Task" }, t },
      ],
      ctx
    );
    const state = useCalendarStore.getState();
    expect(state.events.map((e) => e.id)).toEqual(["e1"]);
    expect(state.calendars.map((c) => c.id)).toEqual(["c1"]);
    expect(state.todos.map((todo) => todo.id)).toEqual(["t1"]);

    const docs = (await SYNC_CODECS.calendar.collect(ctx)) as Map<string, unknown>;
    expect([...docs.keys()].sort()).toEqual([
      "calendar/cal:c1",
      "calendar/event:e1",
      "calendar/todo:t1",
    ]);
  });
});

describe("videos codec", () => {
  beforeEach(() => {
    useVideoStore.setState({ videos: [] } as never);
  });

  test("apply respects the order doc", async () => {
    await SYNC_CODECS.videos.apply(
      [
        { k: "videos/video:v1", v: { id: "v1", title: "One" }, t },
        { k: "videos/video:v2", v: { id: "v2", title: "Two" }, t },
        { k: "videos/lib", v: { order: ["v2", "v1"] }, t },
      ],
      ctx
    );
    expect(useVideoStore.getState().videos.map((video) => video.id)).toEqual([
      "v2",
      "v1",
    ]);
  });

  test("collect includes the order doc", () => {
    useVideoStore.setState({
      videos: [
        { id: "v9", title: "Nine" },
        { id: "v8", title: "Eight" },
      ] as never,
    });
    const docs = SYNC_CODECS.videos.collect(ctx) as Map<string, unknown>;
    expect(docs.get("videos/lib")).toEqual({ order: ["v9", "v8"] });
  });
});

describe("tv codec", () => {
  test("apply merges channels and prefs", async () => {
    useTvStore.setState({
      customChannels: [{ id: "old", name: "Old" }] as never,
      hiddenDefaultChannelIds: [],
      lcdFilterOn: true,
      closedCaptionsOn: true,
    } as never);

    await SYNC_CODECS.tv.apply(
      [
        { k: "tv/channel:old", del: true, t },
        { k: "tv/channel:new", v: { id: "new", name: "New" }, t },
        {
          k: "tv/prefs",
          v: {
            hiddenDefaultChannelIds: ["taiwan"],
            hiddenDefaultChannelIdsUpdatedAt: "2024-06-01T00:00:00.000Z",
            hiddenDefaultChannelIdsResetAt: null,
            lcdFilterOn: false,
            closedCaptionsOn: true,
          },
          t,
        },
      ],
      ctx
    );

    const state = useTvStore.getState();
    expect(state.customChannels.map((channel) => channel.id)).toEqual(["new"]);
    expect(state.hiddenDefaultChannelIds).toEqual(["taiwan"]);
    expect(state.lcdFilterOn).toBe(false);
  });
});

describe("songs codec", () => {
  beforeEach(() => {
    useIpodStore.setState({
      tracks: [],
      libraryState: "uninitialized",
      lastKnownVersion: 0,
    } as never);
  });

  test("waits for async iPod persistence hydration", () => {
    expect(SYNC_CODECS.songs.isReady).toBeDefined();
    expect(SYNC_CODECS.settings.isReady).toBeDefined();
  });

  test("delays remote apply until the local store is hydrated", async () => {
    const codec = SYNC_CODECS.songs;
    const originalIsReady = codec.isReady;
    const originalApply = codec.apply;
    let ready = false;
    let applied = false;
    codec.isReady = () => ready;
    codec.apply = async () => {
      applied = true;
    };
    const previousAutoSyncEnabled =
      useCloudSyncStore.getState().autoSyncEnabled;
    const previousSyncSongs = useCloudSyncStore.getState().syncSongs;
    useCloudSyncStore.setState({
      autoSyncEnabled: true,
      syncSongs: true,
    });
    const engine = await CloudSyncEngine.create("hydration-test");

    try {
      const applying = engine.applyRemoteOps([
        {
          k: "songs/lib",
          v: { libraryState: "loaded", lastKnownVersion: 1, order: [] },
          t,
        },
      ]);
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(applied).toBe(false);

      ready = true;
      await applying;
      expect(applied).toBe(true);
    } finally {
      codec.isReady = originalIsReady;
      codec.apply = originalApply;
      useCloudSyncStore.setState({
        autoSyncEnabled: previousAutoSyncEnabled,
        syncSongs: previousSyncSongs,
      });
      await engine.stop();
    }
  });

  test("apply orders tracks by the lib order doc", async () => {
    await SYNC_CODECS.songs.apply(
      [
        { k: "songs/track:a", v: { id: "a", title: "A", url: "u" }, t },
        { k: "songs/track:b", v: { id: "b", title: "B", url: "u" }, t },
        {
          k: "songs/lib",
          v: { libraryState: "loaded", lastKnownVersion: 3, order: ["b", "a"] },
          t,
        },
      ],
      ctx
    );
    const state = useIpodStore.getState();
    expect(state.tracks.map((track) => track.id)).toEqual(["b", "a"]);
    expect(state.libraryState).toBe("loaded");
    expect(state.lastKnownVersion).toBe(3);
  });

  test("collect emits per-track keys and the lib doc with order", () => {
    useIpodStore.setState({
      tracks: [
        { id: "x", title: "X", url: "u" },
        { id: "y", title: "Y", url: "u" },
      ] as never,
      libraryState: "loaded",
      lastKnownVersion: 5,
    } as never);
    const docs = SYNC_CODECS.songs.collect(ctx) as Map<string, unknown>;
    expect(docs.get("songs/lib")).toEqual({
      libraryState: "loaded",
      lastKnownVersion: 5,
      order: ["x", "y"],
    });
    expect(docs.has("songs/track:x")).toBe(true);
    expect(docs.has("songs/track:y")).toBe(true);
  });
});

describe("maps codec", () => {
  test("apply replaces home/work/favorites", async () => {
    useMapsStore.setState({ home: null, work: null, favorites: [] } as never);
    await SYNC_CODECS.maps.apply(
      [
        { k: "maps/home", v: { id: "h", name: "Home" }, t },
        { k: "maps/favorite:f1", v: { id: "f1", name: "Cafe" }, t },
      ],
      ctx
    );
    const state = useMapsStore.getState();
    expect(state.home).toMatchObject({ name: "Home" });
    expect(state.favorites.map((favorite) => favorite.id)).toEqual(["f1"]);
  });
});

describe("bookshelf codec", () => {
  beforeEach(() => {
    useBooksStore.setState({
      progressByPath: {},
      pinnedTop: [],
      pinnedBottom: [],
      lastOpenedPath: null,
    } as never);
  });

  test("collect emits per-book progress plus order + last-opened docs", () => {
    useBooksStore.setState({
      progressByPath: {
        "/Books/a.epub": { cfi: "epubcfi(/2)", percentage: 0.3, updatedAt: 10 },
      },
      pinnedTop: ["/Books/a.epub"],
      pinnedBottom: [],
      lastOpenedPath: "/Books/a.epub",
    } as never);
    const docs = SYNC_CODECS.bookshelf.collect(ctx) as Map<string, unknown>;
    expect(docs.has("bookshelf/progress:/Books/a.epub")).toBe(true);
    expect(docs.get("bookshelf/order")).toMatchObject({
      pinnedTop: ["/Books/a.epub"],
    });
    expect(docs.get("bookshelf/last-opened")).toMatchObject({
      path: "/Books/a.epub",
    });
  });

  test("apply upserts progress, ordering, and last-opened", async () => {
    await SYNC_CODECS.bookshelf.apply(
      [
        {
          k: "bookshelf/progress:/Books/a.epub",
          v: { cfi: "epubcfi(/4)", percentage: 0.5, updatedAt: 20 },
          t,
        },
        { k: "bookshelf/order", v: { pinnedTop: ["/Books/a.epub"], pinnedBottom: [] }, t },
        { k: "bookshelf/last-opened", v: { path: "/Books/a.epub" }, t },
      ],
      ctx
    );
    const state = useBooksStore.getState();
    expect(state.progressByPath["/Books/a.epub"]).toMatchObject({ percentage: 0.5 });
    expect(state.pinnedTop).toEqual(["/Books/a.epub"]);
    expect(state.lastOpenedPath).toBe("/Books/a.epub");
  });

  test("stale remote progress does not clobber newer local progress", async () => {
    useBooksStore.setState({
      progressByPath: {
        "/Books/a.epub": { cfi: "epubcfi(/8)", percentage: 0.9, updatedAt: 100 },
      },
    } as never);
    const result = await SYNC_CODECS.bookshelf.apply(
      [
        {
          k: "bookshelf/progress:/Books/a.epub",
          v: { cfi: "epubcfi(/2)", percentage: 0.1, updatedAt: 50 },
          t,
        },
      ],
      ctx
    );
    // Local updatedAt (100) is newer than the incoming op (50): keep local.
    expect(
      useBooksStore.getState().progressByPath["/Books/a.epub"].percentage
    ).toBe(0.9);
    // ...and the codec reports the key as rejected so the engine re-uploads.
    expect(result).toEqual({
      rejectedKeys: ["bookshelf/progress:/Books/a.epub"],
    });
  });

  test("newer remote progress applies and is not reported rejected", async () => {
    useBooksStore.setState({
      progressByPath: {
        "/Books/a.epub": { cfi: "epubcfi(/8)", percentage: 0.4, updatedAt: 100 },
      },
    } as never);
    const result = await SYNC_CODECS.bookshelf.apply(
      [
        {
          k: "bookshelf/progress:/Books/a.epub",
          v: { cfi: "epubcfi(/12)", percentage: 0.95, updatedAt: 200 },
          t,
        },
      ],
      ctx
    );
    expect(
      useBooksStore.getState().progressByPath["/Books/a.epub"].percentage
    ).toBe(0.95);
    expect(result).toBeUndefined();
  });

  test("removeBook clears progress, ordering, last-opened, and openPath", () => {
    useBooksStore.setState({
      progressByPath: {
        "/Books/a.epub": { cfi: "epubcfi(/2)", percentage: 0.3, updatedAt: 10 },
        "/Books/b.epub": { cfi: "epubcfi(/4)", percentage: 0.6, updatedAt: 20 },
      },
      pinnedTop: ["/Books/a.epub"],
      pinnedBottom: ["/Books/a.epub"],
      lastOpenedPath: "/Books/a.epub",
      openPath: "/Books/a.epub",
    } as never);

    useBooksStore.getState().removeBook("/Books/a.epub");

    const state = useBooksStore.getState();
    expect(state.progressByPath["/Books/a.epub"]).toBeUndefined();
    expect(state.progressByPath["/Books/b.epub"]).toBeDefined();
    expect(state.pinnedTop).toEqual([]);
    expect(state.pinnedBottom).toEqual([]);
    expect(state.lastOpenedPath).toBeNull();
    expect(state.openPath).toBeNull();

    // collect must stop emitting the removed book's progress doc so the engine
    // shadow-diff can tombstone it cross-device.
    const docs = SYNC_CODECS.bookshelf.collect(ctx) as Map<string, unknown>;
    expect(docs.has("bookshelf/progress:/Books/a.epub")).toBe(false);
    expect(docs.has("bookshelf/progress:/Books/b.epub")).toBe(true);
  });

  test("renameProgressPath migrates openPath and last-opened with the book", () => {
    useBooksStore.setState({
      progressByPath: {
        "/Books/a.epub": { cfi: "epubcfi(/2)", percentage: 0.3, updatedAt: 10 },
      },
      pinnedTop: ["/Books/a.epub"],
      pinnedBottom: [],
      lastOpenedPath: "/Books/a.epub",
      openPath: "/Books/a.epub",
    } as never);

    useBooksStore.getState().renameProgressPath("/Books/a.epub", "/Books/b.epub");

    const state = useBooksStore.getState();
    expect(state.progressByPath["/Books/a.epub"]).toBeUndefined();
    expect(state.progressByPath["/Books/b.epub"]).toMatchObject({
      percentage: 0.3,
    });
    expect(state.pinnedTop).toEqual(["/Books/b.epub"]);
    expect(state.lastOpenedPath).toBe("/Books/b.epub");
    expect(state.openPath).toBe("/Books/b.epub");
  });

  test("bookshelf collect does not sync device-local openPath", () => {
    useBooksStore.setState({
      progressByPath: {},
      pinnedTop: [],
      pinnedBottom: [],
      lastOpenedPath: "/Books/a.epub",
      openPath: "/Books/a.epub",
    } as never);

    const docs = SYNC_CODECS.bookshelf.collect(ctx) as Map<string, unknown>;
    expect(docs.get("bookshelf/last-opened")).toMatchObject({
      path: "/Books/a.epub",
    });
    for (const key of docs.keys()) {
      expect(key).not.toContain("openPath");
      expect(key).not.toContain("open-path");
    }
  });
});

describe("books settings codec", () => {
  beforeEach(() => {
    useBooksStore.setState({
      settings: { ...DEFAULT_BOOKS_SETTINGS },
    });
  });

  test("collect emits one document per reader preference", () => {
    useBooksStore.getState().updateSettings({
      fontId: "eb-garamond",
      fontSizePct: 130,
      columnMode: "double",
      themeOverride: "sepia",
      customThemeBackground: "#112233",
      customThemeText: "#ddeeff",
      customThemeTransparent: true,
      chineseScript: "traditional",
      textLayout: "vertical",
      lineHeight: 1.8,
      gutterPx: 32,
      speechRate: 1.2,
    });

    const docs = SYNC_CODECS["books-settings"].collect(ctx) as Map<
      string,
      unknown
    >;
    expect(Object.fromEntries(docs)).toEqual({
      "books-settings/fontId": "eb-garamond",
      "books-settings/fontSizePct": 130,
      "books-settings/columnMode": "double",
      "books-settings/themeOverride": "sepia",
      "books-settings/customThemeBackground": "#112233",
      "books-settings/customThemeText": "#ddeeff",
      "books-settings/customThemeTransparent": true,
      "books-settings/chineseScript": "traditional",
      "books-settings/textLayout": "vertical",
      "books-settings/lineHeight": 1.8,
      "books-settings/gutterPx": 32,
      "books-settings/speechRate": 1.2,
    });
  });

  test("apply updates every reader preference", async () => {
    await SYNC_CODECS["books-settings"].apply(
      [
        { k: "books-settings/fontId", v: "sans", t },
        { k: "books-settings/fontSizePct", v: 140, t },
        { k: "books-settings/columnMode", v: "single", t },
        { k: "books-settings/themeOverride", v: "custom", t },
        { k: "books-settings/customThemeBackground", v: "#123", t },
        { k: "books-settings/customThemeText", v: "#ABCDEF", t },
        { k: "books-settings/customThemeTransparent", v: true, t },
        { k: "books-settings/chineseScript", v: "simplified", t },
        { k: "books-settings/textLayout", v: "vertical", t },
        { k: "books-settings/lineHeight", v: 1.7, t },
        { k: "books-settings/gutterPx", v: 48, t },
        { k: "books-settings/speechRate", v: 1.5, t },
      ],
      ctx
    );

    expect(useBooksStore.getState().settings).toEqual({
      fontId: "sans",
      fontSizePct: 140,
      columnMode: "single",
      themeOverride: "custom",
      // Synced colors are normalized to lowercase #rrggbb.
      customThemeBackground: "#112233",
      customThemeText: "#abcdef",
      customThemeTransparent: true,
      chineseScript: "simplified",
      textLayout: "vertical",
      lineHeight: 1.7,
      gutterPx: 48,
      speechRate: 1.5,
    });
  });

  test("apply clamps line spacing from older app versions into range", async () => {
    await SYNC_CODECS["books-settings"].apply(
      [{ k: "books-settings/lineHeight", v: 1.1, t }],
      ctx
    );

    expect(useBooksStore.getState().settings.lineHeight).toBe(1.5);
  });

  test("apply ignores malformed values and tombstones", async () => {
    await SYNC_CODECS["books-settings"].apply(
      [
        { k: "books-settings/fontId", v: "", t },
        { k: "books-settings/fontSizePct", v: 1_000, t },
        { k: "books-settings/columnMode", v: "triple", t },
        { k: "books-settings/themeOverride", v: "neon", t },
        { k: "books-settings/customThemeBackground", v: "papayawhip", t },
        { k: "books-settings/customThemeText", v: 0x112233, t },
        { k: "books-settings/customThemeTransparent", v: "yes", t },
        { k: "books-settings/chineseScript", v: "translated", t },
        { k: "books-settings/textLayout", v: "diagonal", t },
        { k: "books-settings/lineHeight", v: -1, t },
        { k: "books-settings/gutterPx", v: 1_000, t },
        { k: "books-settings/speechRate", v: 99, t },
        { k: "books-settings/fontId", del: true, t },
      ],
      ctx
    );

    expect(useBooksStore.getState().settings).toEqual(DEFAULT_BOOKS_SETTINGS);
  });

  test("subscription scopes dirty work to changed settings", () => {
    const changes: string[][] = [];
    const unsubscribe = SYNC_CODECS["books-settings"].subscribe((keys) => {
      changes.push(keys ? [...keys] : []);
    });

    try {
      useBooksStore.getState().updateSettings({
        fontSizePct: 120,
        themeOverride: "custom",
        customThemeBackground: "#101820",
        textLayout: "vertical",
        gutterPx: 40,
      });
      expect(changes).toEqual([
        [
          "books-settings/fontSizePct",
          "books-settings/themeOverride",
          "books-settings/customThemeBackground",
          "books-settings/textLayout",
          "books-settings/gutterPx",
        ],
      ]);
    } finally {
      unsubscribe();
    }
  });
});

describe("bookshelf sync engine wiring (stale-reject re-upload)", () => {
  beforeEach(() => {
    useBooksStore.setState({
      progressByPath: {},
      pinnedTop: [],
      pinnedBottom: [],
      lastOpenedPath: null,
    } as never);
    useCloudSyncStore.setState({
      autoSyncEnabled: true,
      syncBooks: true,
    });
  });

  test("rejecting a stale remote op re-marks the namespace dirty and leaves the shadow != local", async () => {
    const key = "bookshelf/progress:/Books/a.epub";
    const localProgress = {
      cfi: "epubcfi(/8)",
      percentage: 0.9,
      updatedAt: 100,
    };
    useBooksStore.setState({ progressByPath: { "/Books/a.epub": localProgress } } as never);

    const engine = await CloudSyncEngine.create(
      `bookshelf-eng-${crypto.randomUUID()}`
    );
    try {
      // A lagging device wins the HLC race with stale progress (updatedAt 50).
      await engine.applyRemoteOps([
        {
          k: key,
          v: { cfi: "epubcfi(/2)", percentage: 0.1, updatedAt: 50 },
          t,
        },
      ]);

      // Local newer progress is kept.
      expect(
        useBooksStore.getState().progressByPath["/Books/a.epub"].percentage
      ).toBe(0.9);

      const state = (engine as unknown as { state: SyncClientState }).state;
      // The namespace is re-marked dirty so the next flush re-collects it.
      expect(state.dirtyNamespaces).toContain("bookshelf");
      // The shadow differs from the (winning) local value, so the flush diff
      // will re-upload the local progress and re-converge peers.
      expect(state.getShadow(key)?.h).not.toBe(hashDoc(localProgress));
    } finally {
      await engine.stop();
    }
  });

  test("applying a newer remote op updates the shadow and does not re-mark dirty", async () => {
    const key = "bookshelf/progress:/Books/a.epub";
    useBooksStore.setState({
      progressByPath: {
        "/Books/a.epub": { cfi: "epubcfi(/8)", percentage: 0.4, updatedAt: 100 },
      },
    } as never);

    const engine = await CloudSyncEngine.create(
      `bookshelf-eng-${crypto.randomUUID()}`
    );
    try {
      const newer = {
        cfi: "epubcfi(/12)",
        percentage: 0.95,
        updatedAt: 200,
      };
      await engine.applyRemoteOps([{ k: key, v: newer, t }]);

      expect(
        useBooksStore.getState().progressByPath["/Books/a.epub"].percentage
      ).toBe(0.95);
      const state = (engine as unknown as { state: SyncClientState }).state;
      expect(state.dirtyNamespaces).not.toContain("bookshelf");
      // Shadow matches the applied remote value (no pending re-upload).
      expect(state.getShadow(key)?.h).toBe(hashDoc(newer));
    } finally {
      await engine.stop();
    }
  });
});

describe("settings codec", () => {
  test("collect emits one key per settings field (no bundled sections)", () => {
    const docs = SYNC_CODECS.settings.collect(ctx) as Map<string, unknown>;
    const keys = [...docs.keys()];
    expect(keys).toContain("settings/audio/masterVolume");
    expect(keys).toContain("settings/theme/current");
    expect(keys).toContain("settings/dashboard/widgets");
    expect(
      keys.some((k) => k === "settings/audio" || k === "settings/theme")
    ).toBe(false);
  });

  test("apply writes a per-field op onto the store", async () => {
    useAudioSettingsStore.setState({ masterVolume: 1 } as never);
    await SYNC_CODECS.settings.apply(
      [{ k: "settings/audio/masterVolume", v: 0.25, t }],
      ctx
    );
    expect(useAudioSettingsStore.getState().masterVolume).toBe(0.25);
  });

  test("concurrent edits to different fields both survive", async () => {
    useAudioSettingsStore.setState({ masterVolume: 1, uiVolume: 1 } as never);
    await SYNC_CODECS.settings.apply(
      [
        { k: "settings/audio/masterVolume", v: 0.3, t },
        { k: "settings/audio/uiVolume", v: 0.7, t },
      ],
      ctx
    );
    const state = useAudioSettingsStore.getState();
    expect(state.masterVolume).toBe(0.3);
    expect(state.uiVolume).toBe(0.7);
  });
});

describe("cloud sync store", () => {
  test("persist merge keeps all categories when persisted state is partial", () => {
    const merged = mergePersistedCloudSyncCategoryStatus({
      files: {
        lastUploadedAt: "2024-06-01T00:00:00.000Z",
        lastFetchedAt: null,
        lastAppliedRemoteAt: null,
        isUploading: true,
        isDownloading: false,
      },
    } as never);
    expect(merged.files.lastUploadedAt).toBe("2024-06-01T00:00:00.000Z");
    expect(merged.files.isUploading).toBe(false); // transient flags reset
    expect(merged.files.uploadProgress).toBeNull();
    expect(merged.files.downloadProgress).toBeNull();
    expect(merged.maps).toBeDefined();
    expect(merged.tv).toBeDefined();
  });

  test("category toggles round-trip through setCategoryEnabled", () => {
    const store = useCloudSyncStore.getState();
    store.setCategoryEnabled("tv", false);
    expect(useCloudSyncStore.getState().isCategoryEnabled("tv")).toBe(false);
    store.setCategoryEnabled("tv", true);
    expect(useCloudSyncStore.getState().isCategoryEnabled("tv")).toBe(true);
  });

  test("upload progress is clamped and cleared with upload activity", () => {
    const store = useCloudSyncStore.getState();
    store.markCategorySyncing("files", "upload", true);
    store.markCategoryUploadProgress("files", 41.6);
    expect(
      useCloudSyncStore.getState().categoryStatus.files.uploadProgress
    ).toBe(42);
    const roundedStatus = useCloudSyncStore.getState().categoryStatus;
    store.markCategoryUploadProgress("files", 42.4);
    expect(useCloudSyncStore.getState().categoryStatus).toBe(roundedStatus);

    store.markCategoryUploadProgress("files", 140);
    expect(
      useCloudSyncStore.getState().categoryStatus.files.uploadProgress
    ).toBe(100);

    store.markCategorySyncing("files", "upload", false);
    const status = useCloudSyncStore.getState().categoryStatus.files;
    expect(status.isUploading).toBe(false);
    expect(status.uploadProgress).toBeNull();
  });

  test("download progress is clamped and cleared with download activity", () => {
    const store = useCloudSyncStore.getState();
    store.markCategorySyncing("files", "download", true);
    store.markCategoryDownloadProgress("files", 58.4);
    expect(
      useCloudSyncStore.getState().categoryStatus.files.downloadProgress
    ).toBe(58);

    store.markCategoryDownloadProgress("files", -20);
    expect(
      useCloudSyncStore.getState().categoryStatus.files.downloadProgress
    ).toBe(0);

    store.markCategorySyncing("files", "download", false);
    const status = useCloudSyncStore.getState().categoryStatus.files;
    expect(status.isDownloading).toBe(false);
    expect(status.downloadProgress).toBeNull();
  });

  test("download item name is normalized and cleared with download activity", () => {
    const store = useCloudSyncStore.getState();
    store.markCategorySyncing("files", "download", true);
    store.markCategoryDownloadItem("files", "  photo.png  ");
    expect(
      useCloudSyncStore.getState().categoryStatus.files.downloadItemName
    ).toBe("photo.png");

    const unchangedStatus = useCloudSyncStore.getState().categoryStatus;
    store.markCategoryDownloadItem("files", "photo.png");
    expect(useCloudSyncStore.getState().categoryStatus).toBe(unchangedStatus);

    store.markCategoryDownloadItem("files", "   ");
    expect(
      useCloudSyncStore.getState().categoryStatus.files.downloadItemName
    ).toBeNull();

    store.markCategoryDownloadItem("files", "book.epub");
    store.markCategorySyncing("files", "download", false);
    expect(
      useCloudSyncStore.getState().categoryStatus.files.downloadItemName
    ).toBeNull();
  });

  test("sync status includes upload percentage when available", () => {
    const t = (key: string) => {
      const labels: Record<string, string> = {
        "apps.control-panels.autoSync.fetching": "Fetching",
        "apps.control-panels.autoSync.uploading": "Uploading",
        "apps.control-panels.autoSync.neverFetched": "Never fetched",
        "apps.control-panels.autoSync.neverUploaded": "Never uploaded",
      };
      return labels[key] || key;
    };

    expect(formatUploadingStatus(41.6, t)).toBe("Uploading 42%");
    expect(formatFetchingStatus(58.4, t)).toBe("Fetching 58%");
    expect(
      formatSyncStatus(
        {
          lastUploadedAt: null,
          lastFetchedAt: null,
          lastAppliedRemoteAt: null,
          isUploading: true,
          isDownloading: false,
          uploadProgress: 41.6,
        },
        t
      )
    ).toBe("Uploading 42% · Never fetched");
    expect(
      formatSyncStatus(
        {
          lastUploadedAt: null,
          lastFetchedAt: null,
          lastAppliedRemoteAt: null,
          isUploading: false,
          isDownloading: true,
          downloadProgress: 58.4,
        },
        t
      )
    ).toBe("Never uploaded · Fetching 58%");
  });
});

describe("cloud sync logging summaries", () => {
  test("summarizes ops without exposing keys or payloads", () => {
    const ops: SyncOp[] = [
      {
        k: "stickies/note:secret-note-id",
        v: { id: "secret-note-id", content: "private text" },
        t,
      },
      {
        k: "calendar/event:secret-event-id",
        del: true,
        t,
      },
    ];
    const summary = summarizeSyncOps(ops);

    expect(summary).toEqual({
      total: 2,
      upserts: 1,
      deletions: 1,
      namespaces: [
        { namespace: "calendar", total: 1, upserts: 0, deletions: 1 },
        { namespace: "stickies", total: 1, upserts: 1, deletions: 0 },
      ],
    });
    expect(JSON.stringify(summary)).not.toContain("secret-note-id");
    expect(JSON.stringify(summary)).not.toContain("private text");
    expect(JSON.stringify(summary)).not.toContain("secret-event-id");
  });

  test("summarizes dirty scopes by size only", () => {
    expect(summarizeDirtyScope(null)).toEqual({ scope: "full" });
    const summary = summarizeDirtyScope(
      new Set(["files/doc:/Private.md", "files/doc:/AlsoPrivate.md"])
    );
    expect(summary).toEqual({ scope: "keys", keyCount: 2 });
    expect(JSON.stringify(summary)).not.toContain("Private.md");
  });
});

describe("cloud sync engine resilience", () => {
  test("warm start with a cursor skips the full local reconciliation scan", async () => {
    const username = `sync-warm-${Date.now().toString(36)}`;
    localStorage.setItem(
      `ryos:sync2:state:${username}`,
      JSON.stringify({
        cursor: 7,
        lastHlc: null,
        shadow: {},
        dirty: [],
        localReconcileRequired: false,
      })
    );
    useCloudSyncStore.setState({
      autoSyncEnabled: true,
      syncStickies: true,
    });

    const requests: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input) => {
      requests.push(String(input instanceof Request ? input.url : input));
      return new Response(JSON.stringify({ ok: true, seq: 7, ops: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const engine = await CloudSyncEngine.create(username);
    try {
      await engine.start();
      const state = (engine as unknown as { state: SyncClientState }).state;
      expect(state.dirtyNamespaces).toEqual([]);
      expect(state.localReconcileRequired).toBe(false);
      expect(requests.some((url) => url.includes("/api/sync/v2/changes?since=7"))).toBe(true);
    } finally {
      await engine.stop();
      globalThis.fetch = originalFetch;
    }
  });

  test("local reconcile marker queues one startup scan and clears after flush", async () => {
    const username = `sync-reconcile-${Date.now().toString(36)}`;
    localStorage.setItem(
      `ryos:sync2:state:${username}`,
      JSON.stringify({
        cursor: 8,
        lastHlc: null,
        shadow: {},
        dirty: [],
        localReconcileRequired: false,
      })
    );
    await markSyncLocalReconcileRequired(username);
    useStickiesStore.setState({ notes: [] });
    useCloudSyncStore.setState({
      autoSyncEnabled: true,
      syncFiles: false,
      syncSettings: false,
      syncSongs: false,
      syncVideos: false,
      syncTv: false,
      syncStickies: true,
      syncCalendar: false,
      syncContacts: false,
      syncMaps: false,
      syncBooks: false,
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ ok: true, seq: 8, ops: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;

    const engine = await CloudSyncEngine.create(username);
    try {
      await engine.start();
      const state = (engine as unknown as { state: SyncClientState }).state;
      expect(state.localReconcileRequired).toBe(true);
      expect(state.dirtyNamespaces).toEqual(["stickies"]);

      await engine.flush();
      expect(state.dirtyNamespaces).toEqual([]);
      expect(state.localReconcileRequired).toBe(false);
    } finally {
      await engine.stop();
      globalThis.fetch = originalFetch;
    }
  });

  test("does not schedule a full upload scan after the initial pull fails", async () => {
    const username = `sync-failure-${Date.now().toString(36)}`;
    localStorage.setItem(
      `ryos:sync2:state:${username}`,
      JSON.stringify({
        cursor: 1,
        lastHlc: null,
        shadow: {},
        dirty: [],
      })
    );

    const originalFetch = globalThis.fetch;
    const originalConsoleError = console.error;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "unavailable" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;
    console.error = () => {};

    const engine = await CloudSyncEngine.create(username);
    try {
      await engine.start();
      const state = (engine as unknown as { state: SyncClientState }).state;
      expect(state.dirtyNamespaces).toEqual([]);
    } finally {
      await engine.stop();
      globalThis.fetch = originalFetch;
      console.error = originalConsoleError;
    }
  });

  test("treats an unavailable local sync API as a non-throwing result", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "unavailable" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;

    try {
      expect(await fetchAutoSyncPreferenceFromServer()).toEqual({ ok: false });
      expect(await persistAutoSyncPreferenceToServer(true)).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("requeues a partially sent namespace when the engine stops", async () => {
    const username = `sync-stop-${Date.now().toString(36)}`;
    useCloudSyncStore.setState({
      autoSyncEnabled: true,
      syncStickies: true,
    });
    useStickiesStore.setState({
      notes: Array.from({ length: 401 }, (_, index) => ({
        id: `note-${index}`,
        content: `note ${index}`,
      })) as never,
    });

    const originalFetch = globalThis.fetch;
    const engine = await CloudSyncEngine.create(username);
    globalThis.fetch = (async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as {
        ops: Array<{ k: string }>;
      };
      await engine.stop();
      return new Response(
        JSON.stringify({
          seq: body.ops.length,
          results: body.ops.map((op) => ({ k: op.k, accepted: true })),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    try {
      engine.markDirty("stickies");
      await engine.flush();
      const state = (engine as unknown as { state: SyncClientState }).state;
      expect(state.dirtyNamespaces).toContain("stickies");
    } finally {
      await engine.stop();
      globalThis.fetch = originalFetch;
      useStickiesStore.setState({ notes: [] });
    }
  });
});

describe("cloud sync blob downloads", () => {
  test("downloadBlobItem reports byte progress", async () => {
    const originalFetch = globalThis.fetch;
    const payload = { key: "book-1", value: { title: "Synced Book" } };
    const compressed = await gzipJson(payload);
    const progress: number[] = [];

    globalThis.fetch = (async () =>
      new Response(new Blob([compressed]), {
        status: 200,
        headers: { "content-length": String(compressed.byteLength) },
      })) as typeof fetch;

    try {
      const item = await downloadBlobItem("https://example.test/book.gz", {
        expectedBytes: compressed.byteLength,
        onProgress: (next) => progress.push(next.percentage),
      });

      expect(item).toEqual(payload);
      expect(progress[0]).toBe(0);
      expect(progress.at(-1)).toBe(100);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
