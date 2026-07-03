/**
 * Unit tests for the shared MediaCore transport module
 * (`src/shared/media/transport.ts`) — history strategies, shuffle pickers,
 * and the next/previous navigation decisions each store maps onto its state.
 */
import { describe, expect, test } from "bun:test";
import {
  IPOD_APPLE_MUSIC_NAVIGATION,
  IPOD_YOUTUBE_NAVIGATION,
  KARAOKE_NAVIGATION,
  appendHistory,
  computeNextNavigation,
  computePreviousNavigation,
  createTransportActions,
  dedupeAppendHistory,
  findMediaIndexById,
  pickRandomIdAvoidingCurrent,
  pickRandomIdAvoidingRecent,
} from "../src/shared/media/transport";
import type { ConfirmedPlaybackFields } from "../src/shared/media/confirmedPlayback";

const items = (...ids: string[]) => ids.map((id) => ({ id }));

describe("history strategies", () => {
  test("dedupeAppendHistory moves an existing entry to the end", () => {
    expect(dedupeAppendHistory(["a", "b", "c"], "a")).toEqual(["b", "c", "a"]);
  });

  test("dedupeAppendHistory caps at the history limit", () => {
    const long = Array.from({ length: 60 }, (_, i) => `t${i}`);
    const result = dedupeAppendHistory(long, "new");
    expect(result).toHaveLength(50);
    expect(result[result.length - 1]).toBe("new");
  });

  test("appendHistory keeps duplicates and caps at the limit", () => {
    expect(appendHistory(["a", "b"], "a")).toEqual(["a", "b", "a"]);
    expect(appendHistory(Array(55).fill("x"), "y")).toHaveLength(50);
  });
});

describe("findMediaIndexById", () => {
  test("returns -1 for null id or empty list", () => {
    expect(findMediaIndexById([], "a")).toBe(-1);
    expect(findMediaIndexById(items("a"), null)).toBe(-1);
    expect(findMediaIndexById(items("a", "b"), "missing")).toBe(-1);
  });

  test("finds the index by id", () => {
    expect(findMediaIndexById(items("a", "b", "c"), "b")).toBe(1);
  });
});

describe("shuffle pickers", () => {
  test("pickRandomIdAvoidingRecent prefers unplayed tracks", () => {
    // Only "c" is unplayed, so the pick is deterministic.
    const picked = pickRandomIdAvoidingRecent(
      items("a", "b", "c"),
      ["a", "b"],
      "a"
    );
    expect(picked).toBe("c");
  });

  test("pickRandomIdAvoidingRecent never repeats the current track when avoidable", () => {
    for (let i = 0; i < 20; i++) {
      expect(pickRandomIdAvoidingRecent(items("a", "b"), [], "a")).toBe("b");
    }
  });

  test("pickRandomIdAvoidingRecent returns the only track in a 1-item library", () => {
    expect(pickRandomIdAvoidingRecent(items("solo"), ["solo"], "solo")).toBe(
      "solo"
    );
  });

  test("pickRandomIdAvoidingCurrent avoids only the current track", () => {
    for (let i = 0; i < 20; i++) {
      expect(pickRandomIdAvoidingCurrent(items("a", "b"), "a")).toBe("b");
    }
    expect(pickRandomIdAvoidingCurrent([], "a")).toBeNull();
    expect(pickRandomIdAvoidingCurrent(items("a"), "a")).toBe("a");
  });
});

describe("computeNextNavigation", () => {
  const base = {
    items: items("a", "b", "c"),
    currentId: "a",
    loopCurrent: false,
    loopAll: true,
    isShuffled: false,
    history: [] as string[],
  };

  test("empty library yields an empty decision", () => {
    expect(
      computeNextNavigation({ ...base, items: [] }, IPOD_YOUTUBE_NAVIGATION)
    ).toEqual({ kind: "empty" });
  });

  test("sequential next advances", () => {
    const decision = computeNextNavigation(base, IPOD_YOUTUBE_NAVIGATION);
    expect(decision).toEqual({
      kind: "advance",
      id: "b",
      history: ["a"],
    });
  });

  test("iPod records history on sequential next; Karaoke does not", () => {
    const ipod = computeNextNavigation(base, IPOD_YOUTUBE_NAVIGATION);
    const karaoke = computeNextNavigation(base, KARAOKE_NAVIGATION);
    expect(ipod.kind === "advance" && ipod.history).toEqual(["a"]);
    expect(karaoke.kind === "advance" && karaoke.history).toEqual([]);
  });

  test("loopCurrent stays on the current item without recording history", () => {
    for (const strategy of [
      IPOD_YOUTUBE_NAVIGATION,
      IPOD_APPLE_MUSIC_NAVIGATION,
      KARAOKE_NAVIGATION,
    ]) {
      const decision = computeNextNavigation(
        { ...base, loopCurrent: true },
        strategy
      );
      expect(decision).toEqual({ kind: "advance", id: "a", history: [] });
    }
  });

  test("end of list with loopAll off stops on the last item", () => {
    const decision = computeNextNavigation(
      { ...base, currentId: "c", loopAll: false },
      IPOD_YOUTUBE_NAVIGATION
    );
    expect(decision).toEqual({ kind: "stop", id: "c" });
  });

  test("end of list with loopAll on wraps to the first item", () => {
    const decision = computeNextNavigation(
      { ...base, currentId: "c" },
      IPOD_YOUTUBE_NAVIGATION
    );
    expect(decision.kind === "advance" && decision.id).toBe("a");
  });

  test("unknown current id starts from the first item", () => {
    const decision = computeNextNavigation(
      { ...base, currentId: null },
      KARAOKE_NAVIGATION
    );
    expect(decision.kind === "advance" && decision.id).toBe("a");
  });

  test("shuffle picks via the strategy and records history", () => {
    const decision = computeNextNavigation(
      { ...base, items: items("a", "b"), isShuffled: true },
      KARAOKE_NAVIGATION
    );
    expect(decision).toEqual({ kind: "advance", id: "b", history: ["a"] });
  });
});

describe("computePreviousNavigation", () => {
  const base = {
    items: items("a", "b", "c"),
    currentId: "b",
    loopCurrent: false,
    loopAll: true,
    isShuffled: false,
    history: [] as string[],
  };

  test("sequential previous steps back and wraps at the start", () => {
    expect(
      computePreviousNavigation(base, IPOD_YOUTUBE_NAVIGATION)
    ).toEqual({ kind: "advance", id: "a", history: [] });
    expect(
      computePreviousNavigation(
        { ...base, currentId: "a" },
        IPOD_YOUTUBE_NAVIGATION
      )
    ).toEqual({ kind: "advance", id: "c", history: [] });
  });

  test("shuffle previous retraces and pops history", () => {
    const decision = computePreviousNavigation(
      { ...base, isShuffled: true, currentId: "c", history: ["a", "b"] },
      IPOD_YOUTUBE_NAVIGATION
    );
    expect(decision).toEqual({ kind: "advance", id: "b", history: ["a"] });
  });

  test("iPod skips a history entry equal to the current item; Karaoke accepts it", () => {
    const input = {
      ...base,
      items: items("a", "b"),
      isShuffled: true,
      currentId: "a",
      history: ["a"],
    };
    const ipod = computePreviousNavigation(input, IPOD_YOUTUBE_NAVIGATION);
    // Falls back to the shuffle picker (only "b" is available).
    expect(ipod).toEqual({ kind: "advance", id: "b", history: ["a"] });

    const karaoke = computePreviousNavigation(input, KARAOKE_NAVIGATION);
    expect(karaoke).toEqual({ kind: "advance", id: "a", history: [] });
  });

  test("shuffle without history: iPod YouTube goes sequential, Apple Music picks a shuffle id", () => {
    const input = { ...base, isShuffled: true, currentId: "b", history: [] };
    const youtube = computePreviousNavigation(input, IPOD_YOUTUBE_NAVIGATION);
    expect(youtube).toEqual({ kind: "advance", id: "a", history: [] });

    const appleMusic = computePreviousNavigation(
      { ...input, items: items("a", "b") },
      IPOD_APPLE_MUSIC_NAVIGATION
    );
    // Avoid-current picker with two items is deterministic.
    expect(appleMusic).toEqual({ kind: "advance", id: "a", history: [] });
  });

  test("empty library yields an empty decision", () => {
    expect(
      computePreviousNavigation({ ...base, items: [] }, KARAOKE_NAVIGATION)
    ).toEqual({ kind: "empty" });
  });
});

describe("createTransportActions", () => {
  const makeStore = () => {
    let state: ConfirmedPlaybackFields = {
      isPlaying: false,
      playbackRequested: false,
    };
    const set = (
      partial:
        | Partial<ConfirmedPlaybackFields>
        | ((s: ConfirmedPlaybackFields) => Partial<ConfirmedPlaybackFields>)
    ) => {
      const patch = typeof partial === "function" ? partial(state) : partial;
      state = { ...state, ...patch };
    };
    return { getState: () => state, set };
  };

  test("drives the confirm-playback lifecycle", () => {
    const store = makeStore();
    const actions = createTransportActions(store.set);

    actions.setIsPlaying(true);
    expect(store.getState()).toEqual({
      isPlaying: false,
      playbackRequested: true,
    });

    actions.confirmPlayback();
    expect(store.getState()).toEqual({
      isPlaying: true,
      playbackRequested: true,
    });

    actions.togglePlay();
    expect(store.getState()).toEqual({
      isPlaying: false,
      playbackRequested: false,
    });
  });
});
