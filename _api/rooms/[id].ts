/**
 * /api/rooms/[id]
 * 
 * GET    - Get a single room
 * DELETE - Delete a room
 * 
 * Node.js runtime with terminal logging
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initLogger } from "../_utils/_logging.js";
import { isAllowedOrigin, getEffectiveOrigin, setCorsHeaders } from "../_utils/_cors.js";
import { broadcastRoomDeleted, broadcastRoomUpdated } from "./_helpers/_pusher.js";
import { executeRoomsRoomCore } from "../cores/rooms-room-core.js";

export const runtime = "nodejs";
export const maxDuration = 30;

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const { logger } = initLogger();
  const startTime = Date.now();
  const origin = getEffectiveOrigin(req);
  const roomId = req.query.id as string | undefined;

  logger.request(req.method || "GET", req.url || "/api/rooms/[id]", `room:${roomId}`);

  if (req.method === "OPTIONS") {
    setCorsHeaders(res, origin, { methods: ["GET", "DELETE", "OPTIONS"] });
    res.setHeader("Content-Type", "application/json");
    logger.response(204, Date.now() - startTime);
    res.status(204).end();
    return;
  }

  setCorsHeaders(res, origin, { methods: ["GET", "DELETE", "OPTIONS"] });
  res.setHeader("Content-Type", "application/json");

  if (!isAllowedOrigin(origin)) {
    logger.response(403, Date.now() - startTime);
    res.status(403).json({ error: "Unauthorized" });
    return;
  }

  const result = await executeRoomsRoomCore({
    originAllowed: true,
    method: req.method,
    roomId,
    authHeader: req.headers.authorization,
    usernameHeader: req.headers["x-username"] as string | undefined,
    onRoomDeleted: (id, type, members) => broadcastRoomDeleted(id, type, members),
    onRoomUpdated: (id) => broadcastRoomUpdated(id),
  });

  if (result.status === 200 && req.method === "GET") {
    const meta = (result.body as { _meta?: { userCount?: number } })?._meta;
    logger.info("Room fetched", { roomId, userCount: meta?.userCount });
  } else if (result.status === 200 && req.method === "DELETE") {
    const meta = (result.body as {
      _meta?: { scope?: string; remainingMembers?: number; username?: string };
    })?._meta;
    if (meta?.scope === "private-last-member" || meta?.scope === "public") {
      logger.info("Pusher room-deleted broadcast sent", {
        roomId,
        scope: meta?.scope,
      });
    } else if (meta?.scope === "private-member-left") {
      logger.info("Pusher private leave broadcasts sent", {
        roomId,
        remainingMembers: meta?.remainingMembers,
        leftUser: meta?.username,
      });
    }
    logger.info("Room deleted", { roomId, username: meta?.username });
  } else if (result.status >= 500) {
    if (req.method === "GET") {
      logger.error(`Error fetching room ${roomId}`);
    } else if (req.method === "DELETE") {
      logger.error(`Error deleting room ${roomId}`);
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
