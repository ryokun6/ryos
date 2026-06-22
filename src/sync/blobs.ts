/**
 * Cloud Sync v2 client blob helpers: gzip JSON envelopes, content hashing,
 * batched upload preparation with server-side dedupe, and downloads
 * (direct for public URLs, signed via the API for s3:// locations).
 */

import { uploadBlobWithStorageInstruction } from "@/utils/storageUpload";
import type { StorageUploadInstruction } from "@/utils/storageUpload";
import type { SyncBlobRef } from "@/shared/sync2/types";
import { postSyncBlobs } from "@/sync/transport";

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

/**
 * SHA-256 hex of the serialized item JSON. Matches the v1 per-item
 * signature algorithm so legacy-imported refs dedupe against local content.
 */
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
    const existing = byDigest.get(item.sha256);
    if (existing) {
      existing.keys.push(item.key);
      continue;
    }
    const compressed = await gzipJson(item.item);
    byDigest.set(item.sha256, { compressed, keys: [item.key] });
  }

  const digests = Array.from(byDigest.keys());
  const response = await postSyncBlobs({
    upload: digests.map((sha256) => ({
      sha256,
      size: byDigest.get(sha256)!.compressed.length,
    })),
  });

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
  refs: SyncBlobRef[]
): Promise<(string | null)[]> {
  const needsSigning: number[] = [];
  const resolved: (string | null)[] = refs.map((ref, index) => {
    if (ref.url.startsWith("https://")) return ref.url;
    needsSigning.push(index);
    return null;
  });

  if (needsSigning.length > 0) {
    const response = await postSyncBlobs({
      download: needsSigning.map((index) => refs[index].url),
    });
    const signed = response.downloads || [];
    needsSigning.forEach((refIndex, signedIndex) => {
      resolved[refIndex] = signed[signedIndex] || null;
    });
  }

  return resolved;
}

/** Download and decode one blob item (v2 bare item or v1 envelope). */
export async function downloadBlobItem(downloadUrl: string): Promise<unknown> {
  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch sync blob: ${response.status}`);
  }
  const parsed = await gunzipJson<unknown>(await response.arrayBuffer());
  // v1 per-item envelopes wrap the item as { domain, key, version, data }.
  if (
    parsed &&
    typeof parsed === "object" &&
    "data" in parsed &&
    "domain" in parsed &&
    "key" in parsed
  ) {
    return (parsed as { data: unknown }).data;
  }
  return parsed;
}
