/**
 * Bridge KOReader kosync progress ↔ ryOS Books `bookshelf/progress:<path>`.
 *
 * Document IDs are matched by:
 * 1. Explicit Redis docpath mapping from a prior PUT
 * 2. `bookshelf/docmap:<path>` sync docs (filename + optional partial MD5)
 * 3. Filename MD5 of `/Books/*.epub` entries in the user's files sync KV
 */

import type { Redis } from "../../_utils/redis.js";
import { hlcFromTimestamp } from "../../../src/shared/sync2/hlc.js";
import type { SyncOp } from "../../../src/shared/sync2/types.js";
import {
  readSyncDocsByPrefix,
  SERVER_SYNC_CLIENT_ID,
  writeSyncOpsFromServer,
} from "../../sync/v2/_core.js";
import { filenameMd5FromPath } from "./_md5.js";
import {
  getKosyncDocPath,
  setKosyncDocPath,
} from "./_progress.js";
import type {
  KosyncDocMapEntry,
  KosyncProgressRecord,
} from "./_types.js";
import {
  KOSYNC_DEVICE_ID_RYOS,
  KOSYNC_DEVICE_RYOS,
} from "./_types.js";
import {
  isEpubCfi,
  isKoStyleXPath,
  kosyncPercentagePlaceholder,
} from "../../../src/shared/kosyncProgressLocator.js";

const BOOKS_PREFIX = "/Books/";
const PROGRESS_PREFIX = "bookshelf/progress:";
const DOCMAP_PREFIX = "bookshelf/docmap:";
const FILES_PREFIX = "files/item:";

export interface BookshelfProgressDoc {
  cfi: string;
  percentage: number;
  updatedAt: number;
  kosyncProgress?: string;
}

export interface KosyncBridgeResult {
  path: string | null;
  accepted: boolean;
  timestamp: number;
  reason?: "books-newer" | "stale-backward";
}

function isBooksEpubPath(path: string): boolean {
  if (!path.startsWith(BOOKS_PREFIX)) return false;
  if (path.slice(BOOKS_PREFIX.length).includes("/")) return false;
  return path.toLowerCase().endsWith(".epub");
}

function asDocMap(value: unknown): KosyncDocMapEntry | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.filenameMd5 !== "string" || record.filenameMd5.length === 0) {
    return null;
  }
  return {
    filenameMd5: record.filenameMd5.toLowerCase(),
    partialMd5:
      typeof record.partialMd5 === "string"
        ? record.partialMd5.toLowerCase()
        : undefined,
  };
}

function asBookshelfProgress(value: unknown): BookshelfProgressDoc | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const percentage = Number(record.percentage);
  const updatedAt = Number(record.updatedAt);
  if (!Number.isFinite(percentage) || !Number.isFinite(updatedAt)) return null;
  const kosyncProgress =
    typeof record.kosyncProgress === "string" &&
    isKoStyleXPath(record.kosyncProgress)
      ? record.kosyncProgress
      : undefined;
  return {
    cfi: typeof record.cfi === "string" ? record.cfi : "",
    percentage: Math.min(1, Math.max(0, percentage)),
    updatedAt,
    ...(kosyncProgress ? { kosyncProgress } : {}),
  };
}

function kosyncProgressFromRecord(record: KosyncProgressRecord): string | undefined {
  const progress = record.progress?.trim() ?? "";
  if (isKoStyleXPath(progress)) return progress;
  return undefined;
}

/**
 * KOSync PUTs are timestamped by the server, not by the reading device. A
 * delayed retry can therefore look newer than a Books update that happened
 * after the device's previous accepted PUT. Preserve that Books update when
 * the delayed PUT would move progress backward; equal/forward progress remains
 * valid so a KOReader device can continue reading from the shared position.
 */
export function shouldAcceptKosyncProgressUpdate(
  existing: BookshelfProgressDoc | null,
  previousKosyncTimestamp: number | null,
  incoming: KosyncProgressRecord
): boolean {
  if (!existing) return true;

  const incomingUpdatedAt = incoming.timestamp * 1000;
  if (existing.updatedAt > incomingUpdatedAt) return false;

  const previousKosyncUpdatedAt = (previousKosyncTimestamp ?? 0) * 1000;
  const booksChangedSincePreviousKosync =
    existing.updatedAt > previousKosyncUpdatedAt;
  const wouldMoveBackward = incoming.percentage < existing.percentage;
  return !(booksChangedSincePreviousKosync && wouldMoveBackward);
}

/** Resolve a kosync document id to a `/Books/….epub` VFS path when possible. */
export async function resolveDocumentPath(
  redis: Redis,
  username: string,
  documentId: string
): Promise<string | null> {
  const normalizedDoc = documentId.toLowerCase();

  const cached = await getKosyncDocPath(redis, username, normalizedDoc);
  if (cached && isBooksEpubPath(cached)) return cached;

  const docmaps = await readSyncDocsByPrefix(redis, username, DOCMAP_PREFIX);
  for (const [key, value] of Object.entries(docmaps)) {
    const path = key.slice(DOCMAP_PREFIX.length);
    if (!isBooksEpubPath(path)) continue;
    const map = asDocMap(value);
    if (!map) continue;
    if (
      map.filenameMd5 === normalizedDoc ||
      (map.partialMd5 && map.partialMd5 === normalizedDoc)
    ) {
      await setKosyncDocPath(redis, username, normalizedDoc, path);
      return path;
    }
  }

  const files = await readSyncDocsByPrefix(redis, username, FILES_PREFIX);
  for (const key of Object.keys(files)) {
    const path = key.slice(FILES_PREFIX.length);
    if (!isBooksEpubPath(path)) continue;
    if (filenameMd5FromPath(path) === normalizedDoc) {
      await setKosyncDocPath(redis, username, normalizedDoc, path);
      return path;
    }
  }

  return null;
}

/**
 * Push kosync progress into Cloud Sync v2 so the Books app picks it up.
 * Preserves CrossPoint XPath in `kosyncProgress`; EPUB CFIs stay native when
 * a device sends them. Percentage-only records restore via percentage.
 */
export async function bridgeKosyncProgressToBooks(
  redis: Redis,
  username: string,
  documentId: string,
  record: KosyncProgressRecord,
  previousKosyncTimestamp: number | null = null
): Promise<KosyncBridgeResult> {
  const path = await resolveDocumentPath(redis, username, documentId);
  if (!path) {
    return {
      path: null,
      accepted: true,
      timestamp: record.timestamp,
    };
  }

  const existingDocs = await readSyncDocsByPrefix(
    redis,
    username,
    PROGRESS_PREFIX
  );
  const existing = asBookshelfProgress(existingDocs[`${PROGRESS_PREFIX}${path}`]);
  const updatedAt = record.timestamp * 1000;
  if (
    existing &&
    !shouldAcceptKosyncProgressUpdate(
      existing,
      previousKosyncTimestamp,
      record
    )
  ) {
    return {
      path,
      accepted: false,
      timestamp: Math.floor(existing.updatedAt / 1000),
      reason:
        existing.updatedAt > updatedAt ? "books-newer" : "stale-backward",
    };
  }

  const kosyncProgress = kosyncProgressFromRecord(record);
  const incomingCfi = record.progress?.trim() ?? "";
  const progress: BookshelfProgressDoc = {
    cfi: isEpubCfi(incomingCfi) ? incomingCfi : "",
    percentage: Math.min(1, Math.max(0, record.percentage)),
    updatedAt,
    ...(kosyncProgress ? { kosyncProgress } : {}),
  };

  const t = hlcFromTimestamp(updatedAt, SERVER_SYNC_CLIENT_ID);
  const ops: SyncOp[] = [{ k: `${PROGRESS_PREFIX}${path}`, v: progress, t }];
  await writeSyncOpsFromServer(redis, username, ops);
  return {
    path,
    accepted: true,
    timestamp: record.timestamp,
  };
}

/**
 * Build a kosync progress response from Books bookshelf state when kosync
 * has no dedicated record (or Books is ahead).
 */
export async function bridgeBooksProgressToKosync(
  redis: Redis,
  username: string,
  documentId: string
): Promise<KosyncProgressRecord | null> {
  const path = await resolveDocumentPath(redis, username, documentId);
  if (!path) return null;

  const docs = await readSyncDocsByPrefix(redis, username, PROGRESS_PREFIX);
  const progress = asBookshelfProgress(docs[`${PROGRESS_PREFIX}${path}`]);
  if (!progress) return null;

  return {
    percentage: progress.percentage,
    // Never emit EPUB CFI as CrossPoint `progress`; prefer stored XPath.
    progress:
      progress.kosyncProgress ??
      kosyncPercentagePlaceholder(progress.percentage),
    device: KOSYNC_DEVICE_RYOS,
    device_id: KOSYNC_DEVICE_ID_RYOS,
    timestamp: Math.floor(progress.updatedAt / 1000),
  };
}

/** Pick the newer of kosync-native vs Books-bridged progress. */
export function pickNewerProgress(
  a: KosyncProgressRecord | null,
  b: KosyncProgressRecord | null
): KosyncProgressRecord | null {
  if (!a) return b;
  if (!b) return a;
  if (b.timestamp !== a.timestamp) {
    return b.timestamp > a.timestamp ? b : a;
  }
  const aKo = isKoStyleXPath(a.progress);
  const bKo = isKoStyleXPath(b.progress);
  if (aKo && !bKo) return a;
  if (bKo && !aKo) return b;
  // Tie-break on further percentage (matches “furthest progress” intent).
  return b.percentage >= a.percentage ? b : a;
}
