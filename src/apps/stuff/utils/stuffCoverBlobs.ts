/**
 * Stuff cover images live in IndexedDB (`stuff_images`) and sync via the
 * Sync v2 `stuff-images` blob namespace. Items reference covers by
 * `coverBlobId` — never by inlining multi‑MB data URLs into sync ops.
 */

import { dbOperations, STORES } from "@/utils/indexedDB";
import {
  emitCloudSyncDomainChange,
  getCloudSyncContentKey,
} from "@/utils/cloudSyncEvents";
import { useCloudSyncStore } from "@/stores/useCloudSyncStore";
import type { StuffItem } from "../types";
import { prepareStuffCoverBlob } from "./stuffCoverCompress";

export {
  prepareStuffCoverBlob,
  STUFF_COVER_MAX_EDGE,
  STUFF_IMAGE_MAX_BYTES,
} from "./stuffCoverCompress";

export interface StuffCoverRecord {
  name: string;
  content: Blob;
  type?: string;
}

const objectUrls = new Map<string, string>();
let coversRevision = 0;
const revisionListeners = new Set<() => void>();

export function getStuffCoversRevision(): number {
  return coversRevision;
}

export function subscribeStuffCoversRevision(listener: () => void): () => void {
  revisionListeners.add(listener);
  return () => {
    revisionListeners.delete(listener);
  };
}

export function bumpStuffCoversRevision(): void {
  coversRevision += 1;
  for (const listener of revisionListeners) {
    try {
      listener();
    } catch (error) {
      console.error("[StuffCovers] Revision listener failed:", error);
    }
  }
}

function revokeObjectUrl(coverBlobId: string): void {
  const existing = objectUrls.get(coverBlobId);
  if (!existing) return;
  URL.revokeObjectURL(existing);
  objectUrls.delete(coverBlobId);
}

export function invalidateStuffCoverCache(coverBlobId?: string): void {
  if (coverBlobId) {
    revokeObjectUrl(coverBlobId);
  } else {
    for (const id of [...objectUrls.keys()]) {
      revokeObjectUrl(id);
    }
  }
  bumpStuffCoversRevision();
}

/** Parse a `data:image/...;base64,...` URL into a Blob, or null if invalid. */
export function dataUrlToBlob(dataUrl: string): Blob | null {
  const trimmed = dataUrl.trim();
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(trimmed);
  if (!match) return null;
  const mime = match[1] || "application/octet-stream";
  const isBase64 = Boolean(match[2]);
  const data = match[3] ?? "";
  try {
    if (isBase64) {
      const binary = atob(data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return new Blob([bytes], { type: mime });
    }
    return new Blob([decodeURIComponent(data)], { type: mime });
  } catch {
    return null;
  }
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function emitCoverDirty(coverBlobId: string): void {
  const syncKey = getCloudSyncContentKey("stuff-images", coverBlobId);
  emitCloudSyncDomainChange(
    "stuff-images",
    syncKey ? [syncKey] : undefined
  );
}

/** Write (or replace) a cover blob and mark the blob namespace dirty. */
export async function putStuffCoverBlob(
  coverBlobId: string,
  blob: Blob,
  name = "cover"
): Promise<void> {
  if (!coverBlobId || !(blob instanceof Blob) || blob.size === 0) {
    throw new Error("Invalid Stuff cover blob");
  }
  // Compress oversized covers so picker / paste / lookup share one path.
  const content = await prepareStuffCoverBlob(blob);
  const record: StuffCoverRecord = {
    name,
    content,
    type: content.type || "image/jpeg",
  };
  await dbOperations.put(STORES.STUFF_IMAGES, record, coverBlobId);
  useCloudSyncStore.getState().clearDeletedKeys("stuffCoverKeys", [coverBlobId]);
  revokeObjectUrl(coverBlobId);
  bumpStuffCoversRevision();
  emitCoverDirty(coverBlobId);
}

/**
 * Delete a local cover blob and record a sync tombstone so peers drop it too.
 * Pass `tombstone: false` when applying a remote delete (engine already owns the del).
 */
export async function deleteStuffCoverBlob(
  coverBlobId: string,
  options?: { tombstone?: boolean }
): Promise<void> {
  if (!coverBlobId) return;
  if (options?.tombstone !== false) {
    useCloudSyncStore.getState().markDeletedKeys("stuffCoverKeys", [coverBlobId]);
  }
  try {
    await dbOperations.delete(STORES.STUFF_IMAGES, coverBlobId);
  } catch (error) {
    console.error("[StuffCovers] Failed to delete cover blob:", error);
  }
  revokeObjectUrl(coverBlobId);
  bumpStuffCoversRevision();
  if (options?.tombstone !== false) {
    emitCoverDirty(coverBlobId);
  }
}

export async function getStuffCoverRecord(
  coverBlobId: string
): Promise<StuffCoverRecord | undefined> {
  if (!coverBlobId) return undefined;
  return dbOperations.get<StuffCoverRecord>(STORES.STUFF_IMAGES, coverBlobId);
}

/** Resolve a cover blob to a stable object URL (cached until invalidated). */
export async function getStuffCoverObjectUrl(
  coverBlobId: string
): Promise<string | undefined> {
  if (!coverBlobId) return undefined;
  const cached = objectUrls.get(coverBlobId);
  if (cached) return cached;
  const record = await getStuffCoverRecord(coverBlobId);
  const content = record?.content;
  if (!(content instanceof Blob) || content.size === 0) return undefined;
  const url = URL.createObjectURL(content);
  objectUrls.set(coverBlobId, url);
  return url;
}

export async function getStuffCoverDataUrl(
  coverBlobId: string
): Promise<string | undefined> {
  const record = await getStuffCoverRecord(coverBlobId);
  if (!(record?.content instanceof Blob) || record.content.size === 0) {
    return undefined;
  }
  return blobToDataUrl(record.content);
}

/**
 * Convert a legacy inline `imageDataUrl` into a cover blob. Returns the
 * updated item fields (coverBlobId set, imageDataUrl cleared) or null if
 * conversion was unnecessary / failed.
 */
export async function migrateImageDataUrlToCoverBlob(
  item: Pick<StuffItem, "id" | "imageDataUrl" | "coverBlobId">
): Promise<{ coverBlobId: string; imageDataUrl?: undefined } | null> {
  const dataUrl = item.imageDataUrl?.trim();
  if (!dataUrl || !dataUrl.startsWith("data:image/")) return null;
  const blob = dataUrlToBlob(dataUrl);
  if (!blob || blob.size === 0) return null;
  const coverBlobId = item.coverBlobId?.trim() || item.id;
  await putStuffCoverBlob(coverBlobId, blob);
  return { coverBlobId, imageDataUrl: undefined };
}

/** Strip oversized inline covers from a sync document. */
export function stripImageDataUrlForSync<T extends object>(
  doc: T
): Omit<T, "imageDataUrl"> {
  const { imageDataUrl: _ignored, ...rest } = doc as T & {
    imageDataUrl?: string;
  };
  return rest;
}
