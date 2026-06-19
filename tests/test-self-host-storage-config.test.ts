import { afterEach, describe, expect, test } from "bun:test";
import {
  createSignedDownloadUrl,
  createStorageUploadDescriptor,
  getStorageBackend,
} from "../api/_utils/storage";

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

  test("defaults presigned URLs to virtual-hosted style for s3-compatible endpoints", async () => {
    process.env.STORAGE_PROVIDER = "s3-compatible";
    process.env.S3_BUCKET = "bucket";
    process.env.S3_REGION = "auto";
    process.env.S3_ENDPOINT = "https://example-account.r2.cloudflarestorage.com";
    process.env.S3_ACCESS_KEY_ID = "key";
    process.env.S3_SECRET_ACCESS_KEY = "secret";
    delete process.env.S3_FORCE_PATH_STYLE;

    const upload = await createStorageUploadDescriptor({
      pathname: "sync/test/files-images.gz",
      contentType: "application/gzip",
      maximumSizeInBytes: 1024,
    });

    expect(upload.provider).toBe("s3");
    if (upload.provider !== "s3") {
      throw new Error("Expected an S3 upload descriptor");
    }
    expect(upload.uploadUrl.startsWith(
      "https://bucket.example-account.r2.cloudflarestorage.com/"
    )).toBe(true);
    expect(upload.uploadUrl.includes("x-amz-sdk-checksum-algorithm")).toBe(false);
    expect(upload.uploadUrl.includes("x-amz-checksum-crc32")).toBe(false);
  });

  test("supports separate public endpoint for browser uploads", async () => {
    process.env.STORAGE_PROVIDER = "s3-compatible";
    process.env.S3_BUCKET = "bucket";
    process.env.S3_REGION = "us-east-1";
    process.env.S3_ENDPOINT = "http://minio:9000";
    process.env.S3_PUBLIC_ENDPOINT = "https://storage.example.com";
    process.env.S3_ACCESS_KEY_ID = "key";
    process.env.S3_SECRET_ACCESS_KEY = "secret";
    process.env.S3_FORCE_PATH_STYLE = "false";

    const upload = await createStorageUploadDescriptor({
      pathname: "sync/test/files-images.gz",
      contentType: "application/gzip",
      maximumSizeInBytes: 1024,
    });

    expect(upload.provider).toBe("s3");
    if (upload.provider !== "s3") {
      throw new Error("Expected an S3 upload descriptor");
    }
    expect(upload.uploadUrl.startsWith("https://bucket.storage.example.com/")).toBe(
      true
    );
  });

  test("proxies S3 uploads through the API when S3_PROXY_BLOBS is set", async () => {
    process.env.STORAGE_PROVIDER = "s3";
    process.env.S3_BUCKET = "bucket";
    process.env.S3_REGION = "us-east-1";
    process.env.S3_ENDPOINT = "https://storage.example.com";
    process.env.S3_ACCESS_KEY_ID = "key";
    process.env.S3_SECRET_ACCESS_KEY = "secret";
    process.env.S3_PROXY_BLOBS = "1";
    delete process.env.BLOB_READ_WRITE_TOKEN;

    const upload = await createStorageUploadDescriptor({
      pathname: "sync/alice/blobs/abc.gz",
      contentType: "application/gzip",
      maximumSizeInBytes: 1024,
    });

    expect(upload.provider).toBe("s3");
    expect(upload.uploadMethod).toBe("proxy-put");
    if (upload.uploadMethod !== "proxy-put") {
      throw new Error("Expected a proxy upload descriptor");
    }
    // Relative, same-origin API path — no presigned bucket URL.
    expect(upload.uploadUrl).toBe(
      "/api/sync/blob-proxy?key=sync%2Falice%2Fblobs%2Fabc.gz"
    );
    expect(upload.uploadUrl.includes("X-Amz-Signature")).toBe(false);
    expect(upload.storageUrl).toBe("s3://bucket/sync/alice/blobs/abc.gz");
  });

  test("proxies S3 downloads through the API when S3_PROXY_BLOBS is set", async () => {
    process.env.STORAGE_PROVIDER = "s3";
    process.env.S3_BUCKET = "bucket";
    process.env.S3_REGION = "us-east-1";
    process.env.S3_ENDPOINT = "https://storage.example.com";
    process.env.S3_ACCESS_KEY_ID = "key";
    process.env.S3_SECRET_ACCESS_KEY = "secret";
    process.env.S3_PROXY_BLOBS = "1";
    delete process.env.BLOB_READ_WRITE_TOKEN;

    const signed = await createSignedDownloadUrl(
      "s3://bucket/sync/alice/blobs/abc.gz"
    );
    expect(signed).toBe(
      "/api/sync/blob-proxy?key=sync%2Falice%2Fblobs%2Fabc.gz"
    );
  });

  test("uses presigned URLs when S3_PROXY_BLOBS is disabled", async () => {
    process.env.STORAGE_PROVIDER = "s3";
    process.env.S3_BUCKET = "bucket";
    process.env.S3_REGION = "auto";
    process.env.S3_ENDPOINT = "https://example-account.r2.cloudflarestorage.com";
    process.env.S3_ACCESS_KEY_ID = "key";
    process.env.S3_SECRET_ACCESS_KEY = "secret";
    delete process.env.S3_PROXY_BLOBS;

    const upload = await createStorageUploadDescriptor({
      pathname: "sync/alice/blobs/abc.gz",
      contentType: "application/gzip",
      maximumSizeInBytes: 1024,
    });
    expect(upload.uploadMethod).toBe("presigned-put");
  });

  test("supports explicitly forcing path-style uploads", async () => {
    process.env.STORAGE_PROVIDER = "s3-compatible";
    process.env.S3_BUCKET = "bucket";
    process.env.S3_REGION = "auto";
    process.env.S3_ENDPOINT = "https://example-account.r2.cloudflarestorage.com";
    process.env.S3_ACCESS_KEY_ID = "key";
    process.env.S3_SECRET_ACCESS_KEY = "secret";
    process.env.S3_FORCE_PATH_STYLE = "true";

    const upload = await createStorageUploadDescriptor({
      pathname: "sync/test/files-images.gz",
      contentType: "application/gzip",
      maximumSizeInBytes: 1024,
    });

    expect(upload.provider).toBe("s3");
    if (upload.provider !== "s3") {
      throw new Error("Expected an S3 upload descriptor");
    }
    expect(upload.uploadUrl.startsWith(
      "https://example-account.r2.cloudflarestorage.com/bucket/"
    )).toBe(true);
  });
});
