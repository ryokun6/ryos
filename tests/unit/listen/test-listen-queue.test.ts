import { describe, expect, test } from "bun:test";
import {
  LISTEN_QUEUE_ADVANCE_LIMIT,
  LISTEN_QUEUE_ADVANCE_WINDOW_SECONDS,
  LISTEN_QUEUE_MAX_LENGTH,
  LISTEN_QUEUE_MUTATION_LIMIT,
  LISTEN_QUEUE_MUTATION_WINDOW_SECONDS,
  applyListenQueueCommand,
  normalizeListenSessionQueue,
  type ListenQueueActor,
  type ListenQueueItem,
  type ListenQueueSessionState,
} from "../../../src/shared/listen/queue";

const host: ListenQueueActor = {
  username: "host",
  clientInstanceId: "host-client",
};
const guest: ListenQueueActor = {
  username: "guest",
  clientInstanceId: "guest-client",
};
const outsider: ListenQueueActor = {
  username: "outsider",
  clientInstanceId: "outsider-client",
};

function item(partial: Partial<ListenQueueItem> & Pick<ListenQueueItem, "entryId" | "trackId">): ListenQueueItem {
  return {
    title: partial.title ?? partial.trackId,
    requestedBy: partial.requestedBy ?? "host",
    addedAt: partial.addedAt ?? 1,
    ...partial,
  };
}

function session(queue: ListenQueueItem[] = [], queueVersion = 0): ListenQueueSessionState {
  return {
    users: [
      { username: host.username, clientInstanceId: host.clientInstanceId },
      { username: guest.username, clientInstanceId: guest.clientInstanceId },
    ],
    djUsername: host.username,
    djClientInstanceId: host.clientInstanceId,
    queue,
    queueVersion,
  };
}

const track = "dQw4w9WgXcQ";
const entry = "entryid01";

describe("applyListenQueueCommand permissions", () => {
  test("any current member can add", () => {
    const result = applyListenQueueCommand(
      session(),
      guest,
      { op: "add", trackId: track, title: "Never Gonna", artist: "Rick", entryId: entry },
      10
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.queue).toHaveLength(1);
    expect(result.queue[0]?.requestedBy).toBe("guest");
    expect(result.queueVersion).toBe(1);
  });

  test("any member can bump and remove another member's song", () => {
    const queued = item({
      entryId: entry,
      trackId: track,
      title: "Host pick",
      requestedBy: "host",
    });
    const second = item({
      entryId: "entryid02",
      trackId: "abcdefghijk",
      requestedBy: "host",
    });
    const bumped = applyListenQueueCommand(
      session([queued, second], 3),
      guest,
      { op: "bump", entryId: second.entryId },
      20
    );
    expect(bumped.ok).toBe(true);
    if (!bumped.ok) return;
    expect(bumped.queue.map((row) => row.entryId)).toEqual([second.entryId, queued.entryId]);
    expect(bumped.queueVersion).toBe(4);

    const removed = applyListenQueueCommand(
      session(bumped.queue, bumped.queueVersion),
      guest,
      { op: "remove", entryId: queued.entryId },
      21
    );
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(removed.queue.map((row) => row.entryId)).toEqual([second.entryId]);
  });

  test("non-members are rejected for add, bump, remove, and advance", () => {
    const queued = item({ entryId: entry, trackId: track });
    const state = session([queued]);
    for (const command of [
      { op: "add" as const, trackId: track, title: "Nope", entryId: "entryid99" },
      { op: "bump" as const, entryId: entry },
      { op: "remove" as const, entryId: entry },
      { op: "advance" as const },
    ]) {
      const result = applyListenQueueCommand(state, outsider, command, 1);
      expect(result).toEqual({ ok: false, status: 403, error: "not_in_session" });
    }
  });

  test("a mismatched client instance is not a member", () => {
    const result = applyListenQueueCommand(
      session(),
      { username: guest.username, clientInstanceId: "other-tab" },
      { op: "add", trackId: track, title: "Song", entryId: entry },
      1
    );
    expect(result).toEqual({ ok: false, status: 403, error: "not_in_session" });
  });

  test("only the DJ can advance", () => {
    const queued = item({ entryId: entry, trackId: track, title: "Next", artist: "A" });
    const denied = applyListenQueueCommand(session([queued], 2), guest, { op: "advance" }, 1);
    expect(denied).toEqual({ ok: false, status: 403, error: "not_dj" });

    const advanced = applyListenQueueCommand(session([queued], 2), host, { op: "advance" }, 1);
    expect(advanced.ok).toBe(true);
    if (!advanced.ok) return;
    expect(advanced.advanced).toBe(true);
    expect(advanced.queue).toEqual([]);
    expect(advanced.currentTrackId).toBe(track);
    expect(advanced.queueVersion).toBe(3);
    expect(advanced.isPlaying).toBe(true);
    expect(advanced.positionMs).toBe(0);
  });

  test("empty advance does not change the version", () => {
    const result = applyListenQueueCommand(session([], 4), host, { op: "advance" }, 1);
    expect(result).toMatchObject({
      ok: true,
      changed: false,
      advanced: false,
      queueVersion: 4,
      queue: [],
    });
  });

  test("bumping the first item does not change the version", () => {
    const queued = item({ entryId: entry, trackId: track });
    const result = applyListenQueueCommand(
      session([queued], 5),
      guest,
      { op: "bump", entryId: entry },
      1
    );
    expect(result).toMatchObject({ ok: true, changed: false, queueVersion: 5 });
  });
});

describe("applyListenQueueCommand validation", () => {
  test("caps the queue and keeps the rate-limit constants", () => {
    expect(LISTEN_QUEUE_MAX_LENGTH).toBe(40);
    expect(LISTEN_QUEUE_MUTATION_LIMIT).toBe(30);
    expect(LISTEN_QUEUE_MUTATION_WINDOW_SECONDS).toBe(60);
    expect(LISTEN_QUEUE_ADVANCE_LIMIT).toBe(20);
    expect(LISTEN_QUEUE_ADVANCE_WINDOW_SECONDS).toBe(60);

    const full = Array.from({ length: LISTEN_QUEUE_MAX_LENGTH }, (_, index) =>
      item({
        entryId: `entry${String(index).padStart(4, "0")}`,
        trackId: track,
      })
    );
    const result = applyListenQueueCommand(
      session(full),
      guest,
      { op: "add", trackId: track, title: "One more", entryId: "entryoverflow" },
      1
    );
    expect(result).toEqual({ ok: false, status: 400, error: "queue_full" });
  });

  test("rejects a bad youtube id and a bad title", () => {
    expect(
      applyListenQueueCommand(
        session(),
        guest,
        { op: "add", trackId: "short", title: "Song", entryId: entry },
        1
      )
    ).toMatchObject({ ok: false, error: "invalid_track" });
    expect(
      applyListenQueueCommand(
        session(),
        guest,
        { op: "add", trackId: track, title: "   ", entryId: entry },
        1
      )
    ).toMatchObject({ ok: false, error: "invalid_title" });
  });

  test("the same song can be queued twice, and play next inserts at the front", () => {
    const first = applyListenQueueCommand(
      session(),
      host,
      { op: "add", trackId: track, title: "Once", entryId: "entryid01" },
      1
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = applyListenQueueCommand(
      { ...session(first.queue, first.queueVersion) },
      guest,
      { op: "addNext", trackId: track, title: "Twice", entryId: "entryid02" },
      2
    );
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.queue.map((row) => row.entryId)).toEqual(["entryid02", "entryid01"]);
  });
});

describe("normalizeListenSessionQueue", () => {
  test("missing queue becomes an empty list and bad rows are dropped", () => {
    const normalized = normalizeListenSessionQueue({
      id: "room",
      queue: [
        { entryId: entry, trackId: track, title: "Ok", requestedBy: "host", addedAt: 1 },
        { title: "missing ids" },
      ],
    });
    expect(normalized.queue).toEqual([
      { entryId: entry, trackId: track, title: "Ok", requestedBy: "host", addedAt: 1 },
    ]);
    expect(normalized.queueVersion).toBe(0);
    expect(normalizeListenSessionQueue({ id: "old" }).queue).toEqual([]);
  });
});
