import { afterAll, describe, expect, test } from "bun:test";
import { createRedis } from "../api/_utils/redis";
import {
  writeSongsState,
  readSongsState,
  getSongLibraryMetaKey,
  getSongLibraryTrackKey,
  type SongsSnapshotData,
} from "../api/_utils/song-library-state";

/**
 * Server-side round-trip tests for songs sync deletion tombstones.
 *
 * Regression: writeSongsState used to drop `deletedTrackIds`, so a deleted
 * track could resurrect during a multi-client conflict merge (the client
 * downloaded a snapshot with no tombstones and re-added the track).
 *
 * Requires a live Redis (REDIS_KV_REST_API_URL / _TOKEN in env).
 */

const redis = createRedis();
const username = `tombstone-test-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

function track(id: string) {
  return {
    id,
    url: `https://www.youtube.com/watch?v=${id}`,
    title: `Song ${id}`,
  };
}

async function cleanup() {
  const keys = [
    getSongLibraryMetaKey(username),
    getSongLibraryTrackKey(username, "A"),
    getSongLibraryTrackKey(username, "B"),
    getSongLibraryTrackKey(username, "C"),
  ];
  await redis.del(...(keys as [string, ...string[]]));
}

afterAll(async () => {
  await cleanup();
});

describe("songs sync deletion tombstones (server round-trip)", () => {
  test("a deleted track's tombstone survives the server round-trip", async () => {
    // Initial library: A + B, no tombstones.
    await writeSongsState(redis, username, {
      tracks: [track("A"), track("B")],
      libraryState: "loaded",
      lastKnownVersion: 1,
      deletedTrackIds: {},
    });

    // Client deletes B: uploads tracks=[A] with a tombstone for B.
    const ts = new Date().toISOString();
    await writeSongsState(redis, username, {
      tracks: [track("A")],
      libraryState: "loaded",
      lastKnownVersion: 2,
      deletedTrackIds: { B: ts },
    });

    const read = await readSongsState(redis, username);
    expect(read).not.toBeNull();
    const data = read!.data as SongsSnapshotData;
    expect(data.tracks.map((t) => t.id)).toEqual(["A"]);
    // The fix: the tombstone is echoed back so a stale client cannot resurrect B.
    expect(data.deletedTrackIds?.B).toBe(ts);
  });

  test("partial server-side writers (AI tools) preserve existing tombstones", async () => {
    // Continue from previous state (tombstone for B exists). Simulate the AI
    // "add song" tool, which calls writeSongsState WITHOUT deletedTrackIds.
    await writeSongsState(redis, username, {
      tracks: [track("A"), track("C")],
      libraryState: "loaded",
      lastKnownVersion: 3,
    } as SongsSnapshotData);

    const read = await readSongsState(redis, username);
    const data = read!.data as SongsSnapshotData;
    expect(data.tracks.map((t) => t.id).sort()).toEqual(["A", "C"]);
    // B's tombstone must NOT be wiped by a partial write.
    expect(data.deletedTrackIds?.B).toBeTruthy();
  });

  test("re-adding a track clears its tombstone (present track is not deleted)", async () => {
    // Client re-adds B and (per useAutoCloudSync) clears its tombstone:
    // uploads tracks=[A,B,C] with an explicit deletedTrackIds that omits B.
    await writeSongsState(redis, username, {
      tracks: [track("A"), track("B"), track("C")],
      libraryState: "loaded",
      lastKnownVersion: 4,
      deletedTrackIds: {},
    });

    const read = await readSongsState(redis, username);
    const data = read!.data as SongsSnapshotData;
    expect(data.tracks.map((t) => t.id).sort()).toEqual(["A", "B", "C"]);
    expect(data.deletedTrackIds?.B).toBeUndefined();
  });

  test("a present track in the snapshot strips a stale tombstone for the same id", async () => {
    // Defensive: even if a snapshot lists B as both present AND tombstoned,
    // the present track wins (mirrors the client's clear-on-add).
    await writeSongsState(redis, username, {
      tracks: [track("A"), track("B")],
      libraryState: "loaded",
      lastKnownVersion: 5,
      deletedTrackIds: { B: new Date().toISOString() },
    });

    const read = await readSongsState(redis, username);
    const data = read!.data as SongsSnapshotData;
    expect(data.tracks.map((t) => t.id).sort()).toEqual(["A", "B"]);
    expect(data.deletedTrackIds?.B).toBeUndefined();
  });
});
