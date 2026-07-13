/**
 * Cloud Sync v2 client blob helpers: gzip JSON envelopes, content hashing,
 * batched upload preparation with server-side dedupe, and downloads
 * (direct for public URLs, signed via the API for s3:// locations).
 */

import {
  isStorageUploadInstruction,
  uploadBlobWithStorageInstruction,
  type StorageUploadInstruction,
  type StorageUploadProgress,
} from "@/utils/storageUpload";
import type { SyncBlobRef } from "@/shared/sync2/types";
import {
  postSyncBlobs,
  requestSyncBlobProxyUpload,
} from "@/sync/transport";
import { cloudSyncLog } from "@/sync/logging";

function assertCompressionSupport(): void {
  if (
    typeof CompressionStream === "undefined" ||
    typeof DecompressionStream === "undefined"
  ) {
    throw new Error("Cloud sync requires browser compression support.");
  }
}

export async function gzipJson(value: unknown): Promise<Uint8Array> {
  assertCompressionSupport();
  const inputData = new TextEncoder().encode(JSON.stringify(value));
  const stream = new Blob([inputData])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function gunzipJson<T>(data: ArrayBuffer | Uint8Array): Promise<T> {
  assertCompressionSupport();
  const buffer = data instanceof Uint8Array ? (data.slice().buffer as ArrayBuffer) : data;
  const stream = new Blob([buffer])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  const text = await new Response(stream).text();
  return JSON.parse(text) as T;
}

/** SHA-256 hex of the serialized item JSON. */
export async function sha256Json(value: unknown): Promise<string> {
  const payload = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", payload);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export interface BlobUploadItem {
  key: string;
  sha256: string;
  /** Serialized store item (JSON-able). */
  item: unknown;
}

export interface BlobUploadBatchProgress {
  loadedBytes: number;
  totalBytes: number;
  percentage: number;
  completedItems: number;
  totalItems: number;
}

interface BlobUploadItemsOptions {
  onProgress?: (progress: BlobUploadBatchProgress) => void;
  signal?: AbortSignal;
}

export interface BlobDownloadProgress {
  loadedBytes: number;
  totalBytes: number;
  percentage: number;
}

interface BlobDownloadOptions {
  expectedBytes?: number;
  onProgress?: (progress: BlobDownloadProgress) => void;
  signal?: AbortSignal;
}

export interface BlobUploadFallbackOptions {
  blob: Blob;
  sha256: string;
  instruction: StorageUploadInstruction;
  onProgress?: (progress: StorageUploadProgress) => void;
  signal?: AbortSignal;
}

export interface BlobUploadFallbackDependencies {
  uploadBlob: typeof uploadBlobWithStorageInstruction;
  requestProxyUpload: typeof requestSyncBlobProxyUpload;
}

const DEFAULT_BLOB_UPLOAD_FALLBACK_DEPENDENCIES: BlobUploadFallbackDependencies = {
  uploadBlob: uploadBlobWithStorageInstruction,
  requestProxyUpload: requestSyncBlobProxyUpload,
};

function isAbortFailure(error: unknown, signal?: AbortSignal): boolean {
  return (
    signal?.aborted === true ||
    (error instanceof Error && error.name === "AbortError")
  );
}

/**
 * Retry one failed storage upload through a fresh authenticated API proxy.
 * The fresh instruction avoids both stale presigned URLs and stale proxy tokens.
 */
export async function uploadBlobWithProxyFallback(
  options: BlobUploadFallbackOptions,
  dependencies: BlobUploadFallbackDependencies =
    DEFAULT_BLOB_UPLOAD_FALLBACK_DEPENDENCIES
): Promise<{ storageUrl: string }> {
  let maximumReportedBytes = 0;
  const reportProgress = options.onProgress
    ? (progress: StorageUploadProgress) => {
        maximumReportedBytes = Math.max(maximumReportedBytes, progress.loaded);
        options.onProgress?.({
          loaded: maximumReportedBytes,
          total: progress.total,
          percentage:
            progress.total > 0
              ? (maximumReportedBytes / progress.total) * 100
              : 0,
        });
      }
    : undefined;

  try {
    return await dependencies.uploadBlob(options.blob, options.instruction, {
      onProgress: reportProgress,
      signal: options.signal,
    });
  } catch (error) {
    if (isAbortFailure(error, options.signal)) {
      throw error;
    }

    cloudSyncLog.warn(
      "Blob upload failed; retrying with a fresh authenticated proxy instruction",
      {
        sha256Prefix: options.sha256.slice(0, 12),
        uploadMethod: options.instruction.uploadMethod,
        errorName: error instanceof Error ? error.name : "unknown",
      }
    );
  }

  const response = await dependencies.requestProxyUpload(
    {
      sha256: options.sha256,
      size: options.blob.size,
    },
    options.signal
  );
  if (
    !isStorageUploadInstruction(response.upload) ||
    response.upload.uploadMethod !== "api-proxy-put" ||
    response.upload.storageUrl !== options.instruction.storageUrl
  ) {
    throw new Error("Sync blob proxy instruction was invalid.");
  }

  return dependencies.uploadBlob(options.blob, response.upload, {
    onProgress: reportProgress,
    signal: options.signal,
  });
}

/**
 * Upload a batch of blob items, skipping content the server already has.
 * Returns a map key → SyncBlobRef for inclusion in docs.
 */
export async function uploadBlobItems(
  items: BlobUploadItem[],
  options: BlobUploadItemsOptions = {}
): Promise<Map<string, SyncBlobRef>> {
  const refs = new Map<string, SyncBlobRef>();
  if (items.length === 0) return refs;

  // Pre-compress to know sizes; dedupe identical content within the batch.
  const byDigest = new Map<string, { compressed: Uint8Array; keys: string[] }>();
  for (const item of items) {
    options.signal?.throwIfAborted();
    const existing = byDigest.get(item.sha256);
    if (existing) {
      existing.keys.push(item.key);
      continue;
    }
    const compressed = await gzipJson(item.item);
    byDigest.set(item.sha256, { compressed, keys: [item.key] });
  }

  const digests = Array.from(byDigest.keys());
  const response = await postSyncBlobs(
    {
      upload: digests.map((sha256) => ({
        sha256,
        size: byDigest.get(sha256)!.compressed.length,
      })),
    },
    options.signal
  );

  const uploads = response.uploads || [];
  const uploadResults = uploads.filter((result) => result.upload);
  const totalUploadBytes = uploadResults.reduce((sum, result) => {
    const entry = byDigest.get(result.sha256);
    return sum + (entry?.compressed.length ?? 0);
  }, 0);
  const totalUploadItems = uploadResults.length;
  let completedUploadBytes = 0;
  let completedUploadItems = 0;
  const emitProgress = (loadedBytes: number) => {
    options.onProgress?.({
      loadedBytes,
      totalBytes: totalUploadBytes,
      percentage:
        totalUploadBytes > 0 ? (loadedBytes / totalUploadBytes) * 100 : 100,
      completedItems: completedUploadItems,
      totalItems: totalUploadItems,
    });
  };
  if (options.onProgress) {
    emitProgress(0);
  }

  for (const result of uploads) {
    options.signal?.throwIfAborted();
    const entry = byDigest.get(result.sha256);
    if (!entry) continue;
    let url: string | undefined;

    if (result.exists && result.url) {
      url = result.url;
    } else if (result.upload) {
      if (!isStorageUploadInstruction(result.upload)) {
        throw new Error(`Invalid blob upload instruction for ${result.sha256}`);
      }
      const uploadResult = await uploadBlobWithProxyFallback({
        blob: new Blob([entry.compressed.slice().buffer as ArrayBuffer], {
          type: "application/gzip",
        }),
        sha256: result.sha256,
        instruction: result.upload,
        onProgress: (progress) => {
          emitProgress(completedUploadBytes + progress.loaded);
        },
        signal: options.signal,
      });
      url = uploadResult.storageUrl;
      completedUploadBytes += entry.compressed.length;
      completedUploadItems += 1;
      emitProgress(completedUploadBytes);
    }

    if (!url) {
      throw new Error(`Blob upload failed for ${result.sha256}`);
    }
    for (const key of entry.keys) {
      refs.set(key, {
        url,
        size: entry.compressed.length,
        sha256: result.sha256,
      });
    }
  }

  return refs;
}

/**
 * Resolve fetchable download URLs for blob refs. Public https URLs pass
 * through; s3:// locations are signed via the API in one batch.
 */
export async function resolveBlobDownloadUrls(
  refs: SyncBlobRef[],
  signal?: AbortSignal
): Promise<(string | null)[]> {
  const needsSigning: number[] = [];
  const resolved: (string | null)[] = refs.map((ref, index) => {
    if (ref.url.startsWith("https://")) return ref.url;
    needsSigning.push(index);
    return null;
  });

  if (needsSigning.length > 0) {
    const response = await postSyncBlobs(
      {
        download: needsSigning.map((index) => refs[index].url),
      },
      signal
    );
    const signed = response.downloads || [];
    needsSigning.forEach((refIndex, signedIndex) => {
      resolved[refIndex] = signed[signedIndex] || null;
    });
  }

  return resolved;
}

async function readResponseWithProgress(
  response: Response,
  options: BlobDownloadOptions
): Promise<ArrayBuffer> {
  const contentLength = Number(response.headers.get("content-length") || 0);
  const totalBytes =
    typeof options.expectedBytes === "number" && options.expectedBytes > 0
      ? options.expectedBytes
      : Number.isFinite(contentLength) && contentLength > 0
        ? contentLength
        : 0;

  const emitProgress = (loadedBytes: number) => {
    options.onProgress?.({
      loadedBytes,
      totalBytes,
      percentage: totalBytes > 0 ? (loadedBytes / totalBytes) * 100 : 0,
    });
  };
  options.onProgress?.({
    loadedBytes: 0,
    totalBytes,
    percentage: 0,
  });

  if (!response.body) {
    const buffer = await response.arrayBuffer();
    emitProgress(totalBytes || buffer.byteLength);
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loadedBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    loadedBytes += value.byteLength;
    emitProgress(loadedBytes);
  }

  const result = new Uint8Array(loadedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result.buffer;
}

/** Download and decode one blob item. */
export async function downloadBlobItem(
  downloadUrl: string,
  options: BlobDownloadOptions = {}
): Promise<unknown> {
  const response = await fetch(downloadUrl, { signal: options.signal });
  if (!response.ok) {
    throw new Error(`Failed to fetch sync blob: ${response.status}`);
  }
  return await gunzipJson<unknown>(
    await readResponseWithProgress(response, options)
  );
}
