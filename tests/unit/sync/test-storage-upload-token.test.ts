import { afterEach, describe, expect, test } from "bun:test";
import {
  isUploadPathOwnedByUser,
  signStorageUploadToken,
  verifyStorageUploadToken,
} from "../../../api/_utils/storage-upload-token";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }

  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    process.env[key] = value;
  }
});

describe("storage upload token", () => {
  test("round-trips signed upload claims", async () => {
    process.env.S3_SECRET_ACCESS_KEY = "test-signing-secret";

    const token = await signStorageUploadToken({
      pathname: "sync/alice/blobs/deadbeef.gz",
      contentType: "application/gzip",
      maximumSizeInBytes: 4096,
      expiresInSeconds: 120,
    });

    const claims = verifyStorageUploadToken(token);
    expect(claims?.pathname).toBe("sync/alice/blobs/deadbeef.gz");
    expect(claims?.contentType).toBe("application/gzip");
    expect(claims?.maximumSizeInBytes).toBe(4096);
    expect(claims?.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  test("rejects tampered pathname payloads", async () => {
    process.env.S3_SECRET_ACCESS_KEY = "test-signing-secret";

    const token = await signStorageUploadToken({
      pathname: "sync/alice/blobs/abc.gz",
      contentType: "application/gzip",
      maximumSizeInBytes: 1024,
      expiresInSeconds: 120,
    });

    const [payload, signature] = token.split(".");
    const tamperedPayload = Buffer.from(
      JSON.stringify({
        pathname: "backups/alice/backup.gz",
        contentType: "application/gzip",
        maximumSizeInBytes: 1024,
        exp: Math.floor(Date.now() / 1000) + 120,
      })
    ).toString("base64url");

    expect(verifyStorageUploadToken(`${tamperedPayload}.${signature}`)).toBe(null);
    expect(verifyStorageUploadToken(`${payload}.invalid`)).toBe(null);
  });

  test("rejects expired proxy upload tokens", async () => {
    process.env.S3_SECRET_ACCESS_KEY = "test-signing-secret";
    const nowSeconds = Math.floor(Date.now() / 1000);
    const token = await signStorageUploadToken({
      pathname: "sync/alice/blobs/expired.gz",
      contentType: "application/gzip",
      maximumSizeInBytes: 1024,
      expiresInSeconds: 60,
    });

    expect(verifyStorageUploadToken(token, nowSeconds + 59)).not.toBeNull();
    expect(verifyStorageUploadToken(token, nowSeconds + 61)).toBeNull();
  });

  test("restricts proxy uploads to sync blobs and the user's backup object", () => {
    expect(isUploadPathOwnedByUser("sync/alice/blobs/abc.gz", "alice")).toBe(true);
    expect(isUploadPathOwnedByUser("backups/alice/backup.gz", "alice")).toBe(true);
    expect(isUploadPathOwnedByUser("backups/alice/backup.gz", "bob")).toBe(false);
    expect(isUploadPathOwnedByUser("sync/alice/files/foo.gz", "alice")).toBe(false);
  });
});
