import { beforeAll, describe, expect, test } from "bun:test";
import { BASE_URL, ensureUserAuth, fetchWithAuth } from "./test-utils";

/**
 * Cloud Sync v2 blob-proxy integration tests.
 *
 * Exercises the same-origin upload/download proxy that backs cloud sync when
 * the bucket CORS allowlist can't cover every app origin. Requires the
 * standalone API server started with an S3 backend AND `S3_PROXY_BLOBS=1`:
 *
 *   API_PORT=3001 S3_PROXY_BLOBS=1 bun run scripts/api-standalone-server.ts
 *
 * When the running server does not have the proxy enabled, the round-trip
 * tests skip themselves (the descriptor falls back to presigned uploads).
 */

const USERNAME = `proxytest${Date.now().toString(36)}`;
const OTHER_USERNAME = `proxyother${Date.now().toString(36)}`;
const PASSWORD = "test-password-123";

let token: string;

interface BlobsResponse {
  ok: boolean;
  uploads?: Array<{
    sha256: string;
    exists: boolean;
    upload?: { uploadMethod?: string; uploadUrl?: string; storageUrl?: string };
    storageUrl?: string;
  }>;
  downloads?: (string | null)[];
}

async function prepareUpload(
  sha256: string,
  size: number
): Promise<BlobsResponse> {
  const response = await fetchWithAuth(
    `${BASE_URL}/api/sync/v2/blobs`,
    USERNAME,
    token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ upload: [{ sha256, size }] }),
    }
  );
  return (await response.json()) as BlobsResponse;
}

beforeAll(async () => {
  token = await ensureUserAuth(USERNAME, PASSWORD);
});

describe("sync v2 blob proxy", () => {
  test("uploads and downloads a blob through the same-origin proxy", async () => {
    const sha256 = "11".repeat(32);
    const payload = new TextEncoder().encode(
      JSON.stringify({ proxy: true, when: Date.now() })
    );
    const prep = await prepareUpload(sha256, payload.length);
    const descriptor = prep.uploads?.[0]?.upload;

    if (descriptor?.uploadMethod !== "proxy-put") {
      console.warn(
        "[blob-proxy] Server does not have S3_PROXY_BLOBS enabled; skipping round-trip."
      );
      return;
    }

    expect(descriptor.uploadUrl?.startsWith("/api/sync/blob-proxy")).toBe(true);

    // Upload the bytes through the proxy.
    const uploadResponse = await fetchWithAuth(
      `${BASE_URL}${descriptor.uploadUrl}`,
      USERNAME,
      token,
      {
        method: "PUT",
        headers: { "Content-Type": "application/gzip" },
        body: payload,
      }
    );
    expect(uploadResponse.status).toBe(200);
    const uploadBody = (await uploadResponse.json()) as { storageUrl?: string };
    expect(uploadBody.storageUrl).toBe(descriptor.storageUrl);

    // Resolve a download URL via the blobs endpoint (returns a proxy path).
    const downloadResponse = await fetchWithAuth(
      `${BASE_URL}/api/sync/v2/blobs`,
      USERNAME,
      token,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ download: [descriptor.storageUrl] }),
      }
    );
    const downloadBody = (await downloadResponse.json()) as BlobsResponse;
    const downloadUrl = downloadBody.downloads?.[0];
    expect(typeof downloadUrl).toBe("string");
    expect(downloadUrl?.startsWith("/api/sync/blob-proxy")).toBe(true);

    // Fetch the bytes back and confirm an exact round-trip.
    const fetched = await fetchWithAuth(
      `${BASE_URL}${downloadUrl}`,
      USERNAME,
      token,
      { method: "GET" }
    );
    expect(fetched.status).toBe(200);
    const roundTripped = new Uint8Array(await fetched.arrayBuffer());
    expect(Array.from(roundTripped)).toEqual(Array.from(payload));
  });

  test("refuses access to another user's keys", async () => {
    // Confirm the proxy is enabled before asserting ownership semantics.
    const prep = await prepareUpload("22".repeat(32), 16);
    if (prep.uploads?.[0]?.upload?.uploadMethod !== "proxy-put") {
      console.warn("[blob-proxy] Proxy disabled; skipping ownership check.");
      return;
    }

    const foreignKey = encodeURIComponent(
      `sync/${OTHER_USERNAME}/blobs/${"33".repeat(32)}.gz`
    );
    const putResponse = await fetchWithAuth(
      `${BASE_URL}/api/sync/blob-proxy?key=${foreignKey}`,
      USERNAME,
      token,
      {
        method: "PUT",
        headers: { "Content-Type": "application/gzip" },
        body: new Uint8Array([1, 2, 3]),
      }
    );
    expect(putResponse.status).toBe(403);

    const getResponse = await fetchWithAuth(
      `${BASE_URL}/api/sync/blob-proxy?key=${foreignKey}`,
      USERNAME,
      token,
      { method: "GET" }
    );
    expect(getResponse.status).toBe(403);
  });
});
