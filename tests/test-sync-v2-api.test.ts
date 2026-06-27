import { beforeAll, describe, expect, test } from "bun:test";
import {
  BASE_URL,
  ensureUserAuth,
  fetchWithAuth,
  fetchWithOrigin,
} from "./test-utils";
import { formatHlc } from "../src/shared/sync2/hlc";

/**
 * Cloud Sync v2 API integration tests (sync-v2 suite).
 * Requires the standalone API server (`bun run dev:api`).
 */

const USERNAME = `sync2test${Date.now().toString(36)}`;
const PASSWORD = "test-password-123";
const CLIENT_A = "client-a";
const CLIENT_B = "client-b";

let token: string;

const NOW = Date.now();
const t = (offsetMs: number, clientId = CLIENT_A) =>
  formatHlc(NOW + offsetMs, 0, clientId);

async function postOps(
  clientId: string,
  ops: unknown[],
  authToken = token
): Promise<Response> {
  return fetchWithAuth(`${BASE_URL}/api/sync/v2/ops`, USERNAME, authToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, ops }),
  });
}

beforeAll(async () => {
  token = await ensureUserAuth(USERNAME, PASSWORD);
});

describe("sync v2 API", () => {
  test("requires auth", async () => {
    const response = await fetchWithOrigin(`${BASE_URL}/api/sync/v2/changes?since=0`);
    expect([401, 403]).toContain(response.status);
  });

  test("uploads ops and reads them back via changes", async () => {
    const response = await postOps(CLIENT_A, [
      { k: "settings/theme", v: { current: "macosx" }, t: t(0) },
      { k: "stickies/note:api1", v: { id: "api1", content: "hello" }, t: t(1) },
    ]);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      seq: number;
      results: Array<{ k: string; accepted: boolean; seq?: number }>;
    };
    expect(body.ok).toBe(true);
    expect(body.results).toHaveLength(2);
    expect(body.results.every((r) => r.accepted)).toBe(true);

    const changes = await fetchWithAuth(
      `${BASE_URL}/api/sync/v2/changes?since=0`,
      USERNAME,
      token
    );
    expect(changes.status).toBe(200);
    const changesBody = (await changes.json()) as {
      ok: boolean;
      seq: number;
      ops: Array<{ k: string; v?: unknown; t: string; seq: number; c?: string }>;
    };
    expect(changesBody.seq).toBe(body.seq);
    const keys = changesBody.ops.map((op) => op.k);
    expect(keys).toContain("settings/theme");
    expect(keys).toContain("stickies/note:api1");
    expect(
      changesBody.ops.find((op) => op.k === "settings/theme")?.c
    ).toBe(CLIENT_A);
  });

  test("changes since the current cursor returns an empty list", async () => {
    const snapshot = await fetchWithAuth(
      `${BASE_URL}/api/sync/v2/snapshot`,
      USERNAME,
      token
    );
    const { seq } = (await snapshot.json()) as { seq: number };
    const changes = await fetchWithAuth(
      `${BASE_URL}/api/sync/v2/changes?since=${seq}`,
      USERNAME,
      token
    );
    const body = (await changes.json()) as { ops: unknown[] };
    expect(body.ops).toEqual([]);
  });

  test("LWW: an older write loses and receives the winner inline", async () => {
    const winner = await postOps(CLIENT_A, [
      { k: "settings/audio", v: { masterVolume: 1 }, t: t(5000) },
    ]);
    expect(winner.status).toBe(200);

    const loser = await postOps(CLIENT_B, [
      { k: "settings/audio", v: { masterVolume: 0 }, t: t(1000, CLIENT_B) },
    ]);
    expect(loser.status).toBe(200);
    const body = (await loser.json()) as {
      results: Array<{ accepted: boolean; winner?: { v?: { masterVolume?: number } } }>;
    };
    expect(body.results[0].accepted).toBe(false);
    expect(body.results[0].winner?.v?.masterVolume).toBe(1);
  });

  test("tombstones delete keys from the snapshot view", async () => {
    await postOps(CLIENT_A, [
      { k: "stickies/note:api-del", v: { id: "api-del" }, t: t(6000) },
    ]);
    await postOps(CLIENT_A, [
      { k: "stickies/note:api-del", del: true, t: t(7000) },
    ]);

    const snapshot = await fetchWithAuth(
      `${BASE_URL}/api/sync/v2/snapshot`,
      USERNAME,
      token
    );
    const body = (await snapshot.json()) as {
      entries: Record<string, { del?: boolean }>;
    };
    expect(body.entries["stickies/note:api-del"]?.del).toBe(true);
  });

  test("rejects malformed ops", async () => {
    const badKey = await postOps(CLIENT_A, [
      { k: "not-a-namespace/x", v: 1, t: t(0) },
    ]);
    expect(badKey.status).toBe(400);

    const badTimestamp = await postOps(CLIENT_A, [
      { k: "settings/theme", v: 1, t: "junk" },
    ]);
    expect(badTimestamp.status).toBe(400);

    const missingClient = await fetchWithAuth(
      `${BASE_URL}/api/sync/v2/ops`,
      USERNAME,
      token,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ops: [{ k: "settings/theme", v: 1, t: t(0) }] }),
      }
    );
    expect(missingClient.status).toBe(400);
  });

  test("blob endpoint prepares uploads and signs only own URLs", async () => {
    const sha256 = "ab".repeat(32);
    const response = await fetchWithAuth(
      `${BASE_URL}/api/sync/v2/blobs`,
      USERNAME,
      token,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          upload: [{ sha256, size: 1024 }],
          download: [
            `s3://bucket/sync/${USERNAME}/blobs/${sha256}.gz`,
            "s3://bucket/sync/someoneelse/blobs/x.gz",
          ],
        }),
      }
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      uploads?: Array<{ sha256: string; exists: boolean; upload?: unknown }>;
      downloads?: (string | null)[];
    };
    expect(body.ok).toBe(true);
    expect(body.uploads?.[0]?.sha256).toBe(sha256);
    expect(body.uploads?.[0]?.exists).toBe(false);
    expect(body.uploads?.[0]?.upload).toBeTruthy();
    // Own URL gets signed; foreign URLs are refused.
    expect(typeof body.downloads?.[0]).toBe("string");
    expect(body.downloads?.[1]).toBeNull();
  });

  test(
    "blob endpoint prepares a large descriptor batch within its function budget",
    async () => {
      const upload = Array.from({ length: 40 }, (_, index) => ({
        sha256: index.toString(16).padStart(64, "0"),
        size: 1024 + index,
      }));
      const response = await fetchWithAuth(
        `${BASE_URL}/api/sync/v2/blobs`,
        USERNAME,
        token,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ upload }),
        }
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        uploads?: Array<{ sha256: string }>;
      };
      expect(body.uploads).toHaveLength(upload.length);
      expect(body.uploads?.map((item) => item.sha256)).toEqual(
        upload.map((item) => item.sha256)
      );
    },
    15_000
  );

  test("sync maintenance cron rejects missing/invalid secrets", async () => {
    const noAuth = await fetchWithOrigin(`${BASE_URL}/api/cron/sync-maintenance`);
    // 401 invalid secret, or 503 when the server has no CRON_SECRET configured.
    expect([401, 503]).toContain(noAuth.status);

    const badAuth = await fetchWithOrigin(`${BASE_URL}/api/cron/sync-maintenance`, {
      headers: { Authorization: "Bearer wrong-secret" },
    });
    expect([401, 503]).toContain(badAuth.status);
  });

  // Visibly skipped (not a silent pass) when CRON_SECRET is not configured.
  test.skipIf(!process.env.CRON_SECRET?.trim())(
    "sync maintenance cron runs with a valid secret",
    async () => {
      const secret = process.env.CRON_SECRET!.trim();
      const response = await fetchWithOrigin(
        `${BASE_URL}/api/cron/sync-maintenance?maxUsers=2`,
        { headers: { Authorization: `Bearer ${secret}` } }
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        success: boolean;
        usersProcessed: number;
        scanComplete: boolean;
      };
      expect(body.success).toBe(true);
      expect(typeof body.usersProcessed).toBe("number");
      expect(typeof body.scanComplete).toBe("boolean");
    },
    // The cron walks the keyspace via many bounded SCAN round-trips; against a
    // large/shared Redis a single run can take ~30s, so allow generous margin.
    90000
  );

  test("ops referencing a blob register it for dedupe", async () => {
    const sha256 = "cd".repeat(32);
    const url = `s3://bucket/sync/${USERNAME}/blobs/${sha256}.gz`;
    await postOps(CLIENT_A, [
      {
        k: "images/item:blobtest",
        v: { blob: { url, size: 2048, sha256 } },
        t: t(8000),
      },
    ]);

    const response = await fetchWithAuth(
      `${BASE_URL}/api/sync/v2/blobs`,
      USERNAME,
      token,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upload: [{ sha256, size: 2048 }] }),
      }
    );
    const body = (await response.json()) as {
      uploads?: Array<{ exists: boolean; url?: string }>;
    };
    expect(body.uploads?.[0]?.exists).toBe(true);
    expect(body.uploads?.[0]?.url).toBe(url);
  });
});
