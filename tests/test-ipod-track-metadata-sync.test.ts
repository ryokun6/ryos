import { describe, expect, test } from "bun:test";
import {
  hasCoverColorMetadataChange,
  hasFetchedTrackMetadataChanges,
  hasLibraryTrackMetadataChanges,
  resolveSyncedCoverColor,
} from "../src/stores/ipodTrackMetadataSync";

describe("iPod track metadata sync", () => {
  test("does not treat matching cover colors as library metadata changes", () => {
    const current = {
      id: "song-1",
      title: "Song",
      artist: "Artist",
      album: "Album",
      cover: "https://example.com/cover.jpg",
      coverColor: "#111111",
      url: "https://www.youtube.com/watch?v=song-1",
      lyricOffset: 500,
    };
    const server = {
      ...current,
      coverColor: "  #111111  ",
    };

    expect(hasCoverColorMetadataChange(current, server)).toBe(false);
    expect(hasLibraryTrackMetadataChanges(current, server)).toBe(false);
    expect(resolveSyncedCoverColor(current, server)).toBe("#111111");
  });

  test("does not treat missing remote coverColor as a library metadata change", () => {
    const current = {
      title: "Song",
      cover: "https://example.com/cover.jpg",
      coverColor: "#111111",
      url: "https://www.youtube.com/watch?v=song-1",
      lyricOffset: 500,
    };
    const server = {
      ...current,
      coverColor: undefined,
    };

    expect(hasCoverColorMetadataChange(current, server)).toBe(false);
    expect(hasLibraryTrackMetadataChanges(current, server)).toBe(false);
    expect(resolveSyncedCoverColor(current, server)).toBe("#111111");
  });

  test("still detects real metadata changes while preserving same-cover cached color", () => {
    const current = {
      title: "Song",
      artist: "Artist",
      album: "Album",
      cover: "https://example.com/cover.jpg",
      coverColor: "#111111",
      url: "https://www.youtube.com/watch?v=song-1",
      lyricOffset: 500,
    };
    const server = {
      ...current,
      title: "Song (Remastered)",
      coverColor: "#111111",
    };

    expect(hasLibraryTrackMetadataChanges(current, server)).toBe(true);
    expect(resolveSyncedCoverColor(current, server)).toBe("#111111");
  });

  test("uses remote coverColor when remote has a different synced value", () => {
    const current = {
      cover: "https://example.com/cover.jpg",
      coverColor: "#111111",
    };
    const server = {
      cover: "https://example.com/cover.jpg",
      coverColor: "#222222",
    };

    expect(hasCoverColorMetadataChange(current, server)).toBe(true);
    expect(hasLibraryTrackMetadataChanges(current, server)).toBe(true);
    expect(resolveSyncedCoverColor(current, server)).toBe("#222222");
  });

  test("uses server coverColor only when cover art changes", () => {
    const current = {
      cover: "https://example.com/old-cover.jpg",
      coverColor: "#111111",
    };
    const server = {
      cover: "https://example.com/new-cover.jpg",
      coverColor: "#222222",
    };

    expect(resolveSyncedCoverColor(current, server)).toBe("#222222");
  });

  test("uses fetched coverColor when user track metadata has a remote value", () => {
    const current = {
      title: "User Song",
      cover: "https://example.com/cover.jpg",
      coverColor: "#111111",
    };
    const fetched = {
      coverColor: "#222222",
    };

    expect(hasFetchedTrackMetadataChanges(current, fetched)).toBe(true);
    expect(resolveSyncedCoverColor(current, fetched)).toBe("#222222");
  });

  test("does not treat missing fetched coverColor as user track metadata change", () => {
    const current = {
      title: "User Song",
      cover: "https://example.com/cover.jpg",
      coverColor: "#111111",
    };
    const fetched = {
      title: "User Song",
    };

    expect(hasFetchedTrackMetadataChanges(current, fetched)).toBe(false);
    expect(resolveSyncedCoverColor(current, fetched)).toBe("#111111");
  });
});
