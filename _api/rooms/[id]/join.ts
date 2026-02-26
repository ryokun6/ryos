/**
 * POST /api/rooms/[id]/join
 * Join a room
 * Node.js runtime with terminal logging
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initLogger } from "../../_utils/_logging.js";
import { isAllowedOrigin, getEffectiveOrigin, setCorsHeaders } from "../../_utils/_cors.js";
import { broadcastRoomUpdated } from "../_helpers/_pusher.js";
import { executeRoomsJoinCore } from "../../cores/rooms-join-core.js";

export const runtime = "nodejs";
export const maxDuration = 15;

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const { logger } = initLogger();
  const startTime = Date.now();
  const origin = getEffectiveOrigin(req);
  const roomId = req.query.id as string | undefined;

  logger.request(req.method || "POST", req.url || "/api/rooms/[id]/join", `join:${roomId}`);

  if (req.method === "OPTIONS") {
    setCorsHeaders(res, origin, { methods: ["POST", "OPTIONS"], headers: ["Content-Type"] });
    res.setHeader("Content-Type", "application/json");
    logger.response(204, Date.now() - startTime);
    res.status(204).end();
    return;
  }

  setCorsHeaders(res, origin, { methods: ["POST", "OPTIONS"], headers: ["Content-Type"] });
  res.setHeader("Content-Type", "application/json");

  if (!isAllowedOrigin(origin)) {
    logger.response(403, Date.now() - startTime);
    res.status(403).json({ error: "Unauthorized" });
    return;
  }

  const result = await executeRoomsJoinCore({
    originAllowed: true,
    method: req.method,
    roomId,
    body: req.body,
    onRoomUpdated: (id) => broadcastRoomUpdated(id),
  });

  if (result.status === 200) {
    const meta = (result.body as { _meta?: { username?: string; userCount?: number } })?._meta;
    logger.info("User joined room", {
      roomId,
      username: meta?.username,
      userCount: meta?.userCount,
    });
  } else if (result.status >= 500) {
    logger.error(`Error joining room ${roomId}`);
  }

  const body =
    result.status === 200 && typeof result.body === "object" && result.body && "_meta" in (result.body as Record<string, unknown>)
      ? (() => {
          const { _meta: _ignored, ...rest } = result.body as Record<string, unknown>;
          return rest;
        })()
      : result.body;
  logger.response(result.status, Date.now() - startTime);
  res.status(result.status).json(body);
}
