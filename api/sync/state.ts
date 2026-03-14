/**
 * GET /api/sync/state          - Get metadata for all Redis-direct sync domains
 * GET /api/sync/state?domain=X - Download one Redis-direct domain's JSON data
 * PUT /api/sync/state          - Write a JSON snapshot for one Redis-direct domain
 */

import type { VercelResponse } from "@vercel/node";
import type { Redis } from "../_utils/redis.js";
import { gunzipSync } from "node:zlib";
import {
  AUTO_SYNC_SNAPSHOT_VERSION,
  getSyncChannelName,
  REDIS_SYNC_DOMAINS,
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
import { isSerializedContact } from "../../src/utils/contacts.js";
import { apiHandler } from "../_utils/api-handler.js";
import { triggerRealtimeEvent } from "../_utils/realtime.js";
import {
  isSongsSnapshotData,
  readSongsState,
  writeSongsState,
  type SongsSnapshotData,
} from "../_utils/song-library-state.js";

export const runtime = "nodejs";
export const maxDuration = 30;

interface PersistedRedisStateDomain {
  data: unknown;
  updatedAt: string;
  version: number;
  createdAt: string;
  syncVersion?: CloudSyncVersionState | null;
}

interface PutStateBody {
  domain?: string;
  data?: unknown;
  updatedAt?: string;
  version?: number;
  syncVersion?: CloudSyncWriteVersion;
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
  return `sync:state:${username}:${domain}`;
}

function metaKey(username: string): string {
  return `sync:state:meta:${username}`;
}

interface PersistedMetaEntry {
  updatedAt: string;
  version: number;
  createdAt: string;
  syncVersion?: CloudSyncVersionState | null;
}

interface PersistedAutoSyncDomainMetadata extends PersistedMetaEntry {
  totalSize: number;
  blobUrl: string;
}

const LEGACY_FILES_DOCUMENTS_DOMAIN = "files-documents";

type PersistedMetaMap = Record<RedisSyncDomain, PersistedMetaEntry | null>;

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

async function readMetaMap(
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

function autoMetaKey(username: string): string {
  return `sync:auto:meta:${username}`;
}

async function readLegacyFilesDocumentsMeta(
  redis: Redis,
  username: string
): Promise<PersistedAutoSyncDomainMetadata | null> {
  const raw = await redis.get<string | Record<string, unknown>>(autoMetaKey(username));
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;

  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const entry = (parsed as Record<string, unknown>)[LEGACY_FILES_DOCUMENTS_DOMAIN];
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const candidate = entry as Partial<PersistedAutoSyncDomainMetadata>;
  if (
    typeof candidate.updatedAt !== "string" ||
    typeof candidate.createdAt !== "string" ||
    typeof candidate.blobUrl !== "string"
  ) {
    return null;
  }

  return {
    updatedAt: candidate.updatedAt,
    createdAt: candidate.createdAt,
    blobUrl: candidate.blobUrl,
    version:
      typeof candidate.version === "number" && Number.isFinite(candidate.version)
        ? candidate.version
        : AUTO_SYNC_SNAPSHOT_VERSION,
    totalSize:
      typeof candidate.totalSize === "number" && Number.isFinite(candidate.totalSize)
        ? candidate.totalSize
        : 0,
    syncVersion:
      normalizeCloudSyncVersionState(candidate.syncVersion) ||
      createSyntheticLegacySyncVersion(),
  };
}

async function readLegacyFilesDocumentsData(
  blobUrl: string
): Promise<unknown[] | null> {
  const response = await fetch(blobUrl);
  if (!response.ok) {
    return null;
  }

  const compressedBuffer = Buffer.from(await response.arrayBuffer());
  const jsonString = gunzipSync(compressedBuffer).toString("utf-8");
  const parsed = JSON.parse(jsonString) as { data?: unknown } | unknown;

  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (
    parsed &&
    typeof parsed === "object" &&
    Array.isArray((parsed as { data?: unknown[] }).data)
  ) {
    return (parsed as { data: unknown[] }).data;
  }

  return null;
}

function getCombinedFilesMetadataEntry(
  stateEntry: PersistedMetaEntry | null,
  legacyEntry: PersistedAutoSyncDomainMetadata | null
): CloudSyncDomainMetadata | null {
  if (!stateEntry && !legacyEntry) {
    return null;
  }

  if (
    legacyEntry &&
    (!stateEntry ||
      new Date(legacyEntry.updatedAt).getTime() >
        new Date(stateEntry.updatedAt).getTime())
  ) {
    return {
      updatedAt: legacyEntry.updatedAt,
      version: legacyEntry.version,
      totalSize: legacyEntry.totalSize,
      createdAt: legacyEntry.createdAt,
      syncVersion: legacyEntry.syncVersion,
    };
  }

  if (!stateEntry) {
    return null;
  }

  return {
    updatedAt: stateEntry.updatedAt,
    version: stateEntry.version,
    totalSize: 0,
    createdAt: stateEntry.createdAt,
    syncVersion: stateEntry.syncVersion,
  };
}

async function persistStateEntry(
  redis: Redis,
  username: string,
  domain: RedisSyncDomain,
  entry: PersistedRedisStateDomain
): Promise<void> {
  await redis.set(stateKey(username, domain), JSON.stringify(entry));

  const meta = await readMetaMap(redis, username);
  meta[domain] = {
    updatedAt: entry.updatedAt,
    version: entry.version,
    createdAt: entry.createdAt,
    syncVersion: entry.syncVersion,
  };
  await redis.set(metaKey(username), JSON.stringify(meta));
}

export default apiHandler<PutStateBody>(
  {
    methods: ["GET", "PUT"],
    auth: "required",
    parseJsonBody: true,
  },
  async ({ req, res, redis, user, body }): Promise<void> => {
    const username = user?.username || "";
    const method = (req.method || "GET").toUpperCase();

    if (method === "GET") {
      const rawDomain = Array.isArray(req.query.domain)
        ? req.query.domain[0]
        : req.query.domain;

      if (rawDomain && !isRedisSyncDomain(rawDomain as never)) {
        res.status(400).json({ error: "Invalid or non-Redis sync domain" });
        return;
      }

      if (rawDomain && isRedisSyncDomain(rawDomain as never)) {
        await handleDomainDownload(res, redis, username, rawDomain as RedisSyncDomain);
        return;
      }

      const meta = await readMetaMap(redis, username);
      const legacyFilesDocumentsMeta = await readLegacyFilesDocumentsMeta(
        redis,
        username
      );
      const metadata: Record<string, CloudSyncDomainMetadata | null> = {};
      for (const domain of REDIS_SYNC_DOMAINS) {
        const entry = meta[domain];
        metadata[domain] =
          domain === "files-metadata"
            ? getCombinedFilesMetadataEntry(entry, legacyFilesDocumentsMeta)
            : entry
              ? {
                  updatedAt: entry.updatedAt,
                  version: entry.version,
                  totalSize: 0,
                  createdAt: entry.createdAt,
                  syncVersion: entry.syncVersion,
                }
              : null;
      }

      res.status(200).json({ ok: true, metadata });
      return;
    }

    if (method === "PUT") {
      const sourceSessionId =
        typeof req.headers["x-sync-session-id"] === "string"
          ? req.headers["x-sync-session-id"]
          : undefined;
      await handlePutState(res, redis, username, body, sourceSessionId);
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  }
);

async function handleDomainDownload(
  res: VercelResponse,
  redis: Redis,
  username: string,
  domain: RedisSyncDomain
): Promise<void> {
  if (domain === "songs") {
    const songsState = await readSongsState(redis, username);
    if (!songsState) {
      res.status(404).json({ error: `No ${domain} state found` });
      return;
    }

    res.status(200).json({
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
    });
    return;
  }

  const raw = await redis.get<string | PersistedRedisStateDomain>(
    stateKey(username, domain)
  );
  const entry: PersistedRedisStateDomain | null =
    typeof raw === "string" ? JSON.parse(raw) : raw;

  if (!entry) {
    res.status(404).json({ error: `No ${domain} state found` });
    return;
  }

  let responseEntry = entry;

  if (domain === "files-metadata") {
    const entryData =
      entry.data && typeof entry.data === "object"
        ? (entry.data as Record<string, unknown>)
        : null;
    const documentsMissing = !Array.isArray(entryData?.documents);

    if (documentsMissing) {
      const legacyMeta = await readLegacyFilesDocumentsMeta(redis, username);
      if (legacyMeta) {
        const legacyDocuments = await readLegacyFilesDocumentsData(legacyMeta.blobUrl);
        if (legacyDocuments) {
          responseEntry = {
            ...entry,
            updatedAt:
              new Date(legacyMeta.updatedAt).getTime() >
              new Date(entry.updatedAt).getTime()
                ? legacyMeta.updatedAt
                : entry.updatedAt,
            version: Math.max(entry.version, legacyMeta.version),
            syncVersion:
              new Date(legacyMeta.updatedAt).getTime() >
              new Date(entry.updatedAt).getTime()
                ? legacyMeta.syncVersion
                : entry.syncVersion,
            data: {
              ...(entryData || {}),
              documents: legacyDocuments,
            },
          };

          await persistStateEntry(redis, username, domain, responseEntry);
        }
      }
    }
  }

  res.status(200).json({
    ok: true,
    domain,
    data: responseEntry.data,
    metadata: {
      updatedAt: responseEntry.updatedAt,
      version: responseEntry.version,
      totalSize: 0,
      createdAt: responseEntry.createdAt,
      syncVersion:
        responseEntry.syncVersion || createSyntheticLegacySyncVersion(),
    },
  });
}

async function handlePutState(
  res: VercelResponse,
  redis: Redis,
  username: string,
  body: PutStateBody | null,
  sourceSessionId: string | undefined
): Promise<void> {
  if (!body || !body.domain || body.data === undefined || !body.updatedAt) {
    res.status(400).json({
      error: "Missing required fields: domain, data, updatedAt",
    });
    return;
  }

  if (!isRedisSyncDomain(body.domain as never)) {
    res.status(400).json({ error: "Invalid or non-Redis sync domain" });
    return;
  }

  const domain = body.domain as RedisSyncDomain;
  if (domain === "contacts" && !isContactsSnapshotData(body.data)) {
    res.status(400).json({
      error: "Invalid contacts snapshot payload",
    });
    return;
  }
  if (domain === "songs" && !isSongsSnapshotData(body.data)) {
    res.status(400).json({
      error: "Invalid songs snapshot payload",
    });
    return;
  }

  const writeSyncVersion = normalizeCloudSyncWriteVersion(body.syncVersion);
  if (!writeSyncVersion) {
    res.status(400).json({
      error: "Missing or invalid syncVersion payload",
    });
    return;
  }

  let existingMetadata: CloudSyncDomainMetadata | null = null;
  let existingVersionState: CloudSyncVersionState | null = null;

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
    const existingEntry =
      typeof existingRaw === "string" ? JSON.parse(existingRaw) : existingRaw;
    if (existingEntry) {
      existingVersionState =
        normalizeCloudSyncVersionState(existingEntry.syncVersion) ||
        createSyntheticLegacySyncVersion();
      existingMetadata = {
        updatedAt: existingEntry.updatedAt,
        version: existingEntry.version,
        totalSize: 0,
        createdAt: existingEntry.createdAt,
        syncVersion: existingVersionState,
      };
    }
  }

  const writeAssessment = assessCloudSyncWrite(existingVersionState, writeSyncVersion);
  if (writeAssessment.duplicate) {
    res.status(200).json({
      ok: true,
      domain,
      metadata: existingMetadata,
      duplicate: true,
    });
    return;
  }

  if (writeAssessment.hasConflict && existingMetadata) {
    res.status(409).json({
      error: `Cloud sync conflict for ${domain}. Download remote changes before replacing this domain.`,
      code: "sync_conflict",
      metadata: existingMetadata,
    });
    return;
  }

  const now = new Date().toISOString();
  const nextSyncVersion = advanceCloudSyncVersion(
    existingVersionState,
    writeSyncVersion
  );

  const entry: PersistedRedisStateDomain = {
    data: body.data,
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

    res.status(200).json({
      ok: true,
      domain,
      metadata,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Error saving Redis state:", message, error);
    res.status(500).json({ error: `Failed to save state: ${message}` });
  }
}
