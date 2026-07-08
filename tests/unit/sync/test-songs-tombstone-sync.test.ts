import { describe, expect, jest, test } from "bun:test";
import type { Redis } from "../../../api/_utils/redis";
import {
  writeSongsState,
  readSongsState,
} from "../../../api/_utils/song-library-state";
import { applySyncOps } from "../../../api/sync/v2/_core";
import { formatHlc } from "../../../src/shared/sync2/hlc";
import { FakeRedis } from "../../helpers/fake-redis";

/**
 * Songs deletion tombstone semantics on the v2 sync core.
 *
 * Regression target: a deleted track must not resurrect when another
 * client later uploads a stale copy. In v2 this is enforced by per-key
 * last-writer-wins — the tombstone's HLC beats any older track write.
 */

function track(id: string) {
  return {
    id,
    url: `https://www.youtube.com/watch?v=${id}`,
    title: `Song ${id}`,
  };
}

describe("songs sync deletion tombstones (v2 core)", () => {
  test("a deleted track stays deleted across reads", async () => {
    const redis = new FakeRedis() as unknown as Redis;
    const username = "tombstone-user";
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-06-28T07:23:15.661Z"));

    try {
      await writeSongsState(redis, username, {
        tracks: [track("A"), track("B")],
        libraryState: "loaded",
        lastKnownVersion: 1,
      });

      await writeSongsState(redis, username, {
        tracks: [track("A")],
        libraryState: "loaded",
        lastKnownVersion: 2,
      });

      const state = await readSongsState(redis, username);
      expect(state?.data.tracks.map((t) => t.id)).toEqual(["A"]);
    } finally {
      jest.useRealTimers();
    }
  });

  test("a stale client write cannot resurrect a deleted track", async () => {
    const redis = new FakeRedis() as unknown as Redis;
    const username = "tombstone-user-2";

    // Library starts with A + B (written at an old timestamp).
    const oldT = formatHlc(Date.now() - 60_000, 0, "client-old");
    await applySyncOps(
      redis,
      username,
      [
        { k: "songs/track:A", v: track("A"), t: oldT },
        { k: "songs/track:B", v: track("B"), t: oldT },
      ],
      "client-old",
      { trusted: true }
    );

    // Another device deletes B now.
    const deleteT = formatHlc(Date.now(), 0, "client-new");
    const deleteResult = await applySyncOps(
      redis,
      username,
      [{ k: "songs/track:B", del: true, t: deleteT }],
      "client-new",
      { trusted: true }
    );
    expect(deleteResult.results[0].accepted).toBe(true);

    // The stale device re-uploads B with its old timestamp: rejected, and
    // the winner returned inline is the tombstone.
    const staleResult = await applySyncOps(
      redis,
      username,
      [{ k: "songs/track:B", v: track("B"), t: oldT }],
      "client-old",
      { trusted: true }
    );
    expect(staleResult.results[0].accepted).toBe(false);
    expect(staleResult.results[0].winner?.del).toBe(true);

    const state = await readSongsState(redis, username);
    expect(state?.data.tracks.map((t) => t.id)).toEqual(["A"]);
  });

  test("re-adding a deleted track with a newer timestamp succeeds", async () => {
    const redis = new FakeRedis() as unknown as Redis;
    const username = "tombstone-user-3";

    await writeSongsState(redis, username, {
      tracks: [track("A"), track("B")],
      libraryState: "loaded",
      lastKnownVersion: 1,
    });
    await writeSongsState(redis, username, {
      tracks: [track("A")],
      libraryState: "loaded",
      lastKnownVersion: 2,
    });

    const newerT = formatHlc(Date.now() + 1000, 0, "client-new");
    const result = await applySyncOps(
      redis,
      username,
      [{ k: "songs/track:B", v: track("B"), t: newerT }],
      "client-new",
      { trusted: true }
    );
    expect(result.results[0].accepted).toBe(true);

    const state = await readSongsState(redis, username);
    expect(state?.data.tracks.map((t) => t.id).sort()).toEqual(["A", "B"]);
  });
});
