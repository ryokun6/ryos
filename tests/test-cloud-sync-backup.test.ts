import { describe, expect, test } from "bun:test";
import { gunzipSync, gzipSync } from "node:zlib";
import { BASE_URL, ensureUserAuth, fetchWithAuth } from "./test-utils";

const TEST_USERNAME = `bk${Date.now().toString(36)}${Math.floor(
  Math.random() * 1000
).toString(36)}`;
const TEST_PASSWORD = "sync-backup-test-password";

interface VercelBlobUploadInstruction {
  provider: "vercel-blob";
  uploadMethod: "vercel-client-token";
  pathname: string;
  contentType: string;
  maximumSizeInBytes: number;
  clientToken: string;
}

interface S3UploadInstruction {
  provider: "s3";
  uploadMethod: "presigned-put";
  pathname: string;
  contentType: string;
  maximumSizeInBytes: number;
  uploadUrl: string;
  storageUrl: string;
  headers?: Record<string, string>;
}

type StorageUploadInstruction =
  | VercelBlobUploadInstruction
  | S3UploadInstruction;

let authTokenPromise: Promise<string> | null = null;

async function getAuthToken(): Promise<string> {
  if (!authTokenPromise) {
    authTokenPromise = (async () => {
      const token = await ensureUserAuth(TEST_USERNAME, TEST_PASSWORD);
      if (!token) {
        throw new Error("Failed to create or authenticate backup test user.");
      }
      return token;
    })();
  }

  return authTokenPromise;
}

async function uploadBackupPayload(
  instruction: StorageUploadInstruction,
  compressed: Uint8Array
): Promise<string> {
  const payload = new Blob([compressed], { type: "application/gzip" });

  if (instruction.uploadMethod === "vercel-client-token") {
    const { put } = await import("@vercel/blob/client");
    const result = await put(instruction.pathname, payload, {
      access: "public",
      token: instruction.clientToken,
      contentType: "application/gzip",
      multipart: false,
    });

    return result.url;
  }

  const response = await fetch(instruction.uploadUrl, {
    method: "PUT",
    headers: instruction.headers || {
      "Content-Type": "application/gzip",
    },
    body: payload,
  });

  expect(response.ok).toBe(true);
  return instruction.storageUrl;
}

describe("cloud backup API", () => {
  test("POST /api/sync/backup-token returns provider-aware upload instructions", async () => {
    const authToken = await getAuthToken();

    const res = await fetchWithAuth(
      `${BASE_URL}/api/sync/backup-token`,
      TEST_USERNAME,
      authToken,
      {
        method: "POST",
      }
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as StorageUploadInstruction;
    expect(typeof data.provider).toBe("string");
    expect(typeof data.uploadMethod).toBe("string");
    expect(typeof data.pathname).toBe("string");

    if (data.uploadMethod === "vercel-client-token") {
      expect(typeof data.clientToken).toBe("string");
      expect(data.clientToken.length).toBeGreaterThan(0);
      return;
    }

    expect(data.uploadMethod).toBe("presigned-put");
    expect(typeof data.uploadUrl).toBe("string");
    expect(typeof data.storageUrl).toBe("string");
  });

  test("backup upload, download, and delete round trip works", async () => {
    const authToken = await getAuthToken();
    const envelope = {
      timestamp: "2026-03-09T05:20:00.000Z",
      version: 3,
      message: "backup round trip",
    };
    const compressed = gzipSync(JSON.stringify(envelope));

    const tokenRes = await fetchWithAuth(
      `${BASE_URL}/api/sync/backup-token`,
      TEST_USERNAME,
      authToken,
      { method: "POST" }
    );
    expect(tokenRes.status).toBe(200);
    const instruction = (await tokenRes.json()) as StorageUploadInstruction;

    const storageUrl = await uploadBackupPayload(instruction, compressed);

    const saveRes = await fetchWithAuth(
      `${BASE_URL}/api/sync/backup`,
      TEST_USERNAME,
      authToken,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storageUrl,
          timestamp: envelope.timestamp,
          version: envelope.version,
          totalSize: compressed.length,
        }),
      }
    );
    expect(saveRes.status).toBe(200);

    const getRes = await fetchWithAuth(
      `${BASE_URL}/api/sync/backup`,
      TEST_USERNAME,
      authToken
    );
    expect(getRes.status).toBe(200);
    const getJson = (await getRes.json()) as { data: string };
    const restored = JSON.parse(
      gunzipSync(Buffer.from(getJson.data, "base64")).toString()
    ) as typeof envelope;
    expect(restored.message).toBe("backup round trip");
    expect(restored.timestamp).toBe(envelope.timestamp);

    const deleteRes = await fetchWithAuth(
      `${BASE_URL}/api/sync/backup`,
      TEST_USERNAME,
      authToken,
      { method: "DELETE" }
    );
    expect(deleteRes.status).toBe(200);
    const deleteJson = await deleteRes.json();
    expect(deleteJson.ok).toBe(true);
  });
});
