import "../../helpers/local-storage-stub";
import "fake-indexeddb/auto";
import { useCloudSyncStore } from "../../../src/stores/useCloudSyncStore";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { CloudSyncEngine } from "../../../src/sync/engine";
import { SyncClientState, hashDoc } from "../../../src/sync/state";
import { loadPersistedSyncState } from "../../../src/sync/stateStorage";
import type { SyncOp } from "../../../src/shared/sync2/types";

const originalFetch = globalThis.fetch;
let previousConfig = { autoSyncEnabled: false, syncFiles: true };
beforeEach(() => {
  const state = useCloudSyncStore.getState();
  previousConfig = { autoSyncEnabled: state.autoSyncEnabled, syncFiles: state.syncFiles };
  useCloudSyncStore.setState({ autoSyncEnabled: true, syncFiles: true });
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  useCloudSyncStore.setState(previousConfig);
});
const op: SyncOp = { k: "books/item:test", t: "01718180000000-0000-test", v: { blob: { url: "https://test/book", size: 4, sha256: "a".repeat(64) } } };

test("download jobs and cursor survive restart together and remain account scoped", async () => {
  const username = `queue-${crypto.randomUUID()}`;
  const first = await SyncClientState.open(username);
  first.queueDownload(op);
  first.setCursor(10);
  await first.persistNow();
  const next = await SyncClientState.open(username);
  expect(next.cursor).toBe(10);
  expect(next.pendingDownloads).toEqual([op]);
  expect((await SyncClientState.open(`${username}-other`)).pendingDownloads).toEqual([]);
  const newer = { ...op, t: "01718180000001-0000-test", del: true, v: undefined };
  next.queueDownload(newer);
  next.finishDownload(op);
  expect(next.pendingDownloads).toEqual([newer]);
  await next.persistNow();
  expect((await loadPersistedSyncState(username)).downloads?.[op.k]).toEqual(newer);
});

test("a lost commit response replays the exact operation after restart", async () => {
  const username = `outbox-${crypto.randomUUID()}`;
  const local: SyncOp = { k: "settings/theme", t: "01718180000000-0000-test", v: { current: "macosx" } };
  const state = await SyncClientState.open(username);
  state.setCursor(0);
  await state.setOutbox({ ops: [local], shadows: { [local.k]: { t: local.t, h: hashDoc(local.v) } } });
  const sent: unknown[] = [];
  let fail = true;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes("/changes")) return Response.json({ seq: 1, ops: [] });
    if (String(input).includes("/snapshot")) return Response.json({ seq: 1, entries: {} });
    if (!String(input).includes("/ops")) return Response.json({ directories: [], files: [], applets: [] });
    const body = JSON.parse(String(init?.body));
    sent.push(body.ops);
    if (fail) throw new Error("Connection lost after commit");
    return Response.json({ seq: 1, results: [{ k: local.k, accepted: false, winner: { t: local.t, v: local.v, seq: 1 } }] });
  }) as typeof fetch;
  const first = await CloudSyncEngine.create(username);
  const replay = (engine: CloudSyncEngine) => (engine as unknown as { replayOutbox(): Promise<void> }).replayOutbox();
  await expect(replay(first)).rejects.toThrow("Connection lost");
  await first.stop();
  fail = false;
  const next = await CloudSyncEngine.create(username);
  try {
    await replay(next);
    expect(sent.length).toBeGreaterThan(1);
    expect(sent.every(batch => JSON.stringify(batch) === JSON.stringify([local]))).toBe(true);
    const stored = await loadPersistedSyncState(username);
    expect(stored.outbox).toBeUndefined();
    expect(stored.shadow[local.k]).toEqual({ t: local.t, h: hashDoc(local.v) });
  } finally { await next.stop(); }
});

test("pending local file edits survive a pull and stale responses cannot resurrect deletions", async () => {
  const { useFilesStore } = await import("../../../src/stores/useFilesStore");
  const { SYNC_CODECS } = await import("../../../src/sync/codecs");
  const ready = SYNC_CODECS.files.isReady;
  const previousItems = useFilesStore.getState().items;
  SYNC_CODECS.files.isReady = () => true;
  useCloudSyncStore.setState({ syncFiles: true });
  const username = `overlay-${crypto.randomUUID()}`;
  const engine = await CloudSyncEngine.create(username);
  const state = (engine as unknown as { state: SyncClientState }).state;
  const path = "/Documents/pending.txt";
  const key = `files/item:${path}`;
  const original = { path, name: "pending.txt", uuid: "pending", isDirectory: false, type: "text", status: "active" as const, createdAt: 1, modifiedAt: 1 };
  const edited = { ...original, modifiedAt: 2, size: 123 };
  state.setShadow(key, { t: "01718180000000-0000-test", h: hashDoc(original) });
  state.markDirty("files");
  useFilesStore.setState({ items: { [path]: edited } });
  try {
    await engine.applyRemoteOps([{ k: key, t: "01718180000001-0000-test", v: { ...original, size: 999 } }]);
    expect(useFilesStore.getState().items[path]).toEqual(edited);
    state.clearDirty(["files"]);
    const deletedAt = "01718180000002-0000-test";
    await engine.applyRemoteOps([{ k: key, t: deletedAt, del: true }]);
    await engine.applyRemoteOps([{ k: key, t: "01718180000001-0000-test", v: original }]);
    expect(useFilesStore.getState().items[path]).toBeUndefined();
    state.setCursor(9);
    state.setCursor(4);
    expect(state.cursor).toBe(9);
    await state.persistNow();
    expect((await SyncClientState.open(username)).getLatestTimestamp(key)).toBe(deletedAt);
  } finally {
    await engine.stop();
    SYNC_CODECS.files.isReady = ready;
    useFilesStore.setState({ items: previousItems });
  }
});

test("stopping during a transfer leaves the job durable for the next session", async () => {
  const username = `abort-${crypto.randomUUID()}`;
  let started!: () => void;
  const transferStarted = new Promise<void>(resolve => { started = resolve; });
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) !== "https://test/book") return Response.json({});
    started();
    return new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    });
  }) as typeof fetch;
  const engine = await CloudSyncEngine.create(username);
  try {
    await engine.applyRemoteOps([op], { deferBlobs: true });
    const opening = engine.ensureBlobItemLocal("books", "test");
    await transferStarted;
    await engine.stop();
    expect(await opening).toBe(false);
    expect((await loadPersistedSyncState(username)).downloads?.[op.k]).toEqual(op);
  } finally { await engine.stop(); }
});
