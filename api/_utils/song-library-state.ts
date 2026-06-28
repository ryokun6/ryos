/**
 * Server-side reader/writer for the user's synced song library, backed by
 * the Cloud Sync v2 key-value state (`songs/track:{id}` + `songs/lib`).
 *
 * Used by AI tools (songLibraryControl) and integration tests. Writes go
 * through the v2 op pipeline so connected clients receive realtime updates.
 */

import type { Redis } from "./redis.js";
import type { Track } from "../../src/stores/useIpodStore.js";
import { sortTracksLikeServerOrder } from "../../src/stores/ipodTrackOrder.js";
import {
  hlcFromTimestamp,
  nextHlc,
} from "../../src/shared/sync2/hlc.js";
import type { SyncOp } from "../../src/shared/sync2/types.js";
import type { DeletionMarkerMap } from "../../src/utils/cloudSyncDeletionMarkers.js";
import {
  readSyncDocsByPrefix,
  readSyncSnapshot,
  SERVER_SYNC_CLIENT_ID,
  writeSyncOpsFromServer,
} from "../sync/v2/_core.js";

export interface SongsSnapshotData {
  tracks: Track[];
  libraryState: "uninitialized" | "loaded" | "cleared";
  lastKnownVersion: number;
  /** Deletion tombstones (trackId -> ISO timestamp). */
  deletedTrackIds?: DeletionMarkerMap;
}

export interface SongsStateMetadata {
  updatedAt: string;
  version: number;
  createdAt: string;
}

const TRACK_KEY_PREFIX = "songs/track:";
const LIB_KEY = "songs/lib";

function isLibraryState(
  value: unknown
): value is SongsSnapshotData["libraryState"] {
  return value === "uninitialized" || value === "loaded" || value === "cleared";
}

function normalizeTrack(value: unknown): Track | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<Track>;
  if (typeof candidate.id !== "string" || candidate.id.length === 0) {
    return null;
  }

  const title =
    typeof candidate.title === "string" && candidate.title.length > 0
      ? candidate.title
      : candidate.id;

  return {
    ...(candidate as Track),
    id: candidate.id,
    url:
      typeof candidate.url === "string" && candidate.url.length > 0
        ? candidate.url
        : `https://www.youtube.com/watch?v=${candidate.id}`,
    title,
  };
}

export function isSongsSnapshotData(value: unknown): value is SongsSnapshotData {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<SongsSnapshotData>;
  return (
    Array.isArray(candidate.tracks) &&
    candidate.tracks.every((track) => normalizeTrack(track) !== null) &&
    isLibraryState(candidate.libraryState) &&
    typeof candidate.lastKnownVersion === "number" &&
    Number.isFinite(candidate.lastKnownVersion)
  );
}

export async function readSongsState(
  redis: Redis,
  username: string
): Promise<{ data: SongsSnapshotData; metadata: SongsStateMetadata } | null> {
  const docs = await readSyncDocsByPrefix(redis, username, "songs/");

  const tracks: Track[] = [];
  for (const [key, doc] of Object.entries(docs)) {
    if (!key.startsWith(TRACK_KEY_PREFIX)) continue;
    const track = normalizeTrack(doc);
    if (track) {
      tracks.push(track);
    }
  }

  const lib = (docs[LIB_KEY] || {}) as {
    libraryState?: unknown;
    lastKnownVersion?: unknown;
    order?: unknown;
  };

  const hasLibDoc = docs[LIB_KEY] !== undefined;
  if (tracks.length === 0 && !hasLibDoc) {
    return null;
  }

  // Order by the persisted library order (newest-first by convention),
  // appending tracks unknown to the order doc in server-sort order.
  const order = Array.isArray(lib.order)
    ? (lib.order as unknown[]).filter(
        (id): id is string => typeof id === "string"
      )
    : [];
  const position = new Map(order.map((id, index) => [id, index]));
  const orderedTracks = [
    ...tracks
      .filter((track) => position.has(track.id))
      .sort((a, b) => position.get(a.id)! - position.get(b.id)!),
    ...sortTracksLikeServerOrder(
      tracks.filter((track) => !position.has(track.id))
    ),
  ];

  const now = new Date().toISOString();
  return {
    data: {
      tracks: orderedTracks,
      libraryState: isLibraryState(lib.libraryState)
        ? lib.libraryState
        : tracks.length > 0
          ? "loaded"
          : "uninitialized",
      lastKnownVersion:
        typeof lib.lastKnownVersion === "number" &&
        Number.isFinite(lib.lastKnownVersion)
          ? lib.lastKnownVersion
          : 0,
    },
    metadata: { updatedAt: now, version: 1, createdAt: now },
  };
}

/**
 * Replace the user's song library with `data`. Tracks absent from `data`
 * are tombstoned (matching the v1 replace semantics used by AI tools).
 */
export async function writeSongsState(
  redis: Redis,
  username: string,
  data: SongsSnapshotData
): Promise<SongsStateMetadata> {
  const { entries: existingEntries } = await readSyncSnapshot(
    redis,
    username,
    "songs/"
  );
  const existingDocs: Record<string, unknown> = {};
  let lastHlc: string | null = null;
  for (const [key, entry] of Object.entries(existingEntries)) {
    if (!lastHlc || entry.t > lastHlc) {
      lastHlc = entry.t;
    }
    if (!entry.del && entry.v !== undefined) {
      existingDocs[key] = entry.v;
    }
  }

  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const t = nextHlc(lastHlc, SERVER_SYNC_CLIENT_ID, nowMs);

  const nextTracks: Track[] = [];
  const seenIds = new Set<string>();
  for (const raw of Array.isArray(data?.tracks) ? data.tracks : []) {
    const track = normalizeTrack(raw);
    if (track && !seenIds.has(track.id)) {
      seenIds.add(track.id);
      nextTracks.push(track);
    }
  }

  const ops: SyncOp[] = [];
  for (const track of nextTracks) {
    const key = `${TRACK_KEY_PREFIX}${track.id}`;
    const existing = existingDocs[key];
    if (existing && JSON.stringify(existing) === JSON.stringify(track)) {
      continue;
    }
    ops.push({ k: key, v: track, t });
  }

  for (const key of Object.keys(existingDocs)) {
    if (!key.startsWith(TRACK_KEY_PREFIX)) continue;
    const id = key.slice(TRACK_KEY_PREFIX.length);
    if (!seenIds.has(id)) {
      ops.push({ k: key, del: true, t });
    }
  }

  // Caller-provided tombstones (ids that must stay deleted) for ids not
  // re-added in this write.
  if (data?.deletedTrackIds) {
    for (const [id, deletedAt] of Object.entries(data.deletedTrackIds)) {
      if (!id || seenIds.has(id)) continue;
      const key = `${TRACK_KEY_PREFIX}${id}`;
      if (!ops.some((op) => op.k === key)) {
        ops.push({
          k: key,
          del: true,
          t: hlcFromTimestamp(deletedAt, SERVER_SYNC_CLIENT_ID),
        });
      }
    }
  }

  const nextLib = {
    libraryState: isLibraryState(data?.libraryState)
      ? data.libraryState
      : nextTracks.length > 0
        ? "loaded"
        : "uninitialized",
    lastKnownVersion:
      typeof data?.lastKnownVersion === "number" &&
      Number.isFinite(data.lastKnownVersion)
        ? data.lastKnownVersion
        : 0,
    order: nextTracks.map((track) => track.id),
  };
  if (JSON.stringify(existingDocs[LIB_KEY]) !== JSON.stringify(nextLib)) {
    ops.push({ k: LIB_KEY, v: nextLib, t });
  }

  if (ops.length > 0) {
    await writeSyncOpsFromServer(redis, username, ops);
  }

  return { updatedAt: now, version: 1, createdAt: now };
}
