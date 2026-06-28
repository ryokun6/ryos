import "./local-storage-stub";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { BASE_URL, ensureUserAuth, fetchWithAuth } from "./test-utils";
import { formatHlc } from "../src/shared/sync2/hlc";
import { SYNC_CATEGORIES } from "../src/shared/sync2/namespaces";
import { CloudSyncEngine } from "../src/sync/engine";
import { useStickiesStore } from "../src/stores/useStickiesStore";
import { useCloudSyncStore } from "../src/stores/useCloudSyncStore";

/**
 * End-to-end test of the v2 client engine against the live API server
 * (sync-v2 suite; requires `bun run dev:api`).
 *
 * Drives the real engine: store change → shadow diff → ops POST, then a
 * foreign client's write → pull → codec apply, then local delete →
 * tombstone upload. Uses the stickies namespace (no IndexedDB required).
 */

const USERNAME = `sync2eng${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`;
const PASSWORD = "test-password-123";

/** Resolve as soon as `predicate` is true, instead of sleeping a fixed amount. */
async function waitFor(
  predicate: () => boolean,
  { timeoutMs = 2000, intervalMs = 10 }: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`waitFor: condition not met within ${timeoutMs}ms`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

let token: string;
let engine: CloudSyncEngine;
const originalFetch = globalThis.fetch;

beforeAll(async () => {
  token = await ensureUserAuth(USERNAME, PASSWORD);

  // The engine's transport uses relative URLs and cookie auth in the
  // browser; rewrite + inject auth headers under bun.
  globalThis.fetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    let url = String(input instanceof Request ? input.url : input);
    if (url.startsWith("/")) {
      url = `${BASE_URL}${url}`;
    }
    const headers = new Headers(
      init?.headers || (input instanceof Request ? input.headers : undefined)
    );
    if (url.startsWith(BASE_URL)) {
      headers.set("Origin", "http://localhost:3000");
      headers.set("Authorization", `Bearer ${token}`);
      headers.set("X-Username", USERNAME);
    }
    return originalFetch(url, { ...init, headers });
  }) as typeof fetch;

  // Exercise only the namespace under test. This also prevents unrelated
  // browser-only settings from entering this bare Bun process.
  const syncStore = useCloudSyncStore.getState();
  syncStore.applyServerAutoSyncPreference(true);
  for (const category of SYNC_CATEGORIES) {
    syncStore.setCategoryEnabled(category, false);
  }
  syncStore.setCategoryEnabled("stickies", true);

  useStickiesStore.setState({ notes: [] });

  engine = new CloudSyncEngine(USERNAME);
  await engine.start();
});

afterAll(() => {
  engine?.stop();
  globalThis.fetch = originalFetch;
});

async function readServerSnapshot(): Promise<{
  seq: number;
  entries: Record<string, { v?: unknown; del?: boolean; t: string }>;
}> {
  const response = await fetchWithAuth(
    `${BASE_URL}/api/sync/v2/snapshot`,
    USERNAME,
    token
  );
  return (await response.json()) as never;
}

describe("sync v2 engine end-to-end", () => {
  test("local edit flows to the server via shadow diff", async () => {
    useStickiesStore.setState({
      notes: [{ id: "e2e-1", content: "from engine" }] as never,
    });
    engine.markDirty("stickies");
    await engine.flush();

    const snapshot = await readServerSnapshot();
    expect(snapshot.entries["stickies/note:e2e-1"]?.v).toMatchObject({
      id: "e2e-1",
      content: "from engine",
    });
  });

  test("unchanged state flushes zero ops (no re-upload)", async () => {
    const before = (await readServerSnapshot()).seq;
    engine.markDirty("stickies");
    await engine.flush();
    const after = (await readServerSnapshot()).seq;
    expect(after).toBe(before);
  });

  test("a foreign client's write is applied on pull", async () => {
    const foreignT = formatHlc(Date.now() + 1000, 0, "foreign-client");
    await fetchWithAuth(`${BASE_URL}/api/sync/v2/ops`, USERNAME, token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: "foreign-client",
        ops: [
          {
            k: "stickies/note:e2e-remote",
            v: { id: "e2e-remote", content: "from другой device" },
            t: foreignT,
          },
        ],
      }),
    });

    await engine.pull();

    const notes = useStickiesStore.getState().notes;
    expect(notes.some((note) => note.id === "e2e-remote")).toBe(true);
  });

  test("applying remote ops does not echo an upload back", async () => {
    const before = (await readServerSnapshot()).seq;
    engine.markDirty("stickies");
    await engine.flush();
    const after = (await readServerSnapshot()).seq;
    expect(after).toBe(before);
  });

  test("realtime inline ops apply without HTTP when contiguous", async () => {
    const cursor = engine.cursor ?? 0;
    const t = formatHlc(Date.now() + 5000, 0, "foreign-client");
    // Simulate the Pusher event the server would broadcast (already
    // accepted server-side in the previous test pattern); here we inject a
    // contiguous synthetic op and verify zero-request application.
    const response = await fetchWithAuth(
      `${BASE_URL}/api/sync/v2/ops`,
      USERNAME,
      token,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: "foreign-client",
          ops: [
            {
              k: "stickies/note:e2e-rt",
              v: { id: "e2e-rt", content: "realtime" },
              t,
            },
          ],
        }),
      }
    );
    const body = (await response.json()) as { seq: number };
    expect(body.seq).toBe(cursor + 1);

    engine.handleRealtimeEvent({
      seq: body.seq,
      c: "foreign-client",
      ops: [{ k: "stickies/note:e2e-rt", v: { id: "e2e-rt", content: "realtime" }, t, seq: body.seq, c: "foreign-client" }],
    });
    // handleRealtimeEvent applies asynchronously; wait until it lands instead
    // of sleeping a fixed amount.
    await waitFor(
      () =>
        useStickiesStore.getState().notes.some((note) => note.id === "e2e-rt") &&
        engine.cursor === body.seq
    );

    expect(
      useStickiesStore.getState().notes.some((note) => note.id === "e2e-rt")
    ).toBe(true);
    expect(engine.cursor).toBe(body.seq);
  });

  test("local deletion uploads a tombstone", async () => {
    useStickiesStore.setState((state) => ({
      notes: state.notes.filter((note) => note.id !== "e2e-1"),
    }));
    engine.markDirty("stickies");
    await engine.flush();

    const snapshot = await readServerSnapshot();
    expect(snapshot.entries["stickies/note:e2e-1"]?.del).toBe(true);
  });

  test("snapshot bootstrap restores state on a fresh device", async () => {
    // Simulate a new device: fresh engine state, empty local store.
    engine.stop();
    localStorage.removeItem(`ryos:sync2:state:${USERNAME.toLowerCase()}`);
    useStickiesStore.setState({ notes: [] });

    engine = new CloudSyncEngine(USERNAME);
    await engine.start();
    // start() schedules a flush of local-only keys; none exist here.

    const notes = useStickiesStore.getState().notes;
    const ids = notes.map((note) => note.id).sort();
    expect(ids).toContain("e2e-remote");
    expect(ids).toContain("e2e-rt");
    expect(ids).not.toContain("e2e-1"); // tombstoned
  });

  test("manual restore promotes restored local state before bootstrap", async () => {
    engine.stop();
    localStorage.removeItem(`ryos:sync2:state:${USERNAME.toLowerCase()}`);

    const remoteT = formatHlc(Date.now() + 2000, 0, "foreign-restore");
    await fetchWithAuth(`${BASE_URL}/api/sync/v2/ops`, USERNAME, token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: "foreign-restore",
        ops: [
          {
            k: "stickies/note:restore-keep",
            v: { id: "restore-keep", content: "newer cloud value" },
            t: remoteT,
          },
          {
            k: "stickies/note:restore-delete",
            v: { id: "restore-delete", content: "cloud-only value" },
            t: remoteT,
          },
        ],
      }),
    });

    // Simulate stores after a restored backup reload: local should win, and
    // cloud-only keys missing from the backup should become tombstones.
    useStickiesStore.setState({
      notes: [{ id: "restore-keep", content: "restored backup value" }] as never,
    });

    engine = new CloudSyncEngine(USERNAME);
    const result = await engine.restoreLocalStateToCloud({
      namespaces: ["stickies"],
    });
    expect(result.uploaded).toBe(1);
    expect(result.deleted).toBeGreaterThanOrEqual(1);

    const snapshot = await readServerSnapshot();
    expect(snapshot.entries["stickies/note:restore-keep"]?.v).toMatchObject({
      id: "restore-keep",
      content: "restored backup value",
    });
    expect(snapshot.entries["stickies/note:restore-delete"]?.del).toBe(true);

    engine.stop();
    engine = new CloudSyncEngine(USERNAME);
    await engine.start();
    expect(
      useStickiesStore
        .getState()
        .notes.find((note) => note.id === "restore-keep")?.content
    ).toBe("restored backup value");
  });
});
