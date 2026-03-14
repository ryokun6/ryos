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
  type CloudSyncBlobItemDownloadMetadata,
  type CloudSyncBlobItemMetadata,
  createEmptyCloudSyncMetadataMap,
  getSyncChannelName,
  isBlobSyncDomain,
  isIndividualBlobSyncDomain,
  type BlobSyncDomain,
} from "../../src/utils/cloudSyncShared.js";
import { normalizeCloudSyncRevision } from "../../src/utils/cloudSyncRevision.js";
import {
  normalizeDeletionMarkerMap,
  type DeletionMarkerMap,
} from "../../src/utils/cloudSyncDeletionMarkers.js";
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
  items?: Record<string, PersistedAutoSyncItemMetadata>;
  deletedItems?: DeletionMarkerMap;
}

type PersistedAutoSyncItemMetadata = CloudSyncBlobItemMetadata;

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
  baseVersion?: number;
  totalSize?: number;
  items?: Record<string, PersistedAutoSyncItemMetadata>;
  deletedItems?: DeletionMarkerMap;
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

function normalizePersistedItemMetadata(
  value: unknown
): PersistedAutoSyncItemMetadata | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<PersistedAutoSyncItemMetadata>;
  const storageUrl = getStoredLocation(candidate);
  if (
    typeof candidate.updatedAt !== "string" ||
    typeof candidate.signature !== "string" ||
    typeof candidate.size !== "number" ||
    !Number.isFinite(candidate.size) ||
    !storageUrl
  ) {
    return null;
  }

  return {
    updatedAt: candidate.updatedAt,
    signature: candidate.signature,
    size: candidate.size,
    ...(normalizeCloudSyncRevision(candidate.revision)
      ? { revision: normalizeCloudSyncRevision(candidate.revision) }
      : {}),
    storageUrl,
    blobUrl: storageUrl,
  };
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
    const normalizedItems: Record<string, PersistedAutoSyncItemMetadata> = {};
    const normalizedDeletedItems = normalizeDeletionMarkerMap(candidate.deletedItems);
    if (candidate.items && typeof candidate.items === "object") {
      for (const [itemKey, itemValue] of Object.entries(candidate.items)) {
        const normalizedItem = normalizePersistedItemMetadata(itemValue);
        if (normalizedItem) {
          normalizedItems[itemKey] = normalizedItem;
        }
      }
    }

    if (
      typeof candidate.updatedAt !== "string" ||
      typeof candidate.createdAt !== "string" ||
      (!isIndividualBlobSyncDomain(domain) &&
        typeof getStoredLocation(candidate) !== "string")
    ) {
      normalized[domain] = null;
      continue;
    }

    const storageUrl = getStoredLocation(candidate);
    normalized[domain] = {
      updatedAt: candidate.updatedAt,
      createdAt: candidate.createdAt,
      ...(storageUrl ? { storageUrl, blobUrl: storageUrl } : {}),
      version:
        typeof candidate.version === "number" && Number.isFinite(candidate.version)
          ? candidate.version
          : AUTO_SYNC_SNAPSHOT_VERSION,
      totalSize:
        typeof candidate.totalSize === "number" &&
        Number.isFinite(candidate.totalSize)
          ? candidate.totalSize
          : Object.values(normalizedItems).reduce((sum, item) => sum + item.size, 0),
      ...(isIndividualBlobSyncDomain(domain)
        ? { items: normalizedItems, deletedItems: normalizedDeletedItems }
        : {}),
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
  if (!body || !isBlobSyncDomain(body.domain as never) || !body.updatedAt) {
    res.status(400).json({
      error: "Missing required fields: domain, updatedAt",
    });
    return;
  }

  if (body.items && !isIndividualBlobSyncDomain(body.domain)) {
    res.status(400).json({
      error: "This sync domain does not support individual item manifests.",
    });
    return;
  }

  if (body.deletedItems && !isIndividualBlobSyncDomain(body.domain)) {
    res.status(400).json({
      error: "This sync domain does not support individual deletion markers.",
    });
    return;
  }

  try {
    const existing = await readPersistedMetadata(redis, username);
    const previous = existing[body.domain];
    const currentVersion = previous?.version ?? 0;
    const requestedBaseVersion =
      typeof body.baseVersion === "number" && Number.isFinite(body.baseVersion)
        ? body.baseVersion
        : null;

    if (requestedBaseVersion === null) {
      if (currentVersion > 0) {
        res.status(409).json({
          error: "sync_conflict: stale baseVersion",
          currentVersion,
        });
        return;
      }
    } else if (requestedBaseVersion !== currentVersion) {
      res.status(409).json({
        error: "sync_conflict: stale baseVersion",
        currentVersion,
      });
      return;
    }

    const createdAt = previous?.createdAt || new Date().toISOString();
    const nextVersion = Math.max(currentVersion + 1, AUTO_SYNC_SNAPSHOT_VERSION);
    const legacyStorageUrl = getStoredLocation(body);

    if (body.items) {
      const previousItems = previous?.items ?? {};
      const deletedItems = normalizeDeletionMarkerMap(body.deletedItems);
      const nextItems: Record<string, PersistedAutoSyncItemMetadata> = {};

      for (const [itemKey, itemValue] of Object.entries(body.items)) {
        const storageUrl = getStoredLocation(itemValue);
        if (
          !storageUrl ||
          typeof itemValue.updatedAt !== "string" ||
          typeof itemValue.signature !== "string" ||
          typeof itemValue.size !== "number" ||
          !Number.isFinite(itemValue.size)
        ) {
          res.status(400).json({
            error: `Invalid sync item metadata for "${itemKey}"`,
          });
          return;
        }

        const previousItem = previousItems[itemKey];
        const previousStorageUrl = previousItem
          ? getStoredLocation(previousItem)
          : null;
        const itemChanged =
          !previousItem ||
          previousItem.signature !== itemValue.signature ||
          previousStorageUrl !== storageUrl;

        if (!itemChanged) {
          nextItems[itemKey] = previousItem;
          continue;
        }

        const objectInfo = await headStoredObject(storageUrl).catch(() => null);
        if (!objectInfo) {
          res.status(400).json({
            error: `Invalid storage URL for "${itemKey}": object not found`,
          });
          return;
        }

        nextItems[itemKey] = {
          updatedAt: itemValue.updatedAt,
          signature: itemValue.signature,
          size: itemValue.size || objectInfo.size,
          storageUrl,
          blobUrl: storageUrl,
        };
      }

      const nextStorageUrls = new Set(
        Object.values(nextItems)
          .map((item) => getStoredLocation(item))
          .filter((value): value is string => Boolean(value))
      );

      const previousStorageUrl = previous ? getStoredLocation(previous) : null;
      if (previousStorageUrl && !nextStorageUrls.has(previousStorageUrl)) {
        try {
          await deleteStoredObject(previousStorageUrl);
        } catch {
          // Ignore stale object cleanup failures.
        }
      }

      for (const item of Object.values(previousItems)) {
        const previousItemStorageUrl = getStoredLocation(item);
        if (!previousItemStorageUrl || nextStorageUrls.has(previousItemStorageUrl)) {
          continue;
        }

        try {
          await deleteStoredObject(previousItemStorageUrl);
        } catch {
          // Ignore stale object cleanup failures.
        }
      }

      existing[body.domain] = {
        updatedAt: body.updatedAt,
        version: nextVersion,
        totalSize:
          body.totalSize ||
          Object.values(nextItems).reduce((sum, item) => sum + item.size, 0),
        createdAt,
        items: nextItems,
        deletedItems,
      };
    } else {
      if (!legacyStorageUrl) {
        res.status(400).json({
          error: "Missing required fields: domain, storageUrl, updatedAt",
        });
        return;
      }

      const objectInfo = await headStoredObject(legacyStorageUrl).catch(() => null);
      if (!objectInfo) {
        res.status(400).json({ error: "Invalid storage URL: object not found" });
        return;
      }

      const previousStorageUrl = previous ? getStoredLocation(previous) : null;
      if (previousStorageUrl && previousStorageUrl !== legacyStorageUrl) {
        try {
          await deleteStoredObject(previousStorageUrl);
        } catch {
          // Ignore stale object cleanup failures.
        }
      }

      for (const item of Object.values(previous?.items ?? {})) {
        const previousItemStorageUrl = getStoredLocation(item);
        if (!previousItemStorageUrl) {
          continue;
        }

        try {
          await deleteStoredObject(previousItemStorageUrl);
        } catch {
          // Ignore stale object cleanup failures.
        }
      }

      existing[body.domain] = {
        updatedAt: body.updatedAt,
        version: nextVersion,
        totalSize: body.totalSize || objectInfo.size,
        storageUrl: legacyStorageUrl,
        blobUrl: legacyStorageUrl,
        createdAt,
      };
    }

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
    const itemEntries = entry?.items ?? null;

    if (isIndividualBlobSyncDomain(domain) && itemEntries) {
      const items: Record<string, CloudSyncBlobItemDownloadMetadata> = {};
      let didPruneMissingItems = false;
      const deletedItems = normalizeDeletionMarkerMap(entry?.deletedItems);

      for (const [itemKey, itemValue] of Object.entries(itemEntries)) {
        const storageUrl = getStoredLocation(itemValue);
        if (!storageUrl) {
          didPruneMissingItems = true;
          continue;
        }

        const objectInfo = await headStoredObject(storageUrl).catch(() => null);
        if (!objectInfo) {
          didPruneMissingItems = true;
          continue;
        }

        items[itemKey] = {
          updatedAt: itemValue.updatedAt,
          signature: itemValue.signature,
          size: itemValue.size || objectInfo.size,
          ...(itemValue.revision ? { revision: itemValue.revision } : {}),
          storageUrl,
          downloadUrl: await createSignedDownloadUrl(storageUrl),
        };
      }

      if (didPruneMissingItems && entry) {
        const totalSize = Object.values(items).reduce((sum, item) => sum + item.size, 0);
        metadata[domain] = {
          ...entry,
          totalSize,
          items: Object.fromEntries(
            Object.entries(items).map(([itemKey, item]) => [
              itemKey,
              {
                updatedAt: item.updatedAt,
                signature: item.signature,
                size: item.size,
                ...(item.revision ? { revision: item.revision } : {}),
                storageUrl: item.storageUrl,
                blobUrl: item.storageUrl,
              },
            ])
          ),
        };
        await redis.set(metaKey(username), JSON.stringify(metadata));
      }

      res.status(200).json({
        ok: true,
        domain,
        mode: "individual",
        items,
        deletedItems,
        metadata: {
          updatedAt: entry?.updatedAt || new Date(0).toISOString(),
          version: entry?.version || AUTO_SYNC_SNAPSHOT_VERSION,
          totalSize:
            entry?.totalSize || Object.values(items).reduce((sum, item) => sum + item.size, 0),
          createdAt: entry?.createdAt || new Date(0).toISOString(),
        },
      });
      return;
    }

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
