/**
 * End-to-end wiring test: the Soundboard store persists to IndexedDB instead of
 * localStorage (recorded audio is inline base64 that overflows localStorage's
 * quota). Verifies that a slice previously persisted to localStorage is
 * transparently migrated into IndexedDB on hydration, and that fresh writes
 * land in IndexedDB rather than localStorage.
 */

import "fake-indexeddb/auto";
import { describe, test, expect, beforeEach } from "bun:test";
import {
  resetPersistWritesForTests,
  settleAllPersistWrites,
} from "../../../src/utils/persistWriteQueue";

const SOUNDBOARD_KEY = "ryos:soundboard";

const resetDb = () =>
  new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase("ryOS");
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });

const makeBoard = (id: string, name: string) => ({
  id,
  name,
  slots: Array.from({ length: 9 }, () => ({
    audioData: null,
    emoji: undefined,
    title: undefined,
  })),
});

beforeEach(async () => {
  resetPersistWritesForTests();
  localStorage.clear();
  await resetDb();
});

describe("useSoundboardStore IndexedDB persistence", () => {
  test("migrates legacy localStorage boards into IndexedDB on hydration", async () => {
    const legacy = {
      state: {
        boards: [makeBoard("b1", "Legacy Board")],
        activeBoardId: "b1",
        selectedDeviceId: null,
        hasInitialized: true,
      },
      version: 1,
    };
    localStorage.setItem(SOUNDBOARD_KEY, JSON.stringify(legacy));

    const { useSoundboardStore } = await import(
      "../../../src/stores/useSoundboardStore"
    );
    // Re-run hydration through the IndexedDB adapter (covers the case where the
    // singleton store was already imported by an earlier test in the suite).
    await useSoundboardStore.persist.rehydrate();

    const state = useSoundboardStore.getState();
    expect(state.boards).toHaveLength(1);
    expect(state.boards[0].name).toBe("Legacy Board");

    // The legacy localStorage key is dropped (freeing quota); data now lives in
    // IndexedDB.
    expect(localStorage.getItem(SOUNDBOARD_KEY)).toBeNull();
  });

  test("new boards persist to IndexedDB, not localStorage", async () => {
    const { useSoundboardStore } = await import(
      "../../../src/stores/useSoundboardStore"
    );
    await useSoundboardStore.persist.rehydrate();

    useSoundboardStore.getState()._setBoards_internal([
      makeBoard("b2", "Recorded Board"),
    ]);

    // Settle the debounced write-behind queue (IndexedDB commit is async).
    await settleAllPersistWrites();

    // Nothing written to localStorage for this slice.
    expect(localStorage.getItem(SOUNDBOARD_KEY)).toBeNull();

    // Reading the raw IndexedDB record reflects the new board.
    const { ensureIndexedDBInitialized, STORES } = await import(
      "../../../src/utils/indexedDB"
    );
    const db = await ensureIndexedDBInitialized();
    const record = await new Promise<{
      state?: { boards?: Array<{ name: string }> };
    } | null>((resolve, reject) => {
      const tx = db.transaction(STORES.PERSISTED_STATE, "readonly");
      const req = tx.objectStore(STORES.PERSISTED_STATE).get(SOUNDBOARD_KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();

    expect(record?.state?.boards?.[0]?.name).toBe("Recorded Board");
  });

  test("stores recorded audio as a Blob row and restores runtime base64", async () => {
    const { useSoundboardStore } = await import(
      "../../../src/stores/useSoundboardStore"
    );
    await useSoundboardStore.persist.rehydrate();
    const board = makeBoard("audio-board", "Audio Board");
    board.slots[0].audioData = btoa("recorded audio bytes");
    board.slots[0].audioFormat = "webm";
    useSoundboardStore.getState()._setBoards_internal([board]);
    await settleAllPersistWrites();

    const { ensureIndexedDBInitialized, STORES } = await import(
      "../../../src/utils/indexedDB"
    );
    const db = await ensureIndexedDBInitialized();
    try {
      const row = await new Promise<Record<string, unknown>>(
        (resolve, reject) => {
          const req = db
            .transaction(STORES.SOUNDBOARD_AUDIO, "readonly")
            .objectStore(STORES.SOUNDBOARD_AUDIO)
            .get("audio-board:0");
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        }
      );
      expect(row.audio).toBeInstanceOf(Blob);
    } finally {
      db.close();
    }

    useSoundboardStore.setState({ boards: [] });
    resetPersistWritesForTests();
    await useSoundboardStore.persist.rehydrate();
    expect(useSoundboardStore.getState().boards[0]?.slots[0]?.audioData).toBe(
      btoa("recorded audio bytes")
    );
  });
});
