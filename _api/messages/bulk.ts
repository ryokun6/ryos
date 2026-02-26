/**
 * GET /api/messages/bulk
 * Get messages for multiple rooms at once
 * Node.js runtime with terminal logging
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isAllowedOrigin, getEffectiveOrigin, setCorsHeaders } from "../_utils/_cors.js";
import { initLogger } from "../_utils/_logging.js";
import { executeMessagesBulkCore } from "../cores/messages-bulk-core.js";

export const runtime = "nodejs";
export const maxDuration = 15;

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const { logger } = initLogger();
  const startTime = Date.now();
  const origin = getEffectiveOrigin(req);

  logger.request(req.method || "GET", req.url || "/api/messages/bulk", "bulk-messages");

  if (req.method === "OPTIONS") {
    res.setHeader("Content-Type", "application/json");
    setCorsHeaders(res, origin, { methods: ["GET", "OPTIONS"], headers: ["Content-Type"] });
    logger.response(204, Date.now() - startTime);
    res.status(204).end();
    return;
  }

  res.setHeader("Content-Type", "application/json");
  setCorsHeaders(res, origin, { methods: ["GET", "OPTIONS"], headers: ["Content-Type"] });

  const originAllowed = isAllowedOrigin(origin);

  if (req.method !== "GET") {
    logger.response(405, Date.now() - startTime);
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const roomIdsParam = req.query.roomIds as string | undefined;
  const result = await executeMessagesBulkCore({
    originAllowed,
    roomIdsParam,
  });

  if (result.status === 200) {
    const payload = result.body as { validRoomIds?: string[]; invalidRoomIds?: string[] };
    logger.info("Bulk messages fetched", {
      validRooms: payload.validRoomIds?.length || 0,
      invalidRooms: payload.invalidRoomIds?.length || 0,
    });
  } else {
    logger.warn("Bulk messages request failed", {
      status: result.status,
      roomIdsParam,
    });
  }
  logger.response(result.status, Date.now() - startTime);
  res.status(result.status).json(result.body);
}
