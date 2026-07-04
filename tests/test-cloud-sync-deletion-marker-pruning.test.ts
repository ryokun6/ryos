import "fake-indexeddb/auto";
import "./local-storage-stub";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  clearDeletionMarkersForKeys,
  pruneDeletionMarkersWithoutShadow,
} from "../src/sync/codecs";
import { CloudSyncEngine } from "../src/sync/engine";
import { SyncClientState } from "../src/sync/state";
import { getPersistedSyncShadowKeys } from "../src/sync/stateStorage";
import {
  createEmptyDeletionMarkers,
  useCloudSyncStore,
} from "../src/stores/useCloudSyncStore";
import { useStickiesStore } from "../src/stores/useStickiesStore";
import {
  resetPersistWritesForTests,
  settleAllPersistWrites,
} from "../src/utils/persistWriteQueue";

let engine: CloudSyncEngine | null = null;

beforeEach(() => {
  resetPersistWritesForTests();
  localStorage.clear();
  useCloudSyncStore.setState({
    autoSyncEnabled: true,
    syncStickies: true,
    deletionMarkers: createEmptyDeletionMarkers(),
  });
  useStickiesStore.setState({ notes: [] });
  resetPersistWritesForTests();
});

afterEach(async () => {
  await engine?.stop();
  engine = null;
  await settleAllPersistWrites();
});

describe("Cloud Sync deletion marker pruning", () => {
  test("prunes only markers absent from every persisted shadow", async () => {
    const otherUser = await SyncClientState.open(
      `marker-other-${crypto.randomUUID()}`
    );
    otherUser.setShadow("stickies/note:keep", {
      t: "01718180000000-0000-other",
      h: "keep-hash",
    });
    await otherUser.persistNow();
    localStorage.setItem(
      `ryos:sync2:state:marker-legacy-${crypto.randomUUID()}`,
      JSON.stringify({
        cursor: 1,
        lastHlc: null,
        shadow: {
          "stickies/note:legacy-keep": {
            t: "01718180000000-0000-legacy",
            h: "legacy-hash",
          },
        },
        dirty: [],
        localReconcileRequired: false,
      })
    );

    const store = useCloudSyncStore.getState();
    store.markDeletedKeys("stickyNoteIds", ["keep", "legacy-keep", "stale"]);

    const shadowKeys = await getPersistedSyncShadowKeys();
    expect(pruneDeletionMarkersWithoutShadow(shadowKeys)).toBe(1);
    expect(
      useCloudSyncStore.getState().deletionMarkers.stickyNoteIds
    ).toEqual({
      keep: expect.any(String),
      "legacy-keep": expect.any(String),
    });
  });

  test("clears recreated items in batches across marker buckets", () => {
    const store = useCloudSyncStore.getState();
    store.markDeletedKeys("stickyNoteIds", ["note-1", "note-2"]);
    store.markDeletedKeys("calendarEventIds", ["event-1"]);

    expect(
      clearDeletionMarkersForKeys([
        "stickies/note:note-1",
        "calendar/event:event-1",
      ])
    ).toBe(2);
    expect(
      useCloudSyncStore.getState().deletionMarkers.stickyNoteIds
    ).toEqual({
      "note-2": expect.any(String),
    });
    expect(
      useCloudSyncStore.getState().deletionMarkers.calendarEventIds
    ).toEqual({});
  });

  test("tolerates missing deletion marker buckets during flush cleanup", () => {
    useCloudSyncStore.setState({
      deletionMarkers: {
        stickyNoteIds: {
          "31efd9cc-87e3-4d09-b222-689674cafc54": "2026-07-04T04:12:00.000Z",
        },
      } as never,
    });

    expect(() =>
      clearDeletionMarkersForKeys([
        "stickies/note:31efd9cc-87e3-4d09-b222-689674cafc54",
        "maps/favorite:missing-bucket-id",
      ])
    ).not.toThrow();
    expect(
      useCloudSyncStore.getState().deletionMarkers.stickyNoteIds
    ).toEqual({});
  });

  test("remote convergence clears a matching local deletion marker", async () => {
    const store = useCloudSyncStore.getState();
    store.markDeletedKeys("stickyNoteIds", ["remote-delete"]);
    useStickiesStore.setState({
      notes: [{ id: "remote-delete", content: "remove me" }] as never,
    });
    engine = await CloudSyncEngine.create(
      `marker-engine-${crypto.randomUUID()}`
    );

    await engine.applyRemoteOps([
      {
        k: "stickies/note:remote-delete",
        del: true,
        t: "01718180000000-0000-remote",
        c: "remote-client",
      },
    ]);

    expect(useStickiesStore.getState().notes).toEqual([]);
    expect(
      useCloudSyncStore.getState().deletionMarkers.stickyNoteIds
    ).toEqual({});
  });

  test("remote recreation clears its stale deletion marker", async () => {
    useCloudSyncStore
      .getState()
      .markDeletedKeys("stickyNoteIds", ["remote-upsert"]);
    engine = await CloudSyncEngine.create(
      `marker-upsert-${crypto.randomUUID()}`
    );

    await engine.applyRemoteOps([
      {
        k: "stickies/note:remote-upsert",
        v: { id: "remote-upsert", content: "restored" },
        t: "01718180000000-0000-remote",
        c: "remote-client",
      },
    ]);

    expect(useStickiesStore.getState().notes[0]?.id).toBe("remote-upsert");
    expect(
      useCloudSyncStore.getState().deletionMarkers.stickyNoteIds
    ).toEqual({});
  });

  test("retains a marker still needed by another account shadow", async () => {
    const key = "stickies/note:shared-delete";
    const otherUser = await SyncClientState.open(
      `marker-shared-${crypto.randomUUID()}`
    );
    otherUser.setShadow(key, {
      t: "01718180000000-0000-other",
      h: "other-hash",
    });
    await otherUser.persistNow();

    useCloudSyncStore
      .getState()
      .markDeletedKeys("stickyNoteIds", ["shared-delete"]);
    useStickiesStore.setState({
      notes: [{ id: "shared-delete", content: "remove me" }] as never,
    });
    engine = await CloudSyncEngine.create(
      `marker-current-${crypto.randomUUID()}`
    );

    await engine.applyRemoteOps([
      {
        k: key,
        del: true,
        t: "01718180000000-0000-remote",
        c: "remote-client",
      },
    ]);

    expect(
      useCloudSyncStore.getState().deletionMarkers.stickyNoteIds[
        "shared-delete"
      ]
    ).toEqual(expect.any(String));
  });

  test("accepted local tombstones prune their markers", async () => {
    const key = "stickies/note:accepted-delete";
    useCloudSyncStore
      .getState()
      .markDeletedKeys("stickyNoteIds", ["accepted-delete"]);
    engine = await CloudSyncEngine.create(
      `marker-accepted-${crypto.randomUUID()}`
    );
    const state = (engine as unknown as { state: SyncClientState }).state;
    state.setShadow(key, {
      t: "01718180000000-0000-before",
      h: "before-hash",
    });
    await state.persistNow();

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          seq: 1,
          results: [{ k: key, accepted: true }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )) as typeof fetch;
    try {
      engine.markDirty("stickies");
      await engine.flush({ throwOnError: true });
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(state.getShadow(key)).toBeNull();
    expect(
      useCloudSyncStore.getState().deletionMarkers.stickyNoteIds
    ).toEqual({});
  });

  test("failed tombstone uploads retain their shadow and marker", async () => {
    const key = "stickies/note:failed-delete";
    useCloudSyncStore
      .getState()
      .markDeletedKeys("stickyNoteIds", ["failed-delete"]);
    engine = await CloudSyncEngine.create(
      `marker-failed-${crypto.randomUUID()}`
    );
    const state = (engine as unknown as { state: SyncClientState }).state;
    state.setShadow(key, {
      t: "01718180000000-0000-before",
      h: "before-hash",
    });
    await state.persistNow();

    const originalFetch = globalThis.fetch;
    const originalConsoleError = console.error;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "unavailable" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;
    console.error = () => undefined;
    try {
      engine.markDirty("stickies");
      await expect(
        engine.flush({ throwOnError: true })
      ).rejects.toBeInstanceOf(Error);
    } finally {
      globalThis.fetch = originalFetch;
      console.error = originalConsoleError;
    }

    expect(state.getShadow(key)).not.toBeNull();
    expect(
      useCloudSyncStore.getState().deletionMarkers.stickyNoteIds[
        "failed-delete"
      ]
    ).toEqual(expect.any(String));
  });
});
