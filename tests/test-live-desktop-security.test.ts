import { beforeAll, describe, expect, test } from "bun:test";
import { BASE_URL, ensureUserAuth, fetchWithAuth } from "./test-utils";

let hostUsername: string | null = null;
let hostToken: string | null = null;
let guestUsername: string | null = null;
let guestToken: string | null = null;
let sessionId: string | null = null;

async function setupUsers(): Promise<void> {
  const ts = Date.now();
  hostUsername = `livedesktophost${ts}`;
  guestUsername = `livedesktopguest${ts}`;

  hostToken = await ensureUserAuth(hostUsername, "testpassword123");
  guestToken = await ensureUserAuth(guestUsername, "testpassword123");
}

async function setupSession(): Promise<void> {
  if (!hostUsername || !hostToken) return;
  const res = await fetchWithAuth(
    `${BASE_URL}/api/live/sessions`,
    hostUsername,
    hostToken,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: hostUsername }),
    }
  );

  if (res.status === 201) {
    const data = await res.json();
    sessionId = data.session?.id ?? null;
  }
}

const buildSnapshotState = (operationId: string) => {
  const snapshot = {
    windows: [],
    foregroundHostInstanceId: null,
    timestamp: Date.now(),
  };

  return {
    snapshot,
    lastOperation: {
      id: operationId,
      type: "snapshot",
      snapshot,
    },
  };
};

describe("Live Desktop Security API", () => {
  beforeAll(async () => {
    await setupUsers();
    await setupSession();
  });

  test("Create session - username mismatch rejected", async () => {
    if (!hostUsername || !hostToken || !guestUsername) return;

    const res = await fetchWithAuth(
      `${BASE_URL}/api/live/sessions`,
      hostUsername,
      hostToken,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: guestUsername }),
      }
    );
    expect(res.status).toBe(403);
  });

  test("Join session - username mismatch rejected", async () => {
    if (!sessionId || !guestUsername || !guestToken || !hostUsername) return;

    const res = await fetchWithAuth(
      `${BASE_URL}/api/live/sessions/${sessionId}/join`,
      guestUsername,
      guestToken,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: hostUsername }),
      }
    );
    expect(res.status).toBe(403);
  });

  test("Join session - success", async () => {
    if (!sessionId || !guestUsername || !guestToken) return;

    const res = await fetchWithAuth(
      `${BASE_URL}/api/live/sessions/${sessionId}/join`,
      guestUsername,
      guestToken,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: guestUsername }),
      }
    );
    expect(res.status).toBe(200);
  });

  test("Sync session - username mismatch rejected", async () => {
    if (!sessionId || !hostUsername || !hostToken || !guestUsername) return;

    const res = await fetchWithAuth(
      `${BASE_URL}/api/live/sessions/${sessionId}/sync`,
      hostUsername,
      hostToken,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: guestUsername,
          state: buildSnapshotState("op-live-host-mismatch"),
        }),
      }
    );

    expect(res.status).toBe(403);
  });

  test("Sync session - non-host rejected", async () => {
    if (!sessionId || !guestUsername || !guestToken) return;

    const res = await fetchWithAuth(
      `${BASE_URL}/api/live/sessions/${sessionId}/sync`,
      guestUsername,
      guestToken,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: guestUsername,
          state: buildSnapshotState("op-live-guest-reject"),
        }),
      }
    );

    expect(res.status).toBe(403);
  });

  test("Sync session - host success", async () => {
    if (!sessionId || !hostUsername || !hostToken) return;

    const res = await fetchWithAuth(
      `${BASE_URL}/api/live/sessions/${sessionId}/sync`,
      hostUsername,
      hostToken,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: hostUsername,
          state: buildSnapshotState("op-live-host-success"),
        }),
      }
    );

    expect(res.status).toBe(200);
  });
});
