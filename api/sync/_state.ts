import type { Redis } from "../_utils/redis.js";
import {
  AUTO_SYNC_SNAPSHOT_VERSION,
  REDIS_SYNC_DOMAINS,
  getSyncChannelName,
  isRedisSyncDomain,
  type CloudSyncDomainMetadata,
  type RedisSyncDomain,
} from "../../src/utils/cloudSyncShared.js";
import {
  advanceCloudSyncVersion,
  assessCloudSyncWrite,
  createSyntheticLegacySyncVersion,
  normalizeCloudSyncVersionState,
  normalizeCloudSyncWriteVersion,
  type CloudSyncVersionState,
  type CloudSyncWriteVersion,
} from "../../src/utils/cloudSyncVersion.js";
import {
  applyFilesMetadataRedisPatch,
  isFilesMetadataRedisPatchPayload,
  type FilesMetadataSyncSnapshot,
} from "../../src/utils/cloudSyncFileMerge.js";
import { isSerializedContact } from "../../src/utils/contacts.js";
import { triggerRealtimeEvent } from "../_utils/realtime.js";
import {
  isSongsSnapshotData,
  readSongsState,
  writeSongsState,
  type SongsSnapshotData,
} from "../_utils/song-library-state.js";
import { redisStateKey, redisStateMetaKey } from "./_keys.js";

interface PersistedRedisStateDomain {
  data: unknown;
  updatedAt: string;
  version: number;
  createdAt: string;
  syncVersion?: CloudSyncVersionState | null;
}

export interface PutStateBody {
  domain?: string;
  data?: unknown;
  updatedAt?: string;
  version?: number;
  syncVersion?: CloudSyncWriteVersion;
}

function normalizeFilesMetadataForPatch(data: unknown): FilesMetadataSyncSnapshot {
  if (!data || typeof data !== "object") {
    return {
      items: {},
      libraryState: "uninitialized",
      documents: [],
      deletedPaths: {},
    };
  }
  const d = data as Record<string, unknown>;
  return {
    items: (d.items as FilesMetadataSyncSnapshot["items"]) || {},
    libraryState:
      (d.libraryState as FilesMetadataSyncSnapshot["libraryState"]) ||
      "uninitialized",
    documents: Array.isArray(d.documents)
      ? (d.documents as FilesMetadataSyncSnapshot["documents"])
      : [],
    deletedPaths:
      (d.deletedPaths as FilesMetadataSyncSnapshot["deletedPaths"]) || {},
  };
}

function isContactsSnapshotData(value: unknown): value is { contacts: unknown[] } {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    Array.isArray((value as { contacts?: unknown[] }).contacts) &&
    (value as { contacts: unknown[] }).contacts.every(isSerializedContact)
  );
}

export function stateKey(username: string, domain: RedisSyncDomain): string {
  return redisStateKey(username, domain);
}

function metaKey(username: string): string {
  return redisStateMetaKey(username);
}

interface PersistedMetaEntry {
  updatedAt: string;
  version: number;
  createdAt: string;
  syncVersion?: CloudSyncVersionState | null;
}

type PersistedMetaMap = Record<RedisSyncDomain, PersistedMetaEntry | null>;

export interface RedisStateDomainPayload {
  ok: true;
  domain: RedisSyncDomain;
  data: unknown;
  metadata: CloudSyncDomainMetadata;
}

export type PutRedisStateDomainResult =
  | {
      ok: true;
      domain: RedisSyncDomain;
      metadata: CloudSyncDomainMetadata | null;
      duplicate?: boolean;
    }
  | {
      ok: false;
      status: 400 | 409 | 500;
      error: string;
      code?: string;
      metadata?: CloudSyncDomainMetadata | null;
    };

function createEmptyMetaMap(): PersistedMetaMap {
  const map = {} as PersistedMetaMap;
  for (const domain of REDIS_SYNC_DOMAINS) {
    map[domain] = null;
  }
  return map;
}

function normalizePersistedMetaEntry(value: unknown): PersistedMetaEntry | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<PersistedMetaEntry>;
  if (
    typeof candidate.updatedAt !== "string" ||
    typeof candidate.createdAt !== "string"
  ) {
    return null;
  }

  return {
    updatedAt: candidate.updatedAt,
    createdAt: candidate.createdAt,
    version:
      typeof candidate.version === "number" && Number.isFinite(candidate.version)
        ? candidate.version
        : AUTO_SYNC_SNAPSHOT_VERSION,
    syncVersion:
      normalizeCloudSyncVersionState(candidate.syncVersion) ||
      createSyntheticLegacySyncVersion(),
  };
}

export async function readStateMetaMap(
  redis: Redis,
  username: string
): Promise<PersistedMetaMap> {
  const raw = await redis.get<string | PersistedMetaMap>(metaKey(username));
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  const normalized = createEmptyMetaMap();

  if (!parsed || typeof parsed !== "object") {
    return normalized;
  }

  for (const domain of REDIS_SYNC_DOMAINS) {
    const entry = normalizePersistedMetaEntry(
      (parsed as Record<string, unknown>)[domain]
    );
    if (entry) {
      normalized[domain] = entry;
    }
  }

  return normalized;
}

async function persistStateEntry(
  redis: Redis,
  username: string,
  domain: RedisSyncDomain,
  entry: PersistedRedisStateDomain
): Promise<void> {
  await redis.set(stateKey(username, domain), JSON.stringify(entry));

  const meta = await readStateMetaMap(redis, username);
  meta[domain] = {
    updatedAt: entry.updatedAt,
    version: entry.version,
    createdAt: entry.createdAt,
    syncVersion: entry.syncVersion,
  };
  await redis.set(metaKey(username), JSON.stringify(meta));
}

export async function getRedisStateDomainPayload(
  redis: Redis,
  username: string,
  domain: RedisSyncDomain
): Promise<RedisStateDomainPayload | null> {
  if (domain === "songs") {
    const songsState = await readSongsState(redis, username);
    if (!songsState) {
      return null;
    }

    return {
      ok: true,
      domain,
      data: songsState.data,
      metadata: {
        updatedAt: songsState.metadata.updatedAt,
        version: songsState.metadata.version,
        totalSize: 0,
        createdAt: songsState.metadata.createdAt,
        syncVersion:
          songsState.metadata.syncVersion || createSyntheticLegacySyncVersion(),
      },
    };
  }

  const raw = await redis.get<string | PersistedRedisStateDomain>(
    stateKey(username, domain)
  );
  const entry: PersistedRedisStateDomain | null =
    typeof raw === "string" ? JSON.parse(raw) : raw;

  if (!entry) {
    return null;
  }

  return {
    ok: true,
    domain,
    data: entry.data,
    metadata: {
      updatedAt: entry.updatedAt,
      version: entry.version,
      totalSize: 0,
      createdAt: entry.createdAt,
      syncVersion:
        entry.syncVersion || createSyntheticLegacySyncVersion(),
    },
  };
}

export async function putRedisStateDomain(
  redis: Redis,
  username: string,
  body: PutStateBody | null,
  sourceSessionId: string | undefined
): Promise<PutRedisStateDomainResult> {
  if (!body || !body.domain || body.data === undefined || !body.updatedAt) {
    return {
      ok: false,
      status: 400,
      error: "Missing required fields: domain, data, updatedAt",
    };
  }

  if (!isRedisSyncDomain(body.domain as never)) {
    return {
      ok: false,
      status: 400,
      error: "Invalid or non-Redis sync domain",
    };
  }

  const domain = body.domain as RedisSyncDomain;
  if (domain === "contacts" && !isContactsSnapshotData(body.data)) {
    return {
      ok: false,
      status: 400,
      error: "Invalid contacts snapshot payload",
    };
  }
  if (domain === "songs" && !isSongsSnapshotData(body.data)) {
    return {
      ok: false,
      status: 400,
      error: "Invalid songs snapshot payload",
    };
  }

  const writeSyncVersion = normalizeCloudSyncWriteVersion(body.syncVersion);
  if (!writeSyncVersion) {
    return {
      ok: false,
      status: 400,
      error: "Missing or invalid syncVersion payload",
    };
  }

  let existingMetadata: CloudSyncDomainMetadata | null = null;
  let existingVersionState: CloudSyncVersionState | null = null;
  let existingRedisEntry: PersistedRedisStateDomain | null = null;

  if (domain === "songs") {
    const existingSongsState = await readSongsState(redis, username);
    if (existingSongsState) {
      existingVersionState =
        existingSongsState.metadata.syncVersion || createSyntheticLegacySyncVersion();
      existingMetadata = {
        updatedAt: existingSongsState.metadata.updatedAt,
        version: existingSongsState.metadata.version,
        totalSize: 0,
        createdAt: existingSongsState.metadata.createdAt,
        syncVersion: existingVersionState,
      };
    }
  } else {
    const existingRaw = await redis.get<string | PersistedRedisStateDomain>(
      stateKey(username, domain)
    );
    const parsed =
      typeof existingRaw === "string" ? JSON.parse(existingRaw) : existingRaw;
    if (parsed) {
      existingRedisEntry = parsed as PersistedRedisStateDomain;
      existingVersionState =
        normalizeCloudSyncVersionState(existingRedisEntry.syncVersion) ||
        createSyntheticLegacySyncVersion();
      existingMetadata = {
        updatedAt: existingRedisEntry.updatedAt,
        version: existingRedisEntry.version,
        totalSize: 0,
        createdAt: existingRedisEntry.createdAt,
        syncVersion: existingVersionState,
      };
    }
  }

  const writeAssessment = assessCloudSyncWrite(existingVersionState, writeSyncVersion);
  if (writeAssessment.duplicate) {
    return {
      ok: true,
      domain,
      metadata: existingMetadata,
      duplicate: true,
    };
  }

  if (writeAssessment.hasConflict && existingMetadata) {
    return {
      ok: false,
      status: 409,
      error: `Cloud sync conflict for ${domain}. Download remote changes before replacing this domain.`,
      code: "sync_conflict",
      metadata: existingMetadata,
    };
  }

  const now = new Date().toISOString();
  const nextSyncVersion = advanceCloudSyncVersion(
    existingVersionState,
    writeSyncVersion
  );

  let dataToPersist: unknown = body.data;
  if (domain === "files-metadata" && isFilesMetadataRedisPatchPayload(body.data)) {
    if (!existingRedisEntry?.data) {
      return {
        ok: false,
        status: 400,
        error: "files-metadata patch requires an existing snapshot (use full upload first)",
      };
    }
    if (existingRedisEntry.updatedAt !== body.data.baseUpdatedAt) {
      return {
        ok: false,
        status: 409,
        error:
          "files-metadata is out of date on the server. Download the latest snapshot and retry.",
        code: "sync_conflict",
        metadata: existingMetadata,
      };
    }
    dataToPersist = applyFilesMetadataRedisPatch(
      normalizeFilesMetadataForPatch(existingRedisEntry.data),
      body.data
    );
  }

  const entry: PersistedRedisStateDomain = {
    data: dataToPersist,
    updatedAt: body.updatedAt,
    version: body.version || AUTO_SYNC_SNAPSHOT_VERSION,
    createdAt: now,
    syncVersion: nextSyncVersion,
  };

  try {
    let metadata: CloudSyncDomainMetadata;
    if (domain === "songs") {
      const songsMetadata = await writeSongsState(
        redis,
        username,
        body.data as SongsSnapshotData,
        {
          updatedAt: entry.updatedAt,
          version: entry.version,
          createdAt: entry.createdAt,
          syncVersion: entry.syncVersion,
        }
      );
      metadata = {
        updatedAt: songsMetadata.updatedAt,
        version: songsMetadata.version,
        totalSize: 0,
        createdAt: songsMetadata.createdAt,
        syncVersion:
          songsMetadata.syncVersion || createSyntheticLegacySyncVersion(),
      };
    } else {
      await persistStateEntry(redis, username, domain, entry);
      metadata = {
        updatedAt: entry.updatedAt,
        version: entry.version,
        totalSize: 0,
        createdAt: entry.createdAt,
        syncVersion: entry.syncVersion,
      };
    }

    try {
      const channel = getSyncChannelName(username);
      const payload = {
        domain,
        updatedAt: entry.updatedAt,
        syncVersion: metadata.syncVersion,
        ...(sourceSessionId && { sourceSessionId }),
      };
      await triggerRealtimeEvent(channel, "domain-updated", payload);
    } catch (realtimeErr) {
      console.warn("[sync/state] Failed to broadcast domain-updated:", realtimeErr);
    }

    return {
      ok: true,
      domain,
      metadata,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Error saving Redis state:", message, error);
    return {
      ok: false,
      status: 500,
      error: `Failed to save state: ${message}`,
    };
  }
}

