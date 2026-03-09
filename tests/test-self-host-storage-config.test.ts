import { afterEach, describe, expect, test } from "bun:test";
import { getStorageBackend } from "../api/_utils/storage";

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

describe("self-host storage backend selection", () => {
  test("prefers Vercel Blob when both storage backends are configured", () => {
    process.env.BLOB_READ_WRITE_TOKEN = "blob-token";
    process.env.S3_BUCKET = "bucket";
    process.env.S3_REGION = "us-east-1";
    process.env.S3_ENDPOINT = "https://storage.example.com";
    process.env.S3_ACCESS_KEY_ID = "key";
    process.env.S3_SECRET_ACCESS_KEY = "secret";
    delete process.env.STORAGE_PROVIDER;

    expect(getStorageBackend()).toBe("vercel-blob");
  });

  test("falls back to S3 when blob storage is not configured", () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    process.env.S3_BUCKET = "bucket";
    process.env.S3_REGION = "us-east-1";
    process.env.S3_ENDPOINT = "https://storage.example.com";
    process.env.S3_ACCESS_KEY_ID = "key";
    process.env.S3_SECRET_ACCESS_KEY = "secret";
    delete process.env.STORAGE_PROVIDER;

    expect(getStorageBackend()).toBe("s3");
  });

  test("respects explicit S3 selection", () => {
    process.env.STORAGE_PROVIDER = "s3-compatible";
    process.env.S3_BUCKET = "bucket";
    process.env.S3_REGION = "us-east-1";
    process.env.S3_ENDPOINT = "https://storage.example.com";
    process.env.S3_ACCESS_KEY_ID = "key";
    process.env.S3_SECRET_ACCESS_KEY = "secret";
    delete process.env.BLOB_READ_WRITE_TOKEN;

    expect(getStorageBackend()).toBe("s3");
  });

  test("throws when explicit provider configuration is incomplete", () => {
    process.env.STORAGE_PROVIDER = "vercel-blob";
    delete process.env.BLOB_READ_WRITE_TOKEN;

    expect(() => getStorageBackend()).toThrow(
      "STORAGE_PROVIDER requests Vercel Blob"
    );
  });
});
