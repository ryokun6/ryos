import type { Redis } from "./redis.js";
import type { Track } from "../../src/stores/useIpodStore.js";
import {
  createSyntheticLegacySyncVersion,
  normalizeCloudSyncVersionState,
  type CloudSyncVersionState,
} from "../../src/utils/cloudSyncVersion.js";

export interface SongsSnapshotData {
  tracks: Track[];
  libraryState: "uninitialized" | "loaded" | "cleared";
  lastKnownVersion: number;
}

export interface SongsStateMetadata {
  updatedAt: string;
  version: number;
  createdAt: string;
  syncVersion?: CloudSyncVersionState | null;
}

interface PersistedSongsLibraryMeta extends SongsStateMetadata {
  trackOrder: string[];
  libraryState: SongsSnapshotData["libraryState"];
  lastKnownVersion: number;
}

interface PersistedSongsLegacyState extends SongsStateMetadata {
  data?: unknown;
}

interface WriteSongsStateOptions extends Partial<SongsStateMetadata> {}

function syncMetaKey(username: string): string {
  return `sync:state:meta:${username}`;
}

function legacySongsStateKey(username: string): string {
  return `sync:state:${username}:songs`;
}

export function getSongLibraryMetaKey(username: string): string {
  return `sync:songs:${username}:meta`;
}

export function getSongLibraryTrackKey(username: string, id: string): string {
  return `sync:songs:${username}:track:${id}`;
}

function parseJson<T>(raw: unknown): T | null {
  if (!raw) return null;

  try {
    return typeof raw === "string" ? (JSON.parse(raw) as T) : (raw as T);
  } catch {
    return null;
  }
}

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
    id: candidate.id,
    url:
      typeof candidate.url === "string" && candidate.url.length > 0
        ? candidate.url
        : `https://www.youtube.com/watch?v=${candidate.id}`,
    title,
    ...(typeof candidate.artist === "string" ? { artist: candidate.artist } : {}),
    ...(typeof candidate.album === "string" ? { album: candidate.album } : {}),
    ...(typeof candidate.cover === "string" ? { cover: candidate.cover } : {}),
    ...(typeof candidate.lyricOffset === "number" &&
    Number.isFinite(candidate.lyricOffset)
      ? { lyricOffset: candidate.lyricOffset }
      : {}),
    ...(candidate.lyricsSource &&
    typeof candidate.lyricsSource === "object" &&
    typeof candidate.lyricsSource.hash === "string" &&
    candidate.lyricsSource.hash.length > 0 &&
    (typeof candidate.lyricsSource.albumId === "string" ||
      typeof candidate.lyricsSource.albumId === "number") &&
    typeof candidate.lyricsSource.title === "string" &&
    typeof candidate.lyricsSource.artist === "string"
      ? {
          lyricsSource: {
            hash: candidate.lyricsSource.hash,
            albumId: candidate.lyricsSource.albumId,
            title: candidate.lyricsSource.title,
            artist: candidate.lyricsSource.artist,
            ...(typeof candidate.lyricsSource.album === "string"
              ? { album: candidate.lyricsSource.album }
              : {}),
          },
        }
      : {}),
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

function normalizeSongsSnapshotData(value: unknown): SongsSnapshotData | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<SongsSnapshotData>;
  if (!Array.isArray(candidate.tracks)) {
    return null;
  }

  const tracks = candidate.tracks
    .map((track) => normalizeTrack(track))
    .filter((track): track is Track => Boolean(track));

  const seenIds = new Set<string>();
  const dedupedTracks = tracks.filter((track) => {
    if (seenIds.has(track.id)) {
      return false;
    }
    seenIds.add(track.id);
    return true;
  });

  return {
    tracks: dedupedTracks,
    libraryState: isLibraryState(candidate.libraryState)
      ? candidate.libraryState
      : dedupedTracks.length > 0
        ? "loaded"
        : "uninitialized",
    lastKnownVersion:
      typeof candidate.lastKnownVersion === "number" &&
      Number.isFinite(candidate.lastKnownVersion)
        ? candidate.lastKnownVersion
        : 0,
  };
}

function normalizeSongsStateMetadata(
  value: Partial<SongsStateMetadata> | null | undefined,
  fallbackTimestamp: string
): SongsStateMetadata {
  return {
    updatedAt:
      typeof value?.updatedAt === "string" && value.updatedAt.length > 0
        ? value.updatedAt
        : fallbackTimestamp,
    version:
      typeof value?.version === "number" && Number.isFinite(value.version)
        ? value.version
        : 1,
    createdAt:
      typeof value?.createdAt === "string" && value.createdAt.length > 0
        ? value.createdAt
        : fallbackTimestamp,
    syncVersion:
      normalizeCloudSyncVersionState(value?.syncVersion) ||
      createSyntheticLegacySyncVersion(),
  };
}

async function writeSyncMetaEntry(
  redis: Redis,
  username: string,
  metadata: SongsStateMetadata
): Promise<void> {
  const rawMeta = await redis.get<string | Record<string, unknown>>(syncMetaKey(username));
  const parsedMeta =
    typeof rawMeta === "string" ? JSON.parse(rawMeta) : rawMeta || {};

  parsedMeta.songs = metadata;
  await redis.set(syncMetaKey(username), JSON.stringify(parsedMeta));
}

function buildTrackOrder(tracks: Track[]): string[] {
  return tracks.map((track) => track.id);
}

async function readStoredSongsState(
  redis: Redis,
  username: string
): Promise<{ data: SongsSnapshotData; metadata: SongsStateMetadata } | null> {
  const meta = parseJson<PersistedSongsLibraryMeta>(
    await redis.get(getSongLibraryMetaKey(username))
  );

  if (!meta) {
    return null;
  }

  const trackOrder = Array.isArray(meta.trackOrder)
    ? meta.trackOrder.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];

  const rawTracks =
    trackOrder.length > 0
      ? await redis.mget(...trackOrder.map((id) => getSongLibraryTrackKey(username, id)))
      : [];

  const trackMap = new Map<string, Track>();
  for (let index = 0; index < trackOrder.length; index += 1) {
    const parsedTrack = parseJson<Track>(rawTracks[index]);
    const track = normalizeTrack(parsedTrack);
    if (track) {
      trackMap.set(track.id, track);
    }
  }

  return {
    data: {
      tracks: trackOrder
        .map((id) => trackMap.get(id))
        .filter((track): track is Track => Boolean(track)),
      libraryState: isLibraryState(meta.libraryState) ? meta.libraryState : "uninitialized",
      lastKnownVersion:
        typeof meta.lastKnownVersion === "number" && Number.isFinite(meta.lastKnownVersion)
          ? meta.lastKnownVersion
          : 0,
    },
    metadata: normalizeSongsStateMetadata(meta, new Date().toISOString()),
  };
}

async function readLegacySongsState(
  redis: Redis,
  username: string
): Promise<{ data: SongsSnapshotData; metadata: SongsStateMetadata } | null> {
  const legacy = parseJson<PersistedSongsLegacyState>(
    await redis.get(legacySongsStateKey(username))
  );

  if (!legacy) {
    return null;
  }

  const data = normalizeSongsSnapshotData(legacy.data);
  if (!data) {
    return null;
  }

  const fallbackTimestamp = new Date().toISOString();
  return {
    data,
    metadata: normalizeSongsStateMetadata(legacy, fallbackTimestamp),
  };
}

export async function readSongsState(
  redis: Redis,
  username: string
): Promise<{ data: SongsSnapshotData; metadata: SongsStateMetadata } | null> {
  const stored = await readStoredSongsState(redis, username);
  if (stored) {
    return stored;
  }

  const legacy = await readLegacySongsState(redis, username);
  if (!legacy) {
    return null;
  }

  await writeSongsState(redis, username, legacy.data, legacy.metadata);
  await redis.del(legacySongsStateKey(username));
  return legacy;
}

export async function writeSongsState(
  redis: Redis,
  username: string,
  data: SongsSnapshotData,
  options: WriteSongsStateOptions = {}
): Promise<SongsStateMetadata> {
  const normalized = normalizeSongsSnapshotData(data) ?? {
    tracks: [],
    libraryState: "uninitialized" as const,
    lastKnownVersion: 0,
  };
  const existingState = await readStoredSongsState(redis, username);
  const now = new Date().toISOString();
  const metadata = normalizeSongsStateMetadata(
    {
      updatedAt: options.updatedAt,
      version: options.version,
      createdAt: options.createdAt ?? existingState?.metadata.createdAt,
      syncVersion: options.syncVersion ?? existingState?.metadata.syncVersion,
    },
    now
  );
  const trackOrder = buildTrackOrder(normalized.tracks);
  const previousTrackIds = new Set(existingState?.data.tracks.map((track) => track.id) ?? []);
  const nextTrackIds = new Set(trackOrder);
  const trackKeysToDelete = Array.from(previousTrackIds)
    .filter((id) => !nextTrackIds.has(id))
    .map((id) => getSongLibraryTrackKey(username, id));

  const pipeline = redis.pipeline();
  for (const track of normalized.tracks) {
    pipeline.set(getSongLibraryTrackKey(username, track.id), JSON.stringify(track));
  }
  if (trackKeysToDelete.length > 0) {
    pipeline.del(...trackKeysToDelete);
  }
  pipeline.set(
    getSongLibraryMetaKey(username),
    JSON.stringify({
      trackOrder,
      libraryState: normalized.libraryState,
      lastKnownVersion: normalized.lastKnownVersion,
      ...metadata,
    } satisfies PersistedSongsLibraryMeta)
  );
  await pipeline.exec();

  await writeSyncMetaEntry(redis, username, metadata);
  await redis.del(legacySongsStateKey(username));

  return metadata;
}
