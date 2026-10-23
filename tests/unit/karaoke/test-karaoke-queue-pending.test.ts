import { describe, expect, test } from "bun:test";
import {
  mergeQueueWithPending,
  songIdToRestoreAfterQueueAdd,
  type PendingQueueItem,
} from "../../../src/apps/karaoke/queuePending";
import type { ListenQueueItem } from "../../../src/shared/listen/queue";

function queued(entryId: string, title: string): ListenQueueItem {
  return {
    entryId,
    trackId: "dQw4w9WgXcQ",
    title,
    artist: "Rick Astley",
    requestedBy: "ryo",
    addedAt: 1,
  };
}

function pending(
  localId: string,
  title: string,
  placement: "end" | "next"
): PendingQueueItem {
  return {
    localId,
    trackId: "abcdefghijk",
    title,
    artist: "Channel",
    requestedBy: "guest",
    placement,
  };
}

describe("songIdToRestoreAfterQueueAdd", () => {
  test("restores the song that was playing when a queue add retargets playback", () => {
    expect(
      songIdToRestoreAfterQueueAdd({
        pinnedSongId: "cornfield",
        currentSongId: "time",
        trackIds: ["time", "cornfield"],
      })
    ).toBe("cornfield");
  });

  test("leaves playback alone when it is still the pinned song or that song left the library", () => {
    expect(
      songIdToRestoreAfterQueueAdd({
        pinnedSongId: "cornfield",
        currentSongId: "cornfield",
        trackIds: ["time", "cornfield"],
      })
    ).toBeNull();
    expect(
      songIdToRestoreAfterQueueAdd({
        pinnedSongId: "cornfield",
        currentSongId: "time",
        trackIds: ["time"],
      })
    ).toBeNull();
    expect(
      songIdToRestoreAfterQueueAdd({
        pinnedSongId: null,
        currentSongId: "time",
        trackIds: ["time"],
      })
    ).toBeNull();
  });
});

describe("mergeQueueWithPending", () => {
  test("an empty queue shows the original title while the add is in flight", () => {
    const items = mergeQueueWithPending(
      [],
      [pending("pending-1", "Never Gonna Give You Up", "end")]
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe("Never Gonna Give You Up");
    expect(items[0]?.pending).toBe(true);
    expect(items[0]?.entryId).toBe("pending-1");
  });

  test("a resolved title replaces the placeholder title on the same local row", () => {
    const original = pending("pending-1", "search title", "end");
    const updated = { ...original, title: "Resolved Title", artist: "Resolved Artist" };
    const items = mergeQueueWithPending([], [updated]);
    expect(items[0]?.title).toBe("Resolved Title");
    expect(items[0]?.artist).toBe("Resolved Artist");
    expect(items[0]?.entryId).toBe("pending-1");
  });

  test("play-next placeholders lead the queue, newest first, and end placeholders follow it", () => {
    const items = mergeQueueWithPending(
      [queued("server-1", "Already queued")],
      [
        pending("pending-1", "First end", "end"),
        pending("pending-2", "First next", "next"),
        pending("pending-3", "Second end", "end"),
        pending("pending-4", "Second next", "next"),
      ]
    );
    expect(items.map((item) => item.title)).toEqual([
      "Second next",
      "First next",
      "Already queued",
      "First end",
      "Second end",
    ]);
    expect(items.filter((item) => item.pending).map((item) => item.entryId)).toEqual([
      "pending-4",
      "pending-2",
      "pending-1",
      "pending-3",
    ]);
  });

  test("dropping one placeholder leaves the others and does not match by track id", () => {
    const shared = pending("pending-1", "Same song", "end");
    const duplicate = { ...shared, localId: "pending-2" };
    const remaining = [duplicate].filter((item) => item.localId !== shared.localId);
    const items = mergeQueueWithPending(
      [queued("server-1", "Same song")],
      remaining
    );
    expect(items.map((item) => item.entryId)).toEqual(["server-1", "pending-2"]);
  });
});
