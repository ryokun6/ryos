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
    expect("settings" in data.metadata).toBe(true);
    expect("files-metadata" in data.metadata).toBe(true);
    expect("files-images" in data.metadata).toBe(true);
    expect("files-trash" in data.metadata).toBe(true);
    expect("files-applets" in data.metadata).toBe(true);
    expect("songs" in data.metadata).toBe(true);
    expect("calendar" in data.metadata).toBe(true);
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
});
