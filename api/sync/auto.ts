/**
 * GET /api/sync/auto - Get auto-sync metadata for all domains
 * GET /api/sync/auto?domain=<domain> - Download one auto-sync domain blob
 * POST /api/sync/auto - Save auto-sync metadata for one domain
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Redis } from "@upstash/redis";
import { del, head } from "@vercel/blob";
import {
  AUTO_SYNC_SNAPSHOT_VERSION,
  BLOB_SYNC_DOMAINS,
  createEmptyCloudSyncMetadataMap,
  isBlobSyncDomain,
  type BlobSyncDomain,
} from "../../src/utils/cloudSyncShared.js";
import { apiHandler } from "../_utils/api-handler.js";

export const runtime = "nodejs";
export const maxDuration = 60;

interface PersistedAutoSyncDomainMetadata {
  updatedAt: string;
  version: number;
  totalSize: number;
  blobUrl: string;
  createdAt: string;
}

type PersistedAutoSyncMetadataMap = Record<
  BlobSyncDomain,
  PersistedAutoSyncDomainMetadata | null
>;

interface SaveAutoSyncMetadataBody {
  domain?: BlobSyncDomain;
  blobUrl?: string;
  updatedAt?: string;
  version?: number;
  totalSize?: number;
}

function metaKey(username: string) {
  return `sync:auto:meta:${username}`;
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
      typeof candidate.blobUrl !== "string"
    ) {
      normalized[domain] = null;
      continue;
    }

    normalized[domain] = {
      updatedAt: candidate.updatedAt,
      createdAt: candidate.createdAt,
      blobUrl: candidate.blobUrl,
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
      await handleSaveMetadata(res, redis, username, body);
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  }
);

async function handleSaveMetadata(
  res: VercelResponse,
  redis: Redis,
  username: string,
  body: SaveAutoSyncMetadataBody | null
): Promise<void> {
  if (
    !body ||
    !isBlobSyncDomain(body.domain as never) ||
    !body.blobUrl ||
    !body.updatedAt
  ) {
    res.status(400).json({
      error: "Missing required fields: domain, blobUrl, updatedAt",
    });
    return;
  }

  const blobInfo = await head(body.blobUrl).catch(() => null);
  if (!blobInfo) {
    res.status(400).json({ error: "Invalid blob URL: blob not found" });
    return;
  }

  try {
    const existing = await readPersistedMetadata(redis, username);
    const previous = existing[body.domain];

    if (previous?.blobUrl && previous.blobUrl !== body.blobUrl) {
      try {
        await del(previous.blobUrl);
      } catch {
        // Ignore stale blob cleanup failures.
      }
    }

    existing[body.domain] = {
      updatedAt: body.updatedAt,
      version: body.version || AUTO_SYNC_SNAPSHOT_VERSION,
      totalSize: body.totalSize || blobInfo.size,
      blobUrl: body.blobUrl,
      createdAt: new Date().toISOString(),
    };

    await redis.set(metaKey(username), JSON.stringify(existing));

    res.status(200).json({
      ok: true,
      domain: body.domain,
      metadata: {
        updatedAt: existing[body.domain]?.updatedAt,
        version: existing[body.domain]?.version,
        totalSize: existing[body.domain]?.totalSize,
        createdAt: existing[body.domain]?.createdAt,
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

    if (!entry?.blobUrl) {
      res.status(404).json({ error: `No ${domain} sync data found` });
      return;
    }

    const blobInfo = await head(entry.blobUrl).catch(() => null);
    if (!blobInfo) {
      metadata[domain] = null;
      await redis.set(metaKey(username), JSON.stringify(metadata));
      res.status(404).json({
        error: `${domain} sync data not found. It may have expired.`,
      });
      return;
    }

    // Return the CDN URL so the client can download the blob directly,
    // avoiding server-side proxy timeouts for large files.
    res.status(200).json({
      ok: true,
      domain,
      blobUrl: entry.blobUrl,
      metadata: {
        updatedAt: entry.updatedAt,
        version: entry.version,
        totalSize: entry.totalSize,
        createdAt: entry.createdAt,
      },
    });
  } catch (error) {
    console.error(`Error downloading ${domain} auto-sync data:`, error);
    res.status(500).json({ error: `Failed to download ${domain} sync data` });
  }
}
