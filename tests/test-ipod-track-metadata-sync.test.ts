import { describe, expect, test } from "bun:test";
import {
  hasFetchedTrackMetadataChanges,
  hasLibraryTrackMetadataChanges,
  resolveSyncedCoverColor,
} from "../src/stores/ipodTrackMetadataSync";

describe("iPod track metadata sync", () => {
  test("ignores coverColor-only differences for library update checks", () => {
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
      coverColor: "#222222",
    };

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
      coverColor: "#222222",
    };

    expect(hasLibraryTrackMetadataChanges(current, server)).toBe(true);
    expect(resolveSyncedCoverColor(current, server)).toBe("#111111");
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

  test("ignores fetched coverColor-only differences for user track metadata", () => {
    const current = {
      title: "User Song",
      cover: "https://example.com/cover.jpg",
      coverColor: "#111111",
    };
    const fetched = {
      coverColor: "#222222",
    };

    expect(hasFetchedTrackMetadataChanges(current, fetched)).toBe(false);
    expect(resolveSyncedCoverColor(current, fetched)).toBe("#111111");
  });
});
