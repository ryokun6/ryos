/**
 * MediaCore Phase 3 — unified library model + API.
 *
 * The unified `MediaItem` API must merge both physical libraries without
 * changing them, and the Cloud Sync v2 songs/videos wire format must remain
 * byte-identical to the pre-Phase-3 shape.
 */
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, test } from "bun:test";

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
};
if (!browserGlobals.localStorage) {
  Object.defineProperty(browserGlobals, "localStorage", {
    configurable: true,
    value: new MemoryStorage(),
    writable: true,
  });
}

const {
  trackToMediaItem,
  trackToVideoItem,
  videoToMediaItem,
} = await import("../src/shared/media/library");
const { useIpodStore } = await import("../src/stores/useIpodStore");
const { useVideoStore } = await import("../src/stores/useVideoStore");
const { getMediaLibraryItems, findMediaLibraryItem } = await import(
  "../src/stores/useMediaLibraryStore"
);
type Track = import("../src/shared/media/library").Track;

const track: Track = {
  id: "song1",
  url: "https://youtu.be/song1",
  title: "Song One",
  artist: "Artist A",
  album: "Album A",
  cover: "https://example.com/cover.jpg",
  lyricOffset: 250,
};

describe("media item converters", () => {
  test("trackToMediaItem keeps identity fields and tags kind=song", () => {
    expect(trackToMediaItem(track)).toEqual({
      id: "song1",
      url: "https://youtu.be/song1",
      title: "Song One",
      artist: "Artist A",
      kind: "song",
    });
  });

  test("videoToMediaItem tags kind=video", () => {
    expect(
      videoToMediaItem({ id: "v1", url: "u", title: "T", artist: "A" })
    ).toEqual({ id: "v1", url: "u", title: "T", artist: "A", kind: "video" });
  });

  test("trackToVideoItem matches the TV app's historical projection", () => {
    // Exact shape the MTV channel used to build via its local trackToVideo.
    expect(trackToVideoItem(track)).toEqual({
      id: "song1",
      url: "https://youtu.be/song1",
      title: "Song One",
      artist: "Artist A",
    });
  });
});

describe("unified library API", () => {
  beforeEach(() => {
    useIpodStore.setState({ tracks: [track] });
    useVideoStore.setState({
      videos: [{ id: "vid1", url: "https://youtu.be/vid1", title: "Video 1" }],
      currentVideoId: "vid1",
    });
  });

  test("getMediaLibraryItems merges both libraries with kind tags", () => {
    const items = getMediaLibraryItems();
    expect(items.map((i) => `${i.kind}:${i.id}`)).toEqual([
      "song:song1",
      "video:vid1",
    ]);
  });

  test("getMediaLibraryItems filters by kind", () => {
    expect(getMediaLibraryItems("song").map((i) => i.id)).toEqual(["song1"]);
    expect(getMediaLibraryItems("video").map((i) => i.id)).toEqual(["vid1"]);
  });

  test("findMediaLibraryItem resolves across libraries", () => {
    expect(findMediaLibraryItem("song1")?.kind).toBe("song");
    expect(findMediaLibraryItem("vid1")?.kind).toBe("video");
    expect(findMediaLibraryItem("missing")).toBeNull();
  });
});

describe("sync wire format is unchanged", () => {
  test("songs and videos codecs emit the exact pre-Phase-3 keys and payloads", async () => {
    const { SYNC_CODECS } = await import("../src/sync/codecs");
    const songsCodec = SYNC_CODECS.songs;
    const videosCodec = SYNC_CODECS.videos;

    useIpodStore.setState({
      tracks: [track],
      libraryState: "loaded",
      lastKnownVersion: 7,
    });
    useVideoStore.setState({
      videos: [{ id: "vid1", url: "https://youtu.be/vid1", title: "Video 1" }],
    });

    const songDocs = songsCodec.collect();
    expect(JSON.stringify(songDocs.get("songs/track:song1"))).toBe(
      JSON.stringify(track)
    );
    expect(songDocs.get("songs/lib")).toEqual({
      libraryState: "loaded",
      lastKnownVersion: 7,
      order: ["song1"],
    });

    const videoDocs = videosCodec.collect();
    expect(JSON.stringify(videoDocs.get("videos/video:vid1"))).toBe(
      JSON.stringify({
        id: "vid1",
        url: "https://youtu.be/vid1",
        title: "Video 1",
      })
    );
    expect(videoDocs.get("videos/lib")).toEqual({ order: ["vid1"] });
  });
});
