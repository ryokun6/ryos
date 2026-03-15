/**
 * GET /api/sync/auto - Get auto-sync metadata for all domains
 * GET /api/sync/auto?domain=<domain> - Download one auto-sync domain blob
 * POST /api/sync/auto - Save auto-sync metadata for one domain
 */

import type { VercelRequest } from "@vercel/node";
import type { Redis } from "../_utils/redis.js";
import {
  AUTO_SYNC_SNAPSHOT_VERSION,
  BLOB_SYNC_DOMAINS,
  getSyncChannelName,
  isBlobSyncDomain,
  isIndividualBlobSyncDomain,
  type CloudSyncBlobItemDownloadMetadata,
  type CloudSyncBlobItemMetadata,
  type BlobSyncDomain,
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
  mergeDeletionMarkerMaps,
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
  syncVersion?: CloudSyncVersionState | null;
}

type PersistedAutoSyncItemMetadata = CloudSyncBlobItemMetadata;

type PersistedAutoSyncMetadataMap = Record<
  BlobSyncDomain,
  PersistedAutoSyncDomainMetadata | null
>;

export type BlobDomainDownloadPayload =
  | {
      ok: true;
      domain: BlobSyncDomain;
      mode: "individual";
      items: Record<string, CloudSyncBlobItemDownloadMetadata>;
      deletedItems: DeletionMarkerMap;
      metadata: {
        updatedAt: string;
        version: number;
        totalSize: number;
        createdAt: string;
        syncVersion: CloudSyncVersionState;
      };
    }
  | {
      ok: true;
      domain: BlobSyncDomain;
      downloadUrl: string;
      blobUrl: string;
      metadata: {
        updatedAt: string;
        version: number;
        totalSize: number;
        createdAt: string;
        syncVersion?: CloudSyncVersionState | null;
      };
    };

export type SaveBlobDomainResult =
  | {
      ok: true;
      domain: BlobSyncDomain;
      metadata: {
        updatedAt: string;
        version: number;
        totalSize: number;
        createdAt: string;
        syncVersion?: CloudSyncVersionState | null;
      } | null;
      duplicate?: boolean;
    }
  | {
      ok: false;
      status: 400 | 409 | 500;
      error: string;
      code?: string;
      conflictKeys?: string[];
      metadata?: {
        updatedAt: string;
        version: number;
        totalSize: number;
        createdAt: string;
        syncVersion?: CloudSyncVersionState | null;
      } | null;
    };

function createEmptyAutoSyncMetadataMap(): PersistedAutoSyncMetadataMap {
  return {
    "files-images": null,
    "files-trash": null,
    "files-applets": null,
    "custom-wallpapers": null,
  };
}

export interface SaveAutoSyncMetadataBody {
  domain?: BlobSyncDomain;
  storageUrl?: string;
  blobUrl?: string;
  updatedAt?: string;
  version?: number;
  totalSize?: number;
  items?: Record<string, PersistedAutoSyncItemMetadata>;
  deletedItems?: DeletionMarkerMap;
  syncVersion?: CloudSyncWriteVersion;
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
    storageUrl,
    blobUrl: storageUrl,
    syncVersion: normalizeCloudSyncVersionState(candidate.syncVersion),
  };
}

export async function readAutoSyncMetadata(
  redis: Redis,
  username: string
): Promise<PersistedAutoSyncMetadataMap> {
  const raw = await redis.get<string | PersistedAutoSyncMetadataMap>(metaKey(username));
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  const normalized = createEmptyAutoSyncMetadataMap();

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
      syncVersion:
        normalizeCloudSyncVersionState(candidate.syncVersion) ||
        createSyntheticLegacySyncVersion(),
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
        const payload = await getBlobDomainDownloadPayload(
          redis,
          username,
          domain
        );
        if (!payload) {
          res.status(404).json({ error: `No ${domain} sync data found` });
          return;
        }
        res.status(200).json(payload);
        return;
      }

      const metadata = await readAutoSyncMetadata(redis, username);
      res.status(200).json({ ok: true, metadata });
      return;
    }

    if (method === "POST") {
      const sourceSessionId =
        typeof req.headers["x-sync-session-id"] === "string"
          ? req.headers["x-sync-session-id"]
          : undefined;
      const result = await saveBlobDomainMetadata(
        redis,
        username,
        body,
        sourceSessionId
      );
      if (!result.ok) {
        res.status(result.status).json({
          error: result.error,
          ...(result.code ? { code: result.code } : {}),
          ...(result.conflictKeys ? { conflictKeys: result.conflictKeys } : {}),
          ...(result.metadata ? { metadata: result.metadata } : {}),
        });
        return;
      }
      res.status(200).json(result);
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  }
);

export async function saveBlobDomainMetadata(
  redis: Redis,
  username: string,
  body: SaveAutoSyncMetadataBody | null,
  sourceSessionId: string | undefined
): Promise<SaveBlobDomainResult> {
  if (!body || !isBlobSyncDomain(body.domain as never) || !body.updatedAt) {
    return {
      ok: false,
      status: 400,
      error: "Missing required fields: domain, updatedAt",
    };
  }

  if (body.items && !isIndividualBlobSyncDomain(body.domain)) {
    return {
      ok: false,
      status: 400,
      error: "This sync domain does not support individual item manifests.",
    };
  }

  if (body.deletedItems && !isIndividualBlobSyncDomain(body.domain)) {
    return {
      ok: false,
      status: 400,
      error: "This sync domain does not support individual deletion markers.",
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

  try {
    const existing = await readAutoSyncMetadata(redis, username);
    const previous = existing[body.domain];
    const previousSyncVersion =
      previous?.syncVersion || (previous ? createSyntheticLegacySyncVersion() : null);
    const writeAssessment = assessCloudSyncWrite(
      previousSyncVersion,
      writeSyncVersion
    );
    if (writeAssessment.duplicate) {
      return {
        ok: true,
        domain: body.domain,
        metadata: previous
          ? {
              updatedAt: previous.updatedAt,
              version: previous.version,
              totalSize: previous.totalSize,
              createdAt: previous.createdAt,
              syncVersion: previous.syncVersion,
            }
          : null,
        duplicate: true,
      };
    }

    const createdAt = previous?.createdAt || new Date().toISOString();
    const legacyStorageUrl = getStoredLocation(body);
    const nextSyncVersion = advanceCloudSyncVersion(
      previousSyncVersion,
      writeSyncVersion
    );

    if (body.items) {
      const previousItems = previous?.items ?? {};
      const deletedItems = mergeDeletionMarkerMaps(
        previous?.deletedItems,
        normalizeDeletionMarkerMap(body.deletedItems)
      );
      const nextItems: Record<string, PersistedAutoSyncItemMetadata> =
        writeAssessment.canFastForward ? {} : { ...previousItems };
      const conflictingKeys = new Set<string>();

      for (const [itemKey, itemValue] of Object.entries(body.items)) {
        const storageUrl = getStoredLocation(itemValue);
        if (
          !storageUrl ||
          typeof itemValue.updatedAt !== "string" ||
          typeof itemValue.signature !== "string" ||
          typeof itemValue.size !== "number" ||
          !Number.isFinite(itemValue.size)
        ) {
          return {
            ok: false,
            status: 400,
            error: `Invalid sync item metadata for "${itemKey}"`,
          };
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

        if (previousItem && writeAssessment.hasConflict) {
          conflictingKeys.add(itemKey);
          continue;
        }

        const objectInfo = await headStoredObject(storageUrl).catch(() => null);
        if (!objectInfo) {
          return {
            ok: false,
            status: 400,
            error: `Invalid storage URL for "${itemKey}": object not found`,
          };
        }

        nextItems[itemKey] = {
          updatedAt: itemValue.updatedAt,
          signature: itemValue.signature,
          size: itemValue.size || objectInfo.size,
          storageUrl,
          blobUrl: storageUrl,
          syncVersion: normalizeCloudSyncVersionState(itemValue.syncVersion),
        };
      }

      for (const itemKey of Object.keys(nextItems)) {
        delete deletedItems[itemKey];
      }

      if (writeAssessment.hasConflict) {
        for (const [itemKey] of Object.entries(previousItems)) {
          if (itemKey in body.items || deletedItems[itemKey]) {
            if (!(itemKey in body.items)) {
              conflictingKeys.add(itemKey);
            }
            continue;
          }
          nextItems[itemKey] = previousItems[itemKey];
        }
      }

      if (conflictingKeys.size > 0 && previous) {
        return {
          ok: false,
          status: 409,
          error: `Cloud sync conflict for ${body.domain}. Download remote changes before replacing ${Array.from(conflictingKeys).join(", ")}.`,
          code: "sync_conflict",
          conflictKeys: Array.from(conflictingKeys),
          metadata: {
            updatedAt: previous.updatedAt,
            version: previous.version,
            totalSize: previous.totalSize,
            createdAt: previous.createdAt,
            syncVersion: previous.syncVersion,
          },
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
        version: body.version || AUTO_SYNC_SNAPSHOT_VERSION,
        totalSize:
          body.totalSize ||
          Object.values(nextItems).reduce((sum, item) => sum + item.size, 0),
        createdAt,
        items: nextItems,
        deletedItems,
        syncVersion: nextSyncVersion,
      };
    } else {
      if (writeAssessment.hasConflict && previous) {
        return {
          ok: false,
          status: 409,
          error: `Cloud sync conflict for ${body.domain}. Download remote changes before replacing this blob.`,
          code: "sync_conflict",
          metadata: {
            updatedAt: previous.updatedAt,
            version: previous.version,
            totalSize: previous.totalSize,
            createdAt: previous.createdAt,
            syncVersion: previous.syncVersion,
          },
        };
      }

      if (!legacyStorageUrl) {
        return {
          ok: false,
          status: 400,
          error: "Missing required fields: domain, storageUrl, updatedAt",
        };
      }

      const objectInfo = await headStoredObject(legacyStorageUrl).catch(() => null);
      if (!objectInfo) {
        return {
          ok: false,
          status: 400,
          error: "Invalid storage URL: object not found",
        };
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
        version: body.version || AUTO_SYNC_SNAPSHOT_VERSION,
        totalSize: body.totalSize || objectInfo.size,
        storageUrl: legacyStorageUrl,
        blobUrl: legacyStorageUrl,
        createdAt,
        syncVersion: nextSyncVersion,
      };
    }

    await redis.set(metaKey(username), JSON.stringify(existing));

    try {
      const channel = getSyncChannelName(username);
      const payload = {
        domain: body.domain,
        updatedAt: existing[body.domain]!.updatedAt,
        syncVersion: existing[body.domain]!.syncVersion,
        ...(sourceSessionId && { sourceSessionId }),
      };
      await triggerRealtimeEvent(channel, "domain-updated", payload);
    } catch (realtimeErr) {
      console.warn("[sync/auto] Failed to broadcast domain-updated:", realtimeErr);
    }

    const saved = existing[body.domain]!;
    return {
      ok: true,
      domain: body.domain,
      metadata: {
        updatedAt: saved.updatedAt,
        version: saved.version,
        totalSize: saved.totalSize,
        createdAt: saved.createdAt,
        syncVersion: saved.syncVersion,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Error saving auto-sync metadata:", message, error);
    return {
      ok: false,
      status: 500,
      error: `Failed to save auto-sync metadata: ${message}`,
    };
  }
}

export async function getBlobDomainDownloadPayload(
  redis: Redis,
  username: string,
  domain: BlobSyncDomain
): Promise<BlobDomainDownloadPayload | null> {
  try {
    const metadata = await readAutoSyncMetadata(redis, username);
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
                storageUrl: item.storageUrl,
                blobUrl: item.storageUrl,
              },
            ])
          ),
        };
        await redis.set(metaKey(username), JSON.stringify(metadata));
      }

      return {
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
          syncVersion:
            entry?.syncVersion || createSyntheticLegacySyncVersion(),
        },
      };
    }

    const storageUrl = entry ? getStoredLocation(entry) : null;

    if (!storageUrl) {
      return null;
    }

    const objectInfo = await headStoredObject(storageUrl).catch(() => null);
    if (!objectInfo) {
      metadata[domain] = null;
      await redis.set(metaKey(username), JSON.stringify(metadata));
      return null;
    }

    const downloadUrl = await createSignedDownloadUrl(storageUrl);
    return {
      ok: true,
      domain,
      downloadUrl,
      blobUrl: downloadUrl,
      metadata: {
        updatedAt: entry.updatedAt,
        version: entry.version,
        totalSize: entry.totalSize || objectInfo.size,
        createdAt: entry.createdAt,
        syncVersion: entry.syncVersion,
      },
    };
  } catch (error) {
    console.error(`Error downloading ${domain} auto-sync data:`, error);
    throw error;
  }
}
