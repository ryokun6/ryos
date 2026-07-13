import { describe, expect, mock, test } from "bun:test";
import {
  uploadBlobWithProxyFallback,
  type BlobUploadFallbackDependencies,
} from "../../../src/sync/blobs";
import type {
  StorageUploadInstruction,
  StorageUploadProgress,
} from "../../../src/utils/storageUpload";

const STORAGE_URL = "s3://bucket/sync/alice/blobs/abc.gz";

function instruction(
  uploadMethod: StorageUploadInstruction["uploadMethod"],
  uploadUrl: string
): StorageUploadInstruction {
  return {
    provider: "s3",
    uploadMethod,
    pathname: "sync/alice/blobs/abc.gz",
    contentType: "application/gzip",
    maximumSizeInBytes: 1024,
    uploadUrl,
    storageUrl: STORAGE_URL,
    headers: { "Content-Type": "application/gzip" },
  };
}

describe("sync blob authenticated proxy fallback", () => {
  test("retries a failed direct upload with a fresh per-blob proxy instruction", async () => {
    const primary = instruction(
      "presigned-put",
      "https://bucket.example.com/abc.gz?X-Amz-Expires=60"
    );
    const fallback = instruction(
      "api-proxy-put",
      "/api/sync/v2/blob-upload?token=fresh"
    );
    const uploadMethods: string[] = [];
    const progress: number[] = [];
    let uploadAttempt = 0;

    const dependencies: BlobUploadFallbackDependencies = {
      uploadBlob: mock(async (_blob, current, options = {}) => {
        uploadAttempt += 1;
        uploadMethods.push(current.uploadMethod);
        if (uploadAttempt === 1) {
          options.onProgress?.({ loaded: 90, total: 100, percentage: 90 });
          throw new Error(
            "Upload failed before an HTTP response was received."
          );
        }
        options.onProgress?.({ loaded: 10, total: 100, percentage: 10 });
        options.onProgress?.({ loaded: 100, total: 100, percentage: 100 });
        return { storageUrl: current.storageUrl };
      }),
      requestProxyUpload: mock(async (body) => {
        expect(body).toEqual({ sha256: "ab".repeat(32), size: 100 });
        return { ok: true, upload: fallback };
      }),
    };

    const result = await uploadBlobWithProxyFallback(
      {
        blob: new Blob([new Uint8Array(100)]),
        sha256: "ab".repeat(32),
        instruction: primary,
        onProgress: (event: StorageUploadProgress) => {
          progress.push(event.loaded);
        },
      },
      dependencies
    );

    expect(result.storageUrl).toBe(STORAGE_URL);
    expect(uploadMethods).toEqual(["presigned-put", "api-proxy-put"]);
    expect(dependencies.requestProxyUpload).toHaveBeenCalledTimes(1);
    expect(progress).toEqual([90, 90, 100]);
  });

  test("refreshes an expired pre-issued proxy token once", async () => {
    const expired = instruction(
      "api-proxy-put",
      "/api/sync/v2/blob-upload?token=expired"
    );
    const fresh = instruction(
      "api-proxy-put",
      "/api/sync/v2/blob-upload?token=fresh"
    );
    let uploadAttempt = 0;
    const dependencies: BlobUploadFallbackDependencies = {
      uploadBlob: mock(async (_blob, current) => {
        uploadAttempt += 1;
        if (uploadAttempt === 1) {
          throw new Error("Upload failed with status 403");
        }
        return { storageUrl: current.storageUrl };
      }),
      requestProxyUpload: mock(async () => ({ ok: true, upload: fresh })),
    };

    await expect(
      uploadBlobWithProxyFallback(
        {
          blob: new Blob([new Uint8Array(100)]),
          sha256: "ab".repeat(32),
          instruction: expired,
        },
        dependencies
      )
    ).resolves.toEqual({ storageUrl: STORAGE_URL });
    expect(dependencies.requestProxyUpload).toHaveBeenCalledTimes(1);
    expect(dependencies.uploadBlob).toHaveBeenCalledTimes(2);
  });

  test("falls back when an expired presigned PUT returns 403", async () => {
    const fresh = instruction(
      "api-proxy-put",
      "/api/sync/v2/blob-upload?token=fresh"
    );
    let uploadAttempt = 0;
    const dependencies: BlobUploadFallbackDependencies = {
      uploadBlob: mock(async (_blob, current) => {
        uploadAttempt += 1;
        if (uploadAttempt === 1) {
          throw new Error("Upload failed with status 403");
        }
        return { storageUrl: current.storageUrl };
      }),
      requestProxyUpload: mock(async () => ({ ok: true, upload: fresh })),
    };

    await expect(
      uploadBlobWithProxyFallback(
        {
          blob: new Blob([new Uint8Array(100)]),
          sha256: "ab".repeat(32),
          instruction: instruction(
            "presigned-put",
            "https://bucket.example.com/abc.gz?X-Amz-Expires=60"
          ),
        },
        dependencies
      )
    ).resolves.toEqual({ storageUrl: STORAGE_URL });
    expect(dependencies.requestProxyUpload).toHaveBeenCalledTimes(1);
  });

  test("does not request a fallback after cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    const dependencies: BlobUploadFallbackDependencies = {
      uploadBlob: mock(async () => {
        throw new DOMException("Aborted", "AbortError");
      }),
      requestProxyUpload: mock(async () => {
        throw new Error("fallback should not be requested");
      }),
    };

    await expect(
      uploadBlobWithProxyFallback(
        {
          blob: new Blob([new Uint8Array(100)]),
          sha256: "ab".repeat(32),
          instruction: instruction(
            "presigned-put",
            "https://bucket.example.com/abc.gz"
          ),
          signal: controller.signal,
        },
        dependencies
      )
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(dependencies.requestProxyUpload).not.toHaveBeenCalled();
  });
});
