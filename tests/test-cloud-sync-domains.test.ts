import { describe, expect, test } from "bun:test";
import { createRedis } from "../api/_utils/redis";
import { generateAuthToken, storeToken } from "../api/_utils/auth";
import { BASE_URL, fetchWithAuth } from "./test-utils";

const TEST_USERNAME = `sync_domains_tester_${Date.now()}_${Math.floor(
  Math.random() * 1000
)}`;
let authTokenPromise: Promise<string> | null = null;

async function getAuthToken(): Promise<string> {
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

describe("logical cloud sync domain API", () => {
  test("GET /api/sync/domains returns logical domain metadata map", async () => {
    const authToken = await getAuthToken();

    const res = await fetchWithAuth(
      `${BASE_URL}/api/sync/domains`,
      TEST_USERNAME,
      authToken
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(Object.keys(data.metadata).sort()).toEqual([
      "calendar",
      "contacts",
      "files",
      "settings",
      "songs",
      "stickies",
      "videos",
    ]);
  });

  test("PUT /api/sync/domains/settings stores grouped settings writes and GET returns grouped parts", async () => {
    const authToken = await getAuthToken();

    const putRes = await fetchWithAuth(
      `${BASE_URL}/api/sync/domains/settings`,
      TEST_USERNAME,
      authToken,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          writes: {
            settings: {
              domain: "settings",
              updatedAt: "2026-03-15T12:00:00.000Z",
              version: 1,
              syncVersion: makeSyncVersion("settings-client", 1),
              data: {
                theme: "macosx",
                language: "en",
              },
            },
            "custom-wallpapers": {
              domain: "custom-wallpapers",
              updatedAt: "2026-03-15T12:05:00.000Z",
              version: 1,
              syncVersion: makeSyncVersion("wallpaper-client", 1),
              totalSize: 0,
              items: {},
            },
          },
        }),
      }
    );

    expect(putRes.status).toBe(200);
    const putJson = await putRes.json();
    expect(putJson.ok).toBe(true);
    expect(putJson.domain).toBe("settings");
    expect(putJson.metadata.updatedAt).toBe("2026-03-15T12:05:00.000Z");

    const getRes = await fetchWithAuth(
      `${BASE_URL}/api/sync/domains/settings`,
      TEST_USERNAME,
      authToken
    );

    expect(getRes.status).toBe(200);
    const getJson = await getRes.json();
    expect(getJson.ok).toBe(true);
    expect(getJson.domain).toBe("settings");
    expect(Object.keys(getJson.parts).sort()).toEqual([
      "custom-wallpapers",
      "settings",
    ]);
    expect(getJson.parts.settings.data).toEqual({
      theme: "macosx",
      language: "en",
    });
    expect(getJson.parts["custom-wallpapers"].mode).toBe("individual");
  });

  test("POST /api/sync/domains/settings/attachments/prepare validates partDomain ownership", async () => {
    const authToken = await getAuthToken();

    const invalidRes = await fetchWithAuth(
      `${BASE_URL}/api/sync/domains/settings/attachments/prepare`,
      TEST_USERNAME,
      authToken,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partDomain: "files-images",
          itemKey: "asset-1",
        }),
      }
    );

    expect(invalidRes.status).toBe(400);

    const validRes = await fetchWithAuth(
      `${BASE_URL}/api/sync/domains/settings/attachments/prepare`,
      TEST_USERNAME,
      authToken,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partDomain: "custom-wallpapers",
          itemKey: "wallpaper-1",
        }),
      }
    );

    expect(validRes.status).toBe(200);
    const validJson = await validRes.json();
    expect(typeof validJson.pathname).toBe("string");
    expect(validJson.pathname).toContain(
      "custom-wallpapers/items/wallpaper-1.gz"
    );
  });
});

