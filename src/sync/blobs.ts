/**
 * Cloud Sync v2 client blob helpers: gzip JSON envelopes, content hashing,
 * batched upload preparation with server-side dedupe, and downloads
 * (direct for public URLs, signed via the API for s3:// locations).
 */

import { uploadBlobWithStorageInstruction } from "@/utils/storageUpload";
import type { StorageUploadInstruction } from "@/utils/storageUpload";
import type { SyncBlobRef } from "@/shared/sync2/types";
import { postSyncBlobs } from "@/sync/transport";
import { decodeBlobItemOffThread } from "@/sync/workerClient";

// Pure content transforms live in the shared codec module (also bundled by
// the cloud sync worker); re-exported here for existing import sites.
export { gunzipJson, gzipJson, sha256Json } from "@/sync/contentCodec";

export interface BlobUploadItem {
  key: string;
  sha256: string;
  /** Gzip of the serialized item JSON (precompressed off the main thread). */
  compressed: Uint8Array;
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

  // Items arrive precompressed; dedupe identical content within the batch.
  const byDigest = new Map<string, { compressed: Uint8Array; keys: string[] }>();
  for (const item of items) {
    options.signal?.throwIfAborted();
    const existing = byDigest.get(item.sha256);
    if (existing) {
      existing.keys.push(item.key);
      continue;
    }
    byDigest.set(item.sha256, { compressed: item.compressed, keys: [item.key] });
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
      const uploadResult = await uploadBlobWithStorageInstruction(
        new Blob([entry.compressed.slice().buffer as ArrayBuffer], {
          type: "application/gzip",
        }),
        result.upload as StorageUploadInstruction,
        (progress) => {
          emitProgress(completedUploadBytes + progress.loaded);
        }
      );
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

/** Download and decode one blob item (gunzip + parse run off-thread). */
export async function downloadBlobItem(
  downloadUrl: string,
  options: BlobDownloadOptions = {}
): Promise<unknown> {
  const response = await fetch(downloadUrl, { signal: options.signal });
  if (!response.ok) {
    throw new Error(`Failed to fetch sync blob: ${response.status}`);
  }
  return await decodeBlobItemOffThread(
    await readResponseWithProgress(response, options)
  );
}
