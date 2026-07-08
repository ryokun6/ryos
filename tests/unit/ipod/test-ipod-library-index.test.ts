import { describe, expect, test } from "bun:test";
import type { Track } from "../../../src/shared/media/library";
import { useIpodStore } from "../../../src/stores/useIpodStore";
import {
  buildIpodLibraryIndex,
  resolveCurrentTrackIndex,
} from "../../../src/apps/ipod/utils/ipodLibraryIndex";

function track(id: string): Track {
  return {
    id,
    url: `https://example.com/${id}`,
    title: id,
  };
}

describe("iPod library index", () => {
  test("builds stable id lookups for tracks", () => {
    const first = track("a");
    const duplicate = { ...track("a"), title: "duplicate" };
    const second = track("b");

    const index = buildIpodLibraryIndex([first, duplicate, second]);

    expect(index.trackById.get("a")).toBe(first);
    expect(index.indexById.get("a")).toBe(0);
    expect(index.trackById.get("b")).toBe(second);
    expect(index.indexById.get("b")).toBe(2);
    expect(index.idSet.has("a")).toBe(true);
    expect(index.idSet.has("missing")).toBe(false);
  });

  test("resolves current indexes without rescanning the track array", () => {
    const index = buildIpodLibraryIndex([track("a"), track("b")]);

    expect(resolveCurrentTrackIndex(index.indexById, "b", 2)).toBe(1);
    expect(resolveCurrentTrackIndex(index.indexById, "missing", 2)).toBe(0);
    expect(resolveCurrentTrackIndex(index.indexById, null, 2)).toBe(0);
    expect(resolveCurrentTrackIndex(index.indexById, "a", 0)).toBe(-1);
  });
});

describe("iPod playback time setters", () => {
  test("ignore redundant sub-frame elapsed-time updates", () => {
    useIpodStore.setState({ elapsedTime: 10 });
    let elapsedTimeUpdates = 0;
    const unsubscribe = useIpodStore.subscribe((state, previousState) => {
      if (state.elapsedTime !== previousState.elapsedTime) elapsedTimeUpdates++;
    });

    useIpodStore.getState().setElapsedTime(10.01);
    expect(useIpodStore.getState().elapsedTime).toBe(10);
    expect(elapsedTimeUpdates).toBe(0);

    useIpodStore.getState().setElapsedTime(10.1);
    expect(useIpodStore.getState().elapsedTime).toBe(10.1);
    expect(elapsedTimeUpdates).toBe(1);

    unsubscribe();
  });
});
