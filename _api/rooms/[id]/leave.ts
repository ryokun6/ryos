/**
 * POST /api/rooms/[id]/leave
 * Leave a room
 * Node.js runtime with terminal logging
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initLogger } from "../../_utils/_logging.js";
import { isAllowedOrigin, getEffectiveOrigin, setCorsHeaders } from "../../_utils/_cors.js";
import { broadcastRoomDeleted, broadcastRoomUpdated } from "../_helpers/_pusher.js";
import { executeRoomsLeaveCore } from "../../cores/rooms-leave-core.js";

export const runtime = "nodejs";
export const maxDuration = 15;

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const { logger } = initLogger();
  const startTime = Date.now();
  const origin = getEffectiveOrigin(req);
  const roomId = req.query.id as string | undefined;

  logger.request(req.method || "POST", req.url || "/api/rooms/[id]/leave", `leave:${roomId}`);

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

  const result = await executeRoomsLeaveCore({
    originAllowed: true,
    method: req.method,
    roomId,
    body: req.body,
    onRoomDeleted: (id, type, members) => broadcastRoomDeleted(id, type, members),
    onRoomUpdated: (id) => broadcastRoomUpdated(id),
  });

  if (result.status === 200) {
    const meta = (result.body as {
      _meta?: { username?: string; scope?: string; remainingMembers?: number };
    })?._meta;
    if (meta?.scope === "private-last-member") {
      logger.info("Pusher room-deleted broadcast sent", {
        roomId,
        scope: "private-last-member",
      });
    } else if (meta?.scope === "private-member-left") {
      logger.info("Pusher private leave broadcasts sent", {
        roomId,
        remainingMembers: meta?.remainingMembers,
        leftUser: meta?.username,
      });
    }
    logger.info("User left room", { roomId, username: meta?.username });
  } else if (result.status >= 500) {
    logger.error(`Error leaving room ${roomId}`);
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
