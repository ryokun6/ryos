import { describe, expect, test } from "bun:test";
import { createRedis } from "../api/_utils/redis";
import { generateAuthToken, storeToken } from "../api/_utils/auth";
import {
  BASE_URL,
  fetchWithAuth,
  fetchWithOrigin,
} from "./test-utils";

const TEST_USERNAME = `sync_auto_tester_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
let authTokenPromise: Promise<string | null> | null = null;

async function getAuthToken(): Promise<string | null> {
  if (!authTokenPromise) {
    authTokenPromise = (async () => {
      const redis = createRedis();
      const token = generateAuthToken();
      await storeToken(redis, TEST_USERNAME, token);
      return token;
    })();
  }

  return authTokenPromise;
}

function makeSyncVersion(
  clientId: string,
  clientVersion: number,
  baseServerVersion: number | null = null,
  knownClientVersions: Record<string, number> = {}
) {
  return {
    clientId,
    clientVersion,
    baseServerVersion,
    knownClientVersions,
  };
}

describe("auto cloud sync API", () => {

  test("GET /api/sync/auto requires authentication", async () => {
    const res = await fetchWithOrigin(`${BASE_URL}/api/sync/auto`);
    expect(res.status).toBe(401);
  });

  test("GET /api/sync/auto returns metadata map for authenticated users", async () => {
    const authToken = await getAuthToken();
    expect(authToken).toBeTruthy();

    const res = await fetchWithAuth(
      `${BASE_URL}/api/sync/auto`,
      TEST_USERNAME,
      authToken as string
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.metadata).toBeTruthy();
    expect(Object.keys(data.metadata).sort()).toEqual([
      "custom-wallpapers",
      "files-applets",
      "files-images",
      "files-trash",
    ]);
  });

  test("POST /api/sync/auto-token rejects invalid domains", async () => {
    const authToken = await getAuthToken();
    expect(authToken).toBeTruthy();

    const res = await fetchWithAuth(
      `${BASE_URL}/api/sync/auto-token`,
      TEST_USERNAME,
      authToken as string,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: "widgets" }),
      }
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect((data.error || "").toLowerCase()).toContain("domain");
  });

  test("POST /api/sync/auto-token accepts blob file domains", async () => {
    const authToken = await getAuthToken();
    expect(authToken).toBeTruthy();

    const res = await fetchWithAuth(
      `${BASE_URL}/api/sync/auto-token`,
      TEST_USERNAME,
      authToken as string,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: "files-images" }),
      }
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(typeof data.provider).toBe("string");
    expect(typeof data.uploadMethod).toBe("string");

    if (data.uploadMethod === "vercel-client-token") {
      expect(typeof data.clientToken).toBe("string");
      expect(data.clientToken.length).toBeGreaterThan(0);
      return;
    }

    expect(data.uploadMethod).toBe("presigned-put");
    expect(typeof data.uploadUrl).toBe("string");
    expect(data.uploadUrl.length).toBeGreaterThan(0);
    expect(typeof data.storageUrl).toBe("string");
    expect(data.storageUrl.startsWith("s3://")).toBe(true);
  });

  test("POST /api/sync/auto-token accepts individual item uploads for image sync", async () => {
    const authToken = await getAuthToken();
    expect(authToken).toBeTruthy();

    const res = await fetchWithAuth(
      `${BASE_URL}/api/sync/auto-token`,
      TEST_USERNAME,
      authToken as string,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: "files-images", itemKey: "asset-123" }),
      }
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(typeof data.pathname).toBe("string");
    expect(data.pathname).toContain("files-images/items/asset-123.gz");
  });

  test("POST /api/sync/auto-token allows large individual-item sync batches", async () => {
    const redis = createRedis();
    const username = `sync_auto_item_batch_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const authToken = generateAuthToken();
    await storeToken(redis, username, authToken);

    const statuses: number[] = [];
    for (let i = 0; i < 25; i += 1) {
      const res = await fetchWithAuth(
        `${BASE_URL}/api/sync/auto-token`,
        username,
        authToken,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            domain: "files-images",
            itemKey: `asset-${i}`,
          }),
        }
      );
      statuses.push(res.status);
    }

    expect(statuses.every((status) => status === 200)).toBe(true);
  });

  test("POST /api/sync/auto rejects missing metadata fields", async () => {
    const authToken = await getAuthToken();
    expect(authToken).toBeTruthy();

    const res = await fetchWithAuth(
      `${BASE_URL}/api/sync/auto`,
      TEST_USERNAME,
      authToken as string,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: "files-images" }),
      }
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect((data.error || "").toLowerCase()).toContain("missing");
  });

  test("POST /api/sync/auto stores empty individual manifests", async () => {
    const authToken = await getAuthToken();
    expect(authToken).toBeTruthy();

    const saveRes = await fetchWithAuth(
      `${BASE_URL}/api/sync/auto`,
      TEST_USERNAME,
      authToken as string,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: "custom-wallpapers",
          updatedAt: "2026-03-09T15:45:00.000Z",
          version: 1,
          syncVersion: makeSyncVersion("wallpapers-client-a", 1),
          totalSize: 0,
          items: {},
        }),
      }
    );

    expect(saveRes.status).toBe(200);
    const saveData = await saveRes.json();
    expect(saveData.metadata?.totalSize).toBe(0);
    expect(saveData.metadata?.syncVersion?.serverVersion).toBe(1);

    const downloadRes = await fetchWithAuth(
      `${BASE_URL}/api/sync/auto?domain=custom-wallpapers`,
      TEST_USERNAME,
      authToken as string
    );

    expect(downloadRes.status).toBe(200);
    const downloadData = await downloadRes.json();
    expect(downloadData.mode).toBe("individual");
    expect(downloadData.items).toEqual({});
    expect(downloadData.metadata?.totalSize).toBe(0);
  });

  test("POST /api/sync/auto preserves individual deletion markers", async () => {
    const authToken = await getAuthToken();
    expect(authToken).toBeTruthy();

    const saveRes = await fetchWithAuth(
      `${BASE_URL}/api/sync/auto`,
      TEST_USERNAME,
      authToken as string,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: "custom-wallpapers",
          updatedAt: "2026-03-12T16:30:00.000Z",
          version: 1,
          syncVersion: makeSyncVersion("wallpapers-client-b", 1),
          totalSize: 0,
          items: {},
          deletedItems: {
            "wallpaper-1": "2026-03-12T16:29:00.000Z",
          },
        }),
      }
    );

    expect(saveRes.status).toBe(200);

    const downloadRes = await fetchWithAuth(
      `${BASE_URL}/api/sync/auto?domain=custom-wallpapers`,
      TEST_USERNAME,
      authToken as string
    );

    expect(downloadRes.status).toBe(200);
    const downloadData = await downloadRes.json();
    expect(downloadData.deletedItems).toEqual({
      "wallpaper-1": "2026-03-12T16:29:00.000Z",
    });
  });

  test("POST /api/sync/auto merges individual deletion markers across writers", async () => {
    const redis = createRedis();
    const username = `sync_auto_tombstones_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const authToken = generateAuthToken();
    await storeToken(redis, username, authToken);

    const firstRes = await fetchWithAuth(
      `${BASE_URL}/api/sync/auto`,
      username,
      authToken,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: "custom-wallpapers",
          updatedAt: "2026-03-12T16:40:00.000Z",
          version: 1,
          syncVersion: makeSyncVersion("client-a", 1),
          totalSize: 0,
          items: {},
          deletedItems: {
            "wallpaper-1": "2026-03-12T16:39:00.000Z",
          },
        }),
      }
    );
    expect(firstRes.status).toBe(200);

    const secondRes = await fetchWithAuth(
      `${BASE_URL}/api/sync/auto`,
      username,
      authToken,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: "custom-wallpapers",
          updatedAt: "2026-03-12T16:41:00.000Z",
          version: 1,
          syncVersion: makeSyncVersion("client-b", 1, 1, { "client-a": 1 }),
          totalSize: 0,
          items: {},
        }),
      }
    );
    expect(secondRes.status).toBe(200);

    const downloadRes = await fetchWithAuth(
      `${BASE_URL}/api/sync/auto?domain=custom-wallpapers`,
      username,
      authToken
    );
    expect(downloadRes.status).toBe(200);
    const downloadData = await downloadRes.json();
    expect(downloadData.deletedItems).toEqual({
      "wallpaper-1": "2026-03-12T16:39:00.000Z",
    });
  });

  test("POST /api/sync/auto treats duplicate client versions as idempotent no-ops", async () => {
    const redis = createRedis();
    const username = `sync_auto_duplicate_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const authToken = generateAuthToken();
    await storeToken(redis, username, authToken);

    const firstRes = await fetchWithAuth(
      `${BASE_URL}/api/sync/auto`,
      username,
      authToken,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: "custom-wallpapers",
          updatedAt: "2026-03-12T17:00:00.000Z",
          version: 1,
          syncVersion: makeSyncVersion("client-a", 1),
          totalSize: 0,
          items: {},
        }),
      }
    );
    expect(firstRes.status).toBe(200);
    const firstJson = await firstRes.json();
    expect(firstJson.metadata.syncVersion.serverVersion).toBe(1);

    const duplicateRes = await fetchWithAuth(
      `${BASE_URL}/api/sync/auto`,
      username,
      authToken,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: "custom-wallpapers",
          updatedAt: "2026-03-12T17:00:01.000Z",
          version: 1,
          syncVersion: makeSyncVersion("client-a", 1),
          totalSize: 0,
          items: {},
        }),
      }
    );
    expect(duplicateRes.status).toBe(200);
    const duplicateJson = await duplicateRes.json();
    expect(duplicateJson.duplicate).toBe(true);
    expect(duplicateJson.metadata.syncVersion.serverVersion).toBe(1);
  });

  test("POST /api/sync/auto-token rejects redis-only domains", async () => {
    const authToken = await getAuthToken();
    expect(authToken).toBeTruthy();

    const res = await fetchWithAuth(
      `${BASE_URL}/api/sync/auto-token`,
      TEST_USERNAME,
      authToken as string,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: "files-metadata" }),
      }
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect((data.error || "").toLowerCase()).toContain("domain");
  });

  test("POST /api/sync/auto-token accepts item keys for files-trash", async () => {
    const authToken = await getAuthToken();
    expect(authToken).toBeTruthy();

    const res = await fetchWithAuth(
      `${BASE_URL}/api/sync/auto-token`,
      TEST_USERNAME,
      authToken as string,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: "files-trash", itemKey: "asset-123" }),
      }
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(typeof data.pathname).toBe("string");
    expect(data.pathname).toContain("files-trash/items/asset-123.gz");
  });
});
