import { describe, expect, test } from "bun:test";
import {
  applyListenQueueCommand,
  type ListenQueueActor,
  type ListenQueueItem,
  type ListenQueueSessionState,
} from "../../../src/shared/listen/queue";
import {
  DJ_STALE_FOR_LIBRARY_FALLBACK_MS,
  TRACK_END_LEAD_MS,
  TRACK_END_MEMBER_GRACE_MS,
  clampTrackDurationMs,
  decideTrackAdvance,
  extrapolatedPositionMs,
  incomingSyncIsStaleAdvance,
  type TrackAdvancePlayback,
} from "../../../src/shared/listen/trackAdvance";

const host: ListenQueueActor = {
  username: "host",
  clientInstanceId: "host-client",
};
const guest: ListenQueueActor = {
  username: "guest",
  clientInstanceId: "guest-client",
};

const playing = "dQw4w9WgXcQ";
const queuedId = "abcdefghijk";

function item(entryId: string, trackId: string): ListenQueueItem {
  return {
    entryId,
    trackId,
    title: trackId,
    requestedBy: "host",
    addedAt: 1,
  };
}

function playback(overrides: Partial<TrackAdvancePlayback> = {}): TrackAdvancePlayback {
  return {
    currentTrackId: playing,
    positionMs: 180_000,
    isPlaying: true,
    lastSyncAt: 1_000_000,
    durationMs: 180_000,
    queueLength: 1,
    ...overrides,
  };
}

function room(overrides: Partial<ListenQueueSessionState> = {}): ListenQueueSessionState {
  return {
    users: [
      { username: host.username, clientInstanceId: host.clientInstanceId },
      { username: guest.username, clientInstanceId: guest.clientInstanceId },
    ],
    djUsername: host.username,
    djClientInstanceId: host.clientInstanceId,
    queue: [item("entryid01", queuedId)],
    queueVersion: 2,
    currentTrackId: playing,
    positionMs: 180_000,
    isPlaying: true,
    lastSyncAt: 1_000_000,
    currentTrackDurationMs: 180_000,
    ...overrides,
  };
}

describe("track end position", () => {
  test("extrapolates only while playing", () => {
    const now = 1_000_000 + 4_000;
    expect(extrapolatedPositionMs(playback(), now)).toBe(184_000);
    expect(
      extrapolatedPositionMs(playback({ isPlaying: false, positionMs: 12_000 }), now)
    ).toBe(12_000);
  });

  test("clamps duration to a positive finite length", () => {
    expect(clampTrackDurationMs(0)).toBeUndefined();
    expect(clampTrackDurationMs(-1)).toBeUndefined();
    expect(clampTrackDurationMs(Number.NaN)).toBeUndefined();
    expect(clampTrackDurationMs(181.4)).toBe(181);
    expect(clampTrackDurationMs(99 * 60 * 60 * 1000)).toBe(4 * 60 * 60 * 1000);
  });
});

describe("decideTrackAdvance", () => {
  test("the DJ may end the current song immediately and pop the queue", () => {
    expect(
      decideTrackAdvance({
        actorIsDj: true,
        endedTrackId: playing,
        now: 1_000_000,
        playback: playback(),
      })
    ).toEqual({ kind: "pop-queue" });
  });

  test("a member cannot end the song until the shared clock plus grace", () => {
    const tooSoon = decideTrackAdvance({
      actorIsDj: false,
      endedTrackId: playing,
      now: playback().lastSyncAt + 1_000,
      playback: playback(),
    });
    expect(tooSoon).toEqual({ kind: "deny", error: "not_due" });

    const due = decideTrackAdvance({
      actorIsDj: false,
      endedTrackId: playing,
      now:
        playback().lastSyncAt +
        TRACK_END_LEAD_MS +
        TRACK_END_MEMBER_GRACE_MS,
      playback: playback({ positionMs: playback().durationMs! - TRACK_END_LEAD_MS }),
    });
    expect(due).toEqual({ kind: "pop-queue" });
  });

  test("a second report for a track that already moved on is already advanced", () => {
    expect(
      decideTrackAdvance({
        actorIsDj: true,
        endedTrackId: playing,
        now: 2_000_000,
        playback: playback({ currentTrackId: queuedId }),
      })
    ).toEqual({ kind: "already-advanced" });
  });

  test("an empty queue is a library fallback, stale only after the claim window", () => {
    const fresh = decideTrackAdvance({
      actorIsDj: false,
      endedTrackId: playing,
      now: playback().lastSyncAt + TRACK_END_MEMBER_GRACE_MS + 1,
      playback: playback({
        queueLength: 0,
        positionMs: 180_000,
        durationMs: 180_000,
      }),
    });
    expect(fresh).toEqual({ kind: "library-fallback", djStale: false });

    const stale = decideTrackAdvance({
      actorIsDj: true,
      endedTrackId: playing,
      now: playback().lastSyncAt + DJ_STALE_FOR_LIBRARY_FALLBACK_MS,
      playback: playback({ queueLength: 0 }),
    });
    expect(stale).toEqual({ kind: "library-fallback", djStale: true });
    expect(DJ_STALE_FOR_LIBRARY_FALLBACK_MS).toBe(30_000);
  });
});

describe("applyListenQueueCommand song end", () => {
  test("one ended-track report pops the queue and a second does not", () => {
    const first = applyListenQueueCommand(
      room(),
      host,
      { op: "advance", endedTrackId: playing },
      1_000_000
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.advanced).toBe(true);
    expect(first.currentTrackId).toBe(queuedId);
    expect(first.queue).toEqual([]);

    const second = applyListenQueueCommand(
      room({
        queue: first.queue,
        queueVersion: first.queueVersion,
        currentTrackId: first.currentTrackId,
      }),
      guest,
      { op: "advance", endedTrackId: playing },
      1_003_000
    );
    expect(second).toMatchObject({
      ok: true,
      advanced: false,
      alreadyAdvanced: true,
      queue: [],
    });
  });

  test("a member report before the grace period does not pop", () => {
    const result = applyListenQueueCommand(
      room(),
      guest,
      { op: "advance", endedTrackId: playing },
      1_000_000
    );
    expect(result).toEqual({ ok: false, status: 409, error: "not_due" });
  });

  test("manual skip stays DJ-only", () => {
    const result = applyListenQueueCommand(room(), guest, { op: "advance" }, 1_000_000);
    expect(result).toEqual({ ok: false, status: 403, error: "not_dj" });
  });

  test("an empty queue asks the playback device for the library next song", () => {
    const result = applyListenQueueCommand(
      room({ queue: [] }),
      host,
      { op: "advance", endedTrackId: playing },
      1_000_000
    );
    expect(result).toMatchObject({
      ok: true,
      advanced: false,
      libraryFallback: true,
      djStale: false,
      queue: [],
    });
  });

  test("a repeated end for the same track does not fall through twice", () => {
    const again = applyListenQueueCommand(
      room({ queue: [], acceptedEndTrackId: playing }),
      guest,
      { op: "advance", endedTrackId: playing },
      1_010_000
    );
    expect(again).toMatchObject({
      ok: true,
      advanced: false,
      alreadyAdvanced: true,
    });
  });
});

describe("incomingSyncIsStaleAdvance", () => {
  test("keeps a queue advance that landed while a DJ heartbeat was in flight", () => {
    expect(
      incomingSyncIsStaleAdvance({
        loadedTrackId: playing,
        djTrackId: playing,
        latestTrackId: queuedId,
        loadedSyncAt: 10,
        latestSyncAt: 11,
      })
    ).toBe(true);
    expect(
      incomingSyncIsStaleAdvance({
        loadedTrackId: playing,
        djTrackId: queuedId,
        latestTrackId: queuedId,
        loadedSyncAt: 10,
        latestSyncAt: 11,
      })
    ).toBe(false);
  });
});
