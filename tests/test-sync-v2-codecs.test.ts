import "./local-storage-stub";
import { beforeEach, describe, expect, test } from "bun:test";
import { SYNC_CODECS } from "../src/sync/codecs";
import { useStickiesStore } from "../src/stores/useStickiesStore";
import { useCalendarStore } from "../src/stores/useCalendarStore";
import { useVideoStore } from "../src/stores/useVideoStore";
import { useTvStore } from "../src/stores/useTvStore";
import { useIpodStore } from "../src/stores/useIpodStore";
import { useMapsStore } from "../src/stores/useMapsStore";
import {
  mergePersistedCloudSyncCategoryStatus,
  useCloudSyncStore,
} from "../src/stores/useCloudSyncStore";

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
});
