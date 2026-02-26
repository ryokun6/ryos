/**
 * POST /api/listen/sessions/[id]/sync
 * Sync playback state (DJ only)
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initLogger } from "../../../_utils/_logging.js";
import {
  isAllowedOrigin,
  getEffectiveOrigin,
  setCorsHeaders,
} from "../../../_utils/_cors.js";
import { runtime, maxDuration } from "../../_helpers/_constants.js";
import { broadcastDjChanged, broadcastSync } from "../../_helpers/_pusher.js";
import { executeListenSyncCore } from "../../../cores/listen-sync-core.js";

export { runtime, maxDuration };

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const { logger } = initLogger();
  const startTime = Date.now();
  const origin = getEffectiveOrigin(req);
  const sessionId = req.query.id as string | undefined;

  logger.request(req.method || "POST", req.url || "/api/listen/sessions/[id]/sync", `listen-sync:${sessionId}`);

  if (req.method === "OPTIONS") {
    setCorsHeaders(res, origin, { methods: ["POST", "OPTIONS"], headers: ["Content-Type"] });
    res.setHeader("Content-Type", "application/json");
    logger.response(204, Date.now() - startTime);
    res.status(204).end();
    return;
  }

  setCorsHeaders(res, origin, { methods: ["POST", "OPTIONS"], headers: ["Content-Type"] });
  res.setHeader("Content-Type", "application/json");

  const result = await executeListenSyncCore({
    originAllowed: isAllowedOrigin(origin),
    method: req.method,
    sessionId,
    body: req.body,
    onDjChanged: (id, payload) => broadcastDjChanged(id, payload),
    onSync: (id, payload) => broadcastSync(id, payload),
  });

  if (result.status === 200) {
    const body = req.body as { username?: string; state?: { positionMs?: number; isPlaying?: boolean } };
    logger.info("Listen session synced", {
      sessionId,
      username: body?.username?.toLowerCase(),
      positionMs: body?.state?.positionMs,
      isPlaying: body?.state?.isPlaying,
    });
  } else if (result.status >= 500) {
    logger.error("Failed to sync listen session");
  }
  logger.response(result.status, Date.now() - startTime);
  res.status(result.status).json(result.body);
}
