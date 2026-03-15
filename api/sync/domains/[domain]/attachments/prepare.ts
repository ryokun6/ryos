import {
  parseLogicalDomainQuery,
} from "../../../_domains.js";
import { apiHandler } from "../../../../_utils/api-handler.js";
import { getLogicalCloudSyncDomainPhysicalParts } from "../../../../../src/utils/syncLogicalDomains.js";
import {
  isBlobSyncDomain,
  isIndividualBlobSyncDomain,
  type BlobSyncDomain,
} from "../../../../../src/utils/cloudSyncShared.js";
import {
  createStorageUploadDescriptor,
  getStorageUploadDebugInfo,
  logStorageDebug,
} from "../../../../_utils/storage.js";

export const runtime = "nodejs";
export const maxDuration = 10;

const MAX_SYNC_SIZE = 50 * 1024 * 1024;
const RATE_LIMIT_WINDOW = 60;
const MANIFEST_RATE_LIMIT_MAX = 20;
const ITEM_RATE_LIMIT_MAX = 500;

interface PrepareLogicalAttachmentBody {
  partDomain?: BlobSyncDomain;
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

export default apiHandler<PrepareLogicalAttachmentBody>(
  {
    methods: ["POST"],
    auth: "required",
    parseJsonBody: true,
  },
  async ({ req, res, redis, user, body }): Promise<void> => {
    const rawLogicalDomain = Array.isArray(req.query.domain)
      ? req.query.domain[0]
      : req.query.domain;
    const logicalDomain = parseLogicalDomainQuery(rawLogicalDomain);

    if (!logicalDomain) {
      res.status(400).json({ error: "Invalid logical sync domain" });
      return;
    }

    const partDomain = body?.partDomain;
    const itemKey = body?.itemKey;

    if (!partDomain || !isBlobSyncDomain(partDomain)) {
      res.status(400).json({ error: "Invalid blob attachment partDomain" });
      return;
    }

    if (
      !getLogicalCloudSyncDomainPhysicalParts(logicalDomain).includes(partDomain)
    ) {
      res.status(400).json({
        error: `Attachment part ${partDomain} does not belong to ${logicalDomain}`,
      });
      return;
    }

    if (itemKey !== undefined) {
      if (!isIndividualBlobSyncDomain(partDomain)) {
        res.status(400).json({
          error: "This sync attachment part does not support item uploads.",
        });
        return;
      }

      if (!isValidItemKey(itemKey)) {
        res.status(400).json({ error: "Invalid sync item key" });
        return;
      }
    }

    const username = user?.username || "";
    const isItemUpload = itemKey !== undefined;
    const rateLimitKey = `rl:sync:logical:${isItemUpload ? "item" : "manifest"}:${username}:${logicalDomain}:${partDomain}`;
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
        pathname: syncPath(username, partDomain, itemKey),
        contentType: "application/gzip",
        allowedContentTypes: ["application/gzip", "application/octet-stream"],
        maximumSizeInBytes: MAX_SYNC_SIZE,
        allowOverwrite: true,
      });

      logStorageDebug("Generated logical sync attachment upload instructions", {
        route: "/api/sync/domains/[domain]/attachments/prepare",
        username,
        logicalDomain,
        partDomain,
        ...(itemKey ? { itemKey } : {}),
        origin: req.headers.origin,
        referer: req.headers.referer,
        host: req.headers.host,
        ...getStorageUploadDebugInfo(upload),
      });

      res.status(200).json(upload);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(
        "Error generating logical sync attachment upload instructions:",
        message,
        error
      );
      res.status(500).json({
        error: `Failed to generate sync upload token: ${message}`,
      });
    }
  }
);

