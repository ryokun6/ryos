import { describe, expect, test } from "bun:test";
import { useMediaLibraryStore } from "../../../src/stores/useMediaLibraryStore";
import { useIpodStore } from "../../../src/stores/useIpodStore";

describe("useMediaLibraryStore facade", () => {
  test("shares the same Zustand state as useIpodStore", () => {
    expect(useMediaLibraryStore.getState()).toBe(useIpodStore.getState());
  });

  test("reads tracks from the iPod store implementation", () => {
    useIpodStore.setState({
      tracks: [
        {
          id: "track-1",
          title: "Track One",
          url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        },
      ],
    });

    expect(
      useMediaLibraryStore.getState().tracks.map((track) => track.id)
    ).toEqual(["track-1"]);
  });
});
