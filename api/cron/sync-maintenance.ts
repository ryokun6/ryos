import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initLogger } from "../_utils/_logging.js";
import createRedis from "../_utils/redis.js";
import { getHeader } from "../_utils/request-helpers.js";
import { runSyncMaintenance } from "../sync/v2/_maintenance.js";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Cloud Sync v2 maintenance cron (see vercel.json `crons`):
 * garbage-collects unreferenced content-addressed blobs (mark-and-sweep with
 * a grace period) and heals user records. Bounded per run; successive runs
 * walk the user base via a persisted scan cursor.
 *
 * Auth matches the telegram heartbeat cron: `Authorization: Bearer ${CRON_SECRET}`.
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const { logger } = initLogger();
  const startTime = Date.now();

  res.setHeader("Content-Type", "application/json");
  logger.request(req.method || "GET", req.url || "/api/cron/sync-maintenance");

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

  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    logger.warn("CRON_SECRET is not configured for sync maintenance");
    logger.response(503, Date.now() - startTime);
    res.status(503).json({ error: "CRON_SECRET is not configured" });
    return;
  }

  if (getHeader(req, "authorization") !== `Bearer ${cronSecret}`) {
    logger.warn("Rejected sync maintenance cron due to invalid secret");
    logger.response(401, Date.now() - startTime);
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Optional clamped overrides for manual/operational invocations.
  const parseClamped = (
    value: unknown,
    min: number,
    max: number
  ): number | undefined => {
    const raw = Array.isArray(value) ? value[0] : value;
    if (typeof raw !== "string" || raw.length === 0) return undefined;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return undefined;
    return Math.min(Math.max(parsed, min), max);
  };
  const maxUsers = parseClamped(req.query?.maxUsers, 1, 500);
  const maxStorageDeletes = parseClamped(req.query?.maxDeletes, 0, 1000);

  try {
    const redis = createRedis();
    const stats = await runSyncMaintenance(redis, {
      ...(maxUsers !== undefined ? { maxUsers } : {}),
      ...(maxStorageDeletes !== undefined ? { maxStorageDeletes } : {}),
    });

    logger.info("Sync maintenance completed", { ...stats });
    logger.response(200, Date.now() - startTime);
    res.status(200).json({ success: true, ...stats });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Sync maintenance failed", { error: message });
    logger.response(500, Date.now() - startTime);
    res.status(500).json({ error: `Sync maintenance failed: ${message}` });
  }
}
