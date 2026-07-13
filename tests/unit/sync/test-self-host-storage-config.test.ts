import { afterEach, describe, expect, test } from "bun:test";
import {
  createStorageUploadDescriptor,
  getStorageBackend,
  isStoredObjectWithinPath,
} from "../../../api/_utils/storage";

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
  test("ignores a legacy blob token and selects S3", () => {
    process.env.BLOB_READ_WRITE_TOKEN = "blob-token";
    process.env.S3_BUCKET = "bucket";
    process.env.S3_REGION = "us-east-1";
    process.env.S3_ENDPOINT = "https://storage.example.com"; // pragma: allowlist secret
    process.env.S3_ACCESS_KEY_ID = "key";
    process.env.S3_SECRET_ACCESS_KEY = "secret";
    delete process.env.STORAGE_PROVIDER;

    expect(getStorageBackend()).toBe("s3");
  });

  test("selects S3 when configured", () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    process.env.S3_BUCKET = "bucket";
    process.env.S3_REGION = "us-east-1";
    process.env.S3_ENDPOINT = "https://storage.example.com"; // pragma: allowlist secret
    process.env.S3_ACCESS_KEY_ID = "key";
    process.env.S3_SECRET_ACCESS_KEY = "secret";
    delete process.env.STORAGE_PROVIDER;

    expect(getStorageBackend()).toBe("s3");
  });

  test("checks storage URLs against the configured bucket and key prefix", () => {
    process.env.S3_BUCKET = "bucket";
    process.env.S3_REGION = "us-east-1";
    process.env.S3_ENDPOINT = "https://storage.example.com"; // pragma: allowlist secret
    process.env.S3_ACCESS_KEY_ID = "key";
    process.env.S3_SECRET_ACCESS_KEY = "secret";

    expect(
      isStoredObjectWithinPath(
        "s3://bucket/sync/alice/blobs/book.gz",
        "sync/alice/blobs/",
      ),
    ).toBe(true);
    expect(
      isStoredObjectWithinPath(
        "s3://other-bucket/sync/alice/blobs/book.gz",
        "sync/alice/blobs/",
      ),
    ).toBe(false);
    expect(
      isStoredObjectWithinPath(
        "s3://bucket/sync/bob/blobs/book.gz",
        "sync/alice/blobs/",
      ),
    ).toBe(false);
    expect(
      isStoredObjectWithinPath(
        "https://storage.example.com/sync/alice/blobs/book.gz",
        "sync/alice/blobs/",
      ),
    ).toBe(false);
  });

  test("respects explicit S3 selection", () => {
    process.env.STORAGE_PROVIDER = "s3"; // pragma: allowlist secret
    process.env.S3_BUCKET = "bucket";
    process.env.S3_REGION = "us-east-1";
    process.env.S3_ENDPOINT = "https://storage.example.com"; // pragma: allowlist secret
    process.env.S3_ACCESS_KEY_ID = "key";
    process.env.S3_SECRET_ACCESS_KEY = "secret";
    delete process.env.BLOB_READ_WRITE_TOKEN;

    expect(getStorageBackend()).toBe("s3");
  });

  test("throws for unsupported explicit providers", () => {
    process.env.STORAGE_PROVIDER = "vercel-blob"; // pragma: allowlist secret
    delete process.env.BLOB_READ_WRITE_TOKEN;

    expect(() => getStorageBackend()).toThrow(
      'Unsupported STORAGE_PROVIDER "vercel-blob"'
    );
  });

  test("throws when S3 configuration is missing", () => {
    delete process.env.STORAGE_PROVIDER;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.S3_BUCKET;
    delete process.env.S3_REGION;
    delete process.env.S3_ENDPOINT;
    delete process.env.S3_ACCESS_KEY_ID;
    delete process.env.S3_SECRET_ACCESS_KEY;
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;

    expect(() => getStorageBackend()).toThrow(
      "Missing object-storage configuration."
    );
  });

  test("defaults presigned URLs to virtual-hosted style for R2-compatible endpoints", async () => {
    process.env.STORAGE_PROVIDER = "s3"; // pragma: allowlist secret
    process.env.S3_BUCKET = "bucket";
    process.env.S3_REGION = "auto";
    process.env.S3_ENDPOINT = "https://example-account.r2.cloudflarestorage.com"; // pragma: allowlist secret
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
    process.env.STORAGE_PROVIDER = "s3"; // pragma: allowlist secret
    process.env.S3_BUCKET = "bucket";
    process.env.S3_REGION = "us-east-1";
    process.env.S3_ENDPOINT = "http://minio:9000"; // pragma: allowlist secret
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

  test("supports explicitly forcing path-style uploads", async () => {
    process.env.STORAGE_PROVIDER = "s3"; // pragma: allowlist secret
    process.env.S3_BUCKET = "bucket";
    process.env.S3_REGION = "auto";
    process.env.S3_ENDPOINT = "https://example-account.r2.cloudflarestorage.com"; // pragma: allowlist secret
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

  test("supports API proxy uploads for providers without browser CORS", async () => {
    process.env.STORAGE_PROVIDER = "s3"; // pragma: allowlist secret
    process.env.STORAGE_CLIENT_UPLOAD = "proxy";
    process.env.S3_BUCKET = "bucket";
    process.env.S3_REGION = "auto";
    process.env.S3_ENDPOINT = "https://example-account.r2.cloudflarestorage.com"; // pragma: allowlist secret
    process.env.S3_ACCESS_KEY_ID = "key";
    process.env.S3_SECRET_ACCESS_KEY = "secret";

    const upload = await createStorageUploadDescriptor({
      pathname: "sync/test-user/blobs/abc123.gz",
      contentType: "application/gzip",
      maximumSizeInBytes: 1024,
    });

    expect(upload.provider).toBe("s3");
    if (upload.provider !== "s3") {
      throw new Error("Expected an S3 upload descriptor");
    }
    expect(upload.uploadMethod).toBe("api-proxy-put");
    expect(upload.uploadUrl.startsWith("/api/sync/v2/blob-upload?token=")).toBe(true);
    expect(upload.storageUrl).toBe("s3://bucket/sync/test-user/blobs/abc123.gz");
  });
});
