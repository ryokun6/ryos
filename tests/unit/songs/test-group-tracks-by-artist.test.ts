import { describe, expect, test } from "bun:test";
import {
  getSortedArtistNames,
  groupTracksByArtist,
} from "@/utils/groupTracksByArtist";

describe("groupTracksByArtist", () => {
  test("groups by artist and preserves track index", () => {
    const tracks = [
      { artist: "B", id: "1" },
      { artist: "A", id: "2" },
      { artist: undefined, id: "3" },
    ];
    const grouped = groupTracksByArtist(tracks, "Unknown");
    expect(grouped.A).toEqual([{ track: tracks[1], index: 1 }]);
    expect(grouped.B).toEqual([{ track: tracks[0], index: 0 }]);
    expect(grouped.Unknown).toEqual([{ track: tracks[2], index: 2 }]);
    expect(getSortedArtistNames(grouped)).toEqual(["A", "B", "Unknown"]);
  });
});
