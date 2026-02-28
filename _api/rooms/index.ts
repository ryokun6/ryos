/**
 * /api/rooms
 * 
 * GET  - List all rooms
 * POST - Create a new room
 * 
 * Node.js runtime with terminal logging
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initLogger } from "../_utils/_logging.js";
import { isAllowedOrigin, getEffectiveOrigin, setCorsHeaders } from "../_utils/_cors.js";
import { broadcastRoomCreated } from "./_helpers/_pusher.js";
import { executeRoomsIndexCore } from "../cores/rooms-index-core.js";

export const runtime = "nodejs";
export const maxDuration = 30;

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const { logger } = initLogger();
  const startTime = Date.now();
  const origin = getEffectiveOrigin(req);

  logger.request(req.method || "GET", req.url || "/api/rooms", "rooms");

  if (req.method === "OPTIONS") {
    setCorsHeaders(res, origin);
    res.setHeader("Content-Type", "application/json");
    logger.response(204, Date.now() - startTime);
    res.status(204).end();
    return;
  }

  setCorsHeaders(res, origin);
  res.setHeader("Content-Type", "application/json");

  if (!isAllowedOrigin(origin)) {
    logger.response(403, Date.now() - startTime);
    res.status(403).json({ error: "Unauthorized" });
    return;
  }

  const result = await executeRoomsIndexCore({
    originAllowed: true,
    method: req.method,
    queryUsername: req.query.username as string | undefined,
    body: req.body,
    authHeader: req.headers.authorization,
    usernameHeader: req.headers["x-username"] as string | undefined,
    onRoomCreated: (room) => broadcastRoomCreated(room),
  });

  if (result.status === 200) {
    const meta = (result.body as { _meta?: { total?: number; visible?: number; username?: string | null } })?._meta;
    logger.info("Listed rooms", {
      total: meta?.total,
      visible: meta?.visible,
      username: meta?.username,
    });
  } else if (result.status === 201) {
    const room = (result.body as { room?: { id?: string; type?: string; name?: string } })?.room;
    const username = (req.headers["x-username"] as string | undefined)?.toLowerCase();
    logger.info("Pusher room-created broadcast sent", {
      roomId: room?.id,
      type: room?.type,
    });
    logger.info("Room created", {
      roomId: room?.id,
      type: room?.type,
      name: room?.name,
      username,
    });
  } else if (result.status >= 500) {
    if (req.method === "GET") {
      logger.error("Error fetching rooms");
    } else if (req.method === "POST") {
      logger.error("Error creating room");
    }
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
