import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initLogger } from "../_utils/_logging.js";
import createRedis from "../_utils/redis.js";
import { getHeader } from "../_utils/request-helpers.js";
import {
  getRedisBackupAuthSecret,
  runRedisBackup,
} from "./_redis-backup.js";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Redis logical backup cron (see vercel.json `crons`): scans every key,
 * writes a gzipped JSONL snapshot, and uploads it via the configured storage
 * backend (S3 storage produces an s3:// storage URL).
 *
 * Auth matches the other cron routes: `Authorization: Bearer ${CRON_SECRET}`.
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const { logger } = initLogger();
  const startTime = Date.now();

  res.setHeader("Content-Type", "application/json");
  logger.request(req.method || "GET", req.url || "/api/cron/redis-backup");

  if (req.method === "OPTIONS") {
    logger.response(204, Date.now() - startTime);
    res.status(204).end();
    return;
  }

  if ((req.method || "GET").toUpperCase() !== "GET") {
    logger.response(405, Date.now() - startTime);
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const cronSecret = getRedisBackupAuthSecret();
  if (!cronSecret) {
    logger.warn("CRON_SECRET is not configured for Redis backup");
    logger.response(503, Date.now() - startTime);
    res.status(503).json({ error: "CRON_SECRET is not configured" });
    return;
  }

  if (getHeader(req, "authorization") !== `Bearer ${cronSecret}`) {
    logger.warn("Rejected Redis backup cron due to invalid secret");
    logger.response(401, Date.now() - startTime);
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const rawScanCount = Array.isArray(req.query?.scanCount)
    ? req.query.scanCount[0]
    : req.query?.scanCount;
  const parsedScanCount =
    typeof rawScanCount === "string" && rawScanCount.length > 0
      ? Number.parseInt(rawScanCount, 10)
      : undefined;
  const scanCount =
    parsedScanCount && Number.isFinite(parsedScanCount)
      ? Math.min(Math.max(parsedScanCount, 10), 1000)
      : undefined;

  try {
    const redis = createRedis();
    const stats = await runRedisBackup(redis, {
      ...(scanCount !== undefined ? { scanCount } : {}),
    });

    logger.info("Redis backup completed", { ...stats });
    logger.response(200, Date.now() - startTime);
    res.status(200).json({ success: true, ...stats });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Redis backup failed", { error: message });
    logger.response(500, Date.now() - startTime);
    res.status(500).json({ error: `Redis backup failed: ${message}` });
  }
}
