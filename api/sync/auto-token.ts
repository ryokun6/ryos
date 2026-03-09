/**
 * POST /api/sync/auto-token - Generate direct-upload instructions for a
 * domain-specific auto-sync upload.
 */

import {
  isBlobSyncDomain,
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
const RATE_LIMIT_MAX = 20;

interface AutoTokenBody {
  domain?: BlobSyncDomain;
}

function syncPath(username: string, domain: BlobSyncDomain) {
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

    if (!isBlobSyncDomain(domain as never)) {
      res.status(400).json({ error: "Invalid sync domain" });
      return;
    }

    const rateLimitKey = `rl:sync:auto:${username}:${domain}`;
    const current = await redis.incr(rateLimitKey);
    if (current === 1) {
      await redis.expire(rateLimitKey, RATE_LIMIT_WINDOW);
    }

    if (current > RATE_LIMIT_MAX) {
      res.status(429).json({
        error: "Too many sync requests. Please try again shortly.",
      });
      return;
    }

    try {
      const upload = await createStorageUploadDescriptor({
        pathname: syncPath(username, domain),
        contentType: "application/gzip",
        allowedContentTypes: ["application/gzip", "application/octet-stream"],
        maximumSizeInBytes: MAX_SYNC_SIZE,
        allowOverwrite: true,
      });

      logStorageDebug("Generated auto-sync upload instructions", {
        route: "/api/sync/auto-token",
        username,
        domain,
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
