/**
 * GET /api/rooms/[id]/users
 * 
 * Get active users in a room
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initLogger } from "../../_utils/_logging.js";
import { isAllowedOrigin, getEffectiveOrigin, setCorsHeaders } from "../../_utils/_cors.js";
import { executeRoomsUsersCore } from "../../cores/rooms-users-core.js";

export const runtime = "nodejs";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { requestId: _requestId, logger } = initLogger();
  const startTime = Date.now();
  
  const origin = getEffectiveOrigin(req);
  setCorsHeaders(res, origin, { methods: ["GET", "OPTIONS"] });
  
  logger.request(req.method || "GET", req.url || "/api/rooms/[id]/users");
  
  if (req.method === "OPTIONS") {
    logger.response(204, Date.now() - startTime);
    return res.status(204).end();
  }

  if (!isAllowedOrigin(origin)) {
    logger.warn("Unauthorized origin", { origin });
    logger.response(403, Date.now() - startTime);
    return res.status(403).json({ error: "Unauthorized" });
  }

  const roomId = req.query.id as string | undefined;
  const result = await executeRoomsUsersCore({
    originAllowed: true,
    method: req.method,
    roomId,
  });

  if (result.status === 200) {
    const meta = (result.body as { _meta?: { count?: number } })?._meta;
    logger.info("Users retrieved", { roomId, count: meta?.count });
  } else if (result.status === 400 && !roomId) {
    logger.warn("Missing room ID");
  } else if (result.status === 400) {
    logger.warn("Invalid room ID", { roomId });
  } else if (result.status === 405) {
    logger.warn("Method not allowed", { method: req.method });
  } else if (result.status >= 500) {
    logger.error(`Error getting users for room ${roomId}`);
  }

  const body =
    result.status === 200 && typeof result.body === "object" && result.body && "_meta" in (result.body as Record<string, unknown>)
      ? (() => {
          const { _meta: _ignored, ...rest } = result.body as Record<string, unknown>;
          return rest;
        })()
      : result.body;

  logger.response(result.status, Date.now() - startTime);
  return res.status(result.status).json(body);
}
