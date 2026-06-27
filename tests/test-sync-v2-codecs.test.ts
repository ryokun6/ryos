import "./local-storage-stub";
import { beforeEach, describe, expect, test } from "bun:test";
import { SYNC_CODECS } from "../src/sync/codecs";
import { CloudSyncEngine } from "../src/sync/engine";
import { hashDoc, SyncClientState } from "../src/sync/state";
import { useStickiesStore } from "../src/stores/useStickiesStore";
import { useCalendarStore } from "../src/stores/useCalendarStore";
import { useVideoStore } from "../src/stores/useVideoStore";
import { useTvStore } from "../src/stores/useTvStore";
import { useIpodStore } from "../src/stores/useIpodStore";
import { useMapsStore } from "../src/stores/useMapsStore";
import { useBooksStore } from "../src/stores/useBooksStore";
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

  test("removeBook clears progress, ordering, and last-opened", () => {
    useBooksStore.setState({
      progressByPath: {
        "/Books/a.epub": { cfi: "epubcfi(/2)", percentage: 0.3, updatedAt: 10 },
        "/Books/b.epub": { cfi: "epubcfi(/4)", percentage: 0.6, updatedAt: 20 },
      },
      pinnedTop: ["/Books/a.epub"],
      pinnedBottom: ["/Books/a.epub"],
      lastOpenedPath: "/Books/a.epub",
    } as never);

    useBooksStore.getState().removeBook("/Books/a.epub");

    const state = useBooksStore.getState();
    expect(state.progressByPath["/Books/a.epub"]).toBeUndefined();
    expect(state.progressByPath["/Books/b.epub"]).toBeDefined();
    expect(state.pinnedTop).toEqual([]);
    expect(state.pinnedBottom).toEqual([]);
    expect(state.lastOpenedPath).toBeNull();

    // collect must stop emitting the removed book's progress doc so the engine
    // shadow-diff can tombstone it cross-device.
    const docs = SYNC_CODECS.bookshelf.collect(ctx) as Map<string, unknown>;
    expect(docs.has("bookshelf/progress:/Books/a.epub")).toBe(false);
    expect(docs.has("bookshelf/progress:/Books/b.epub")).toBe(true);
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
    const syncStore = useCloudSyncStore.getState();
    syncStore.applyServerAutoSyncPreference(true);
    syncStore.setCategoryEnabled("books", true);
  });

  test("rejecting a stale remote op re-marks the namespace dirty and leaves the shadow != local", async () => {
    const key = "bookshelf/progress:/Books/a.epub";
    const localProgress = {
      cfi: "epubcfi(/8)",
      percentage: 0.9,
      updatedAt: 100,
    };
    useBooksStore.setState({ progressByPath: { "/Books/a.epub": localProgress } } as never);

    const engine = new CloudSyncEngine(`bookshelf-eng-${Date.now().toString(36)}`);
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
      engine.stop();
    }
  });

  test("applying a newer remote op updates the shadow and does not re-mark dirty", async () => {
    const key = "bookshelf/progress:/Books/a.epub";
    useBooksStore.setState({
      progressByPath: {
        "/Books/a.epub": { cfi: "epubcfi(/8)", percentage: 0.4, updatedAt: 100 },
      },
    } as never);

    const engine = new CloudSyncEngine(`bookshelf-eng-${Date.now().toString(36)}`);
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
      engine.stop();
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
    expect(useCloudSyncStore.getState().categoryStatus.files.uploadProgress).toBe(
      41.6
    );

    store.markCategoryUploadProgress("files", 140);
    expect(useCloudSyncStore.getState().categoryStatus.files.uploadProgress).toBe(
      100
    );

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
    ).toBe(58.4);

    store.markCategoryDownloadProgress("files", -20);
    expect(
      useCloudSyncStore.getState().categoryStatus.files.downloadProgress
    ).toBe(0);

    store.markCategorySyncing("files", "download", false);
    const status = useCloudSyncStore.getState().categoryStatus.files;
    expect(status.isDownloading).toBe(false);
    expect(status.downloadProgress).toBeNull();
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
