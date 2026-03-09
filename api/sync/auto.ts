/**
 * GET /api/sync/auto - Get auto-sync metadata for all domains
 * GET /api/sync/auto?domain=<domain> - Download one auto-sync domain blob
 * POST /api/sync/auto - Save auto-sync metadata for one domain
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Redis } from "../_utils/redis.js";
import {
  AUTO_SYNC_SNAPSHOT_VERSION,
  BLOB_SYNC_DOMAINS,
  createEmptyCloudSyncMetadataMap,
  getSyncChannelName,
  isBlobSyncDomain,
  type BlobSyncDomain,
} from "../../src/utils/cloudSyncShared.js";
import { apiHandler } from "../_utils/api-handler.js";
import { triggerRealtimeEvent } from "../_utils/realtime.js";
import {
  createSignedDownloadUrl,
  deleteStoredObject,
  headStoredObject,
} from "../_utils/storage.js";

export const runtime = "nodejs";
export const maxDuration = 60;

interface PersistedAutoSyncDomainMetadata {
  updatedAt: string;
  version: number;
  totalSize: number;
  storageUrl?: string;
  blobUrl?: string;
  createdAt: string;
}

type PersistedAutoSyncMetadataMap = Record<
  BlobSyncDomain,
  PersistedAutoSyncDomainMetadata | null
>;

interface SaveAutoSyncMetadataBody {
  domain?: BlobSyncDomain;
  storageUrl?: string;
  blobUrl?: string;
  updatedAt?: string;
  version?: number;
  totalSize?: number;
}

function metaKey(username: string) {
  return `sync:auto:meta:${username}`;
}

function getStoredLocation(value: {
  storageUrl?: string | null;
  blobUrl?: string | null;
}): string | null {
  return value.storageUrl || value.blobUrl || null;
}

async function readPersistedMetadata(
  redis: Redis,
  username: string
): Promise<PersistedAutoSyncMetadataMap> {
  const raw = await redis.get<string | PersistedAutoSyncMetadataMap>(metaKey(username));
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  const normalized = createEmptyCloudSyncMetadataMap() as PersistedAutoSyncMetadataMap;

  if (!parsed || typeof parsed !== "object") {
    return normalized;
  }

  for (const domain of BLOB_SYNC_DOMAINS) {
    const value = (parsed as Partial<Record<BlobSyncDomain, unknown>>)[domain];
    if (!value || typeof value !== "object") {
      normalized[domain] = null;
      continue;
    }

    const candidate = value as Partial<PersistedAutoSyncDomainMetadata>;
    if (
      typeof candidate.updatedAt !== "string" ||
      typeof candidate.createdAt !== "string" ||
      typeof getStoredLocation(candidate) !== "string"
    ) {
      normalized[domain] = null;
      continue;
    }

    const storageUrl = getStoredLocation(candidate)!;
    normalized[domain] = {
      updatedAt: candidate.updatedAt,
      createdAt: candidate.createdAt,
      storageUrl,
      blobUrl: storageUrl,
      version:
        typeof candidate.version === "number" && Number.isFinite(candidate.version)
          ? candidate.version
          : AUTO_SYNC_SNAPSHOT_VERSION,
      totalSize:
        typeof candidate.totalSize === "number" &&
        Number.isFinite(candidate.totalSize)
          ? candidate.totalSize
          : 0,
    };
  }

  return normalized;
}

function getRequestedDomain(req: VercelRequest): BlobSyncDomain | null {
  const raw = Array.isArray(req.query.domain)
    ? req.query.domain[0]
    : req.query.domain;

  return isBlobSyncDomain(raw as never) ? (raw as BlobSyncDomain) : null;
}

export default apiHandler<SaveAutoSyncMetadataBody>(
  {
    methods: ["GET", "POST"],
    auth: "required",
    parseJsonBody: true,
  },
  async ({ req, res, redis, user, body }): Promise<void> => {
    const username = user?.username || "";
    const method = (req.method || "GET").toUpperCase();

    if (method === "GET") {
      const domain = getRequestedDomain(req);
      if (req.query.domain && !domain) {
        res.status(400).json({ error: "Invalid sync domain" });
        return;
      }

      if (domain) {
        await handleDomainDownload(res, redis, username, domain);
        return;
      }

      const metadata = await readPersistedMetadata(redis, username);
      res.status(200).json({ ok: true, metadata });
      return;
    }

    if (method === "POST") {
      const sourceSessionId =
        typeof req.headers["x-sync-session-id"] === "string"
          ? req.headers["x-sync-session-id"]
          : undefined;
      await handleSaveMetadata(res, redis, username, body, sourceSessionId);
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  }
);

async function handleSaveMetadata(
  res: VercelResponse,
  redis: Redis,
  username: string,
  body: SaveAutoSyncMetadataBody | null,
  sourceSessionId: string | undefined
): Promise<void> {
  const storageUrl = body ? getStoredLocation(body) : null;
  if (
    !body ||
    !isBlobSyncDomain(body.domain as never) ||
    !storageUrl ||
    !body.updatedAt
  ) {
    res.status(400).json({
      error: "Missing required fields: domain, storageUrl, updatedAt",
    });
    return;
  }

  const objectInfo = await headStoredObject(storageUrl).catch(() => null);
  if (!objectInfo) {
    res.status(400).json({ error: "Invalid storage URL: object not found" });
    return;
  }

  try {
    const existing = await readPersistedMetadata(redis, username);
    const previous = existing[body.domain];

    const previousStorageUrl = previous ? getStoredLocation(previous) : null;
    if (previousStorageUrl && previousStorageUrl !== storageUrl) {
      try {
        await deleteStoredObject(previousStorageUrl);
      } catch {
        // Ignore stale object cleanup failures.
      }
    }

    existing[body.domain] = {
      updatedAt: body.updatedAt,
      version: body.version || AUTO_SYNC_SNAPSHOT_VERSION,
      totalSize: body.totalSize || objectInfo.size,
      storageUrl,
      blobUrl: storageUrl,
      createdAt: new Date().toISOString(),
    };

    await redis.set(metaKey(username), JSON.stringify(existing));

    try {
      const channel = getSyncChannelName(username);
      const payload = {
        domain: body.domain,
        updatedAt: existing[body.domain]!.updatedAt,
        ...(sourceSessionId && { sourceSessionId }),
      };
      await triggerRealtimeEvent(channel, "domain-updated", payload);
    } catch (realtimeErr) {
      console.warn("[sync/auto] Failed to broadcast domain-updated:", realtimeErr);
    }

    const saved = existing[body.domain]!;
    res.status(200).json({
      ok: true,
      domain: body.domain,
      metadata: {
        updatedAt: saved.updatedAt,
        version: saved.version,
        totalSize: saved.totalSize,
        createdAt: saved.createdAt,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Error saving auto-sync metadata:", message, error);
    res.status(500).json({
      error: `Failed to save auto-sync metadata: ${message}`,
    });
  }
}

async function handleDomainDownload(
  res: VercelResponse,
  redis: Redis,
  username: string,
  domain: BlobSyncDomain
): Promise<void> {
  try {
    const metadata = await readPersistedMetadata(redis, username);
    const entry = metadata[domain];
    const storageUrl = entry ? getStoredLocation(entry) : null;

    if (!storageUrl) {
      res.status(404).json({ error: `No ${domain} sync data found` });
      return;
    }

    const objectInfo = await headStoredObject(storageUrl).catch(() => null);
    if (!objectInfo) {
      metadata[domain] = null;
      await redis.set(metaKey(username), JSON.stringify(metadata));
      res.status(404).json({
        error: `${domain} sync data not found. It may have expired.`,
      });
      return;
    }

    const downloadUrl = await createSignedDownloadUrl(storageUrl);
    res.status(200).json({
      ok: true,
      domain,
      downloadUrl,
      blobUrl: downloadUrl,
      metadata: {
        updatedAt: entry.updatedAt,
        version: entry.version,
        totalSize: entry.totalSize || objectInfo.size,
        createdAt: entry.createdAt,
      },
    });
  } catch (error) {
    console.error(`Error downloading ${domain} auto-sync data:`, error);
    res.status(500).json({ error: `Failed to download ${domain} sync data` });
  }
}
