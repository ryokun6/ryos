/**
 * POST /api/sync/auto-token - Generate a client token for a domain-specific
 * auto-sync upload to Vercel Blob.
 */

import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import {
  isCloudSyncDomain,
  type CloudSyncDomain,
} from "../../src/utils/cloudSyncShared.js";
import { apiHandler } from "../_utils/api-handler.js";

export const runtime = "nodejs";
export const maxDuration = 10;

const MAX_SYNC_SIZE = 50 * 1024 * 1024;
const RATE_LIMIT_WINDOW = 60;
const RATE_LIMIT_MAX = 20;

interface AutoTokenBody {
  domain?: CloudSyncDomain;
}

function syncPath(username: string, domain: CloudSyncDomain) {
  return `sync/${username}/${domain}.gz`;
}

export default apiHandler<AutoTokenBody>(
  {
    methods: ["POST"],
    auth: "required",
    parseJsonBody: true,
  },
  async ({ res, redis, user, body }): Promise<void> => {
    const username = user?.username || "";
    const domain = body?.domain;

    if (!isCloudSyncDomain(domain)) {
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
      const clientToken = await generateClientTokenFromReadWriteToken({
        pathname: syncPath(username, domain),
        allowedContentTypes: ["application/gzip", "application/octet-stream"],
        maximumSizeInBytes: MAX_SYNC_SIZE,
        addRandomSuffix: false,
        allowOverwrite: true,
      });

      res.status(200).json({ clientToken });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("Error generating auto-sync token:", message, error);
      res.status(500).json({
        error: `Failed to generate auto-sync upload token: ${message}`,
      });
    }
  }
);
