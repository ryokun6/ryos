/**
 * POST /api/rooms/[id]/leave
 * Leave a room
 * Node.js runtime with terminal logging
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Redis } from "@upstash/redis";
import { isProfaneUsername, assertValidRoomId, assertValidUsername } from "../../_utils/_validation.js";
import { initLogger } from "../../_utils/_logging.js";
import { isAllowedOrigin, getEffectiveOrigin, setCorsHeaders } from "../../_utils/_cors.js";
import { getRoom, setRoom } from "../_helpers/_redis.js";
import { CHAT_ROOM_PREFIX, CHAT_ROOM_USERS_PREFIX } from "../_helpers/_constants.js";
import { removeRoomPresence, refreshRoomUserCount } from "../_helpers/_presence.js";
import type { Room } from "../_helpers/_types.js";

export const runtime = "nodejs";
export const maxDuration = 15;

function createRedis(): Redis {
  return new Redis({
    url: process.env.REDIS_KV_REST_API_URL!,
    token: process.env.REDIS_KV_REST_API_TOKEN!,
  });
}

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

  if (req.method !== "POST") {
    logger.response(405, Date.now() - startTime);
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!roomId) {
    logger.response(400, Date.now() - startTime);
    res.status(400).json({ error: "Room ID is required" });
    return;
  }

  const body = req.body || {};
  const username = body?.username?.toLowerCase();

  if (!username) {
    logger.response(400, Date.now() - startTime);
    res.status(400).json({ error: "Username is required" });
    return;
  }

  try {
    assertValidUsername(username, "leave-room");
    assertValidRoomId(roomId, "leave-room");
  } catch (e) {
    logger.response(400, Date.now() - startTime);
    res.status(400).json({ error: e instanceof Error ? e.message : "Validation error" });
    return;
  }

  if (isProfaneUsername(username)) {
    logger.response(401, Date.now() - startTime);
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const roomData = await getRoom(roomId);
    if (!roomData) {
      logger.response(404, Date.now() - startTime);
      res.status(404).json({ error: "Room not found" });
      return;
    }

    const removed = await removeRoomPresence(roomId, username);

    if (removed) {
      const userCount = await refreshRoomUserCount(roomId);

      if (roomData.type === "private") {
        const updatedMembers = roomData.members ? roomData.members.filter((m) => m !== username) : [];

        if (updatedMembers.length <= 1) {
          const pipeline = createRedis().pipeline();
          pipeline.del(`${CHAT_ROOM_PREFIX}${roomId}`);
          pipeline.del(`chat:messages:${roomId}`);
          pipeline.del(`${CHAT_ROOM_USERS_PREFIX}${roomId}`);
          await pipeline.exec();
        } else {
          const updatedRoom: Room = { ...roomData, members: updatedMembers, userCount };
          await setRoom(roomId, updatedRoom);
        }
      }
    }

    logger.info("User left room", { roomId, username });
    logger.response(200, Date.now() - startTime);
    res.status(200).json({ success: true });
  } catch (error) {
    logger.error(`Error leaving room ${roomId}`, error);
    logger.response(500, Date.now() - startTime);
    res.status(500).json({ error: "Failed to leave room" });
  }
}
