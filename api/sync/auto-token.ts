/**
 * POST /api/sync/auto-token - Generate direct-upload instructions for a
 * domain-specific auto-sync upload.
 */

import {
  isBlobSyncDomain,
  isIndividualBlobSyncDomain,
  type BlobSyncDomain,
} from "../../src/utils/cloudSyncShared.js";
import { apiHandler } from "../_utils/api-handler.js";
import {
  createStorageUploadDescriptor,
  getStorageUploadDebugInfo,
  logStorageDebug,
} from "../_utils/storage.js";

export const runtime = "nodejs";
export const maxDuration = 10;

const MAX_SYNC_SIZE = 50 * 1024 * 1024;
const RATE_LIMIT_WINDOW = 60;
const MANIFEST_RATE_LIMIT_MAX = 20;
const ITEM_RATE_LIMIT_MAX = 500;

interface AutoTokenBody {
  domain?: BlobSyncDomain;
  itemKey?: string;
}

function isValidItemKey(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 512;
}

function syncPath(username: string, domain: BlobSyncDomain, itemKey?: string) {
  if (itemKey) {
    return `sync/${username}/${domain}/items/${encodeURIComponent(itemKey)}.gz`;
  }
  return `sync/${username}/${domain}.gz`;
}

export default apiHandler<AutoTokenBody>(
  {
    methods: ["POST"],
    auth: "required",
    parseJsonBody: true,
  },
  async ({ req, res, redis, user, body }): Promise<void> => {
    const username = user?.username || "";
    const domain = body?.domain;
    const itemKey = body?.itemKey;

    if (!isBlobSyncDomain(domain as never)) {
      res.status(400).json({ error: "Invalid sync domain" });
      return;
    }

    if (itemKey !== undefined) {
      if (!isIndividualBlobSyncDomain(domain)) {
        res.status(400).json({
          error: "This sync domain does not support individual item uploads.",
        });
        return;
      }

      if (!isValidItemKey(itemKey)) {
        res.status(400).json({ error: "Invalid sync item key" });
        return;
      }
    }

    const isItemUpload = itemKey !== undefined;
    const rateLimitKey = `rl:sync:auto:${isItemUpload ? "item" : "manifest"}:${username}:${domain}`;
    const rateLimitMax = isItemUpload
      ? ITEM_RATE_LIMIT_MAX
      : MANIFEST_RATE_LIMIT_MAX;
    const current = await redis.incr(rateLimitKey);
    if (current === 1) {
      await redis.expire(rateLimitKey, RATE_LIMIT_WINDOW);
    }

    if (current > rateLimitMax) {
      res.status(429).json({
        error: "Too many sync requests. Please try again shortly.",
      });
      return;
    }

    try {
      const upload = await createStorageUploadDescriptor({
        pathname: syncPath(username, domain, itemKey),
        contentType: "application/gzip",
        allowedContentTypes: ["application/gzip", "application/octet-stream"],
        maximumSizeInBytes: MAX_SYNC_SIZE,
        allowOverwrite: true,
      });

      logStorageDebug("Generated auto-sync upload instructions", {
        route: "/api/sync/auto-token",
        username,
        domain,
        ...(itemKey ? { itemKey } : {}),
        origin: req.headers.origin,
        referer: req.headers.referer,
        host: req.headers.host,
        ...getStorageUploadDebugInfo(upload),
      });

      res.status(200).json(upload);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("Error generating auto-sync upload instructions:", message, error);
      res.status(500).json({
        error: `Failed to generate auto-sync upload token: ${message}`,
      });
    }
  }
);
