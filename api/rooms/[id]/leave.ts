/**
 * POST /api/rooms/[id]/leave
 * 
 * Leave a room
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  createRedis,
  getEffectiveOriginNode,
  isAllowedOrigin,
  setCorsHeadersNode,
  handlePreflightNode,
} from "../../_utils/middleware.js";
import { isProfaneUsername, assertValidRoomId, assertValidUsername } from "../../_utils/_validation.js";
import { getRoom, setRoom } from "../_helpers/_redis.js";
import { CHAT_ROOM_PREFIX, CHAT_ROOM_USERS_PREFIX } from "../_helpers/_constants.js";
import { removeRoomPresence, refreshRoomUserCount } from "../_helpers/_presence.js";
import type { Room } from "../_helpers/_types.js";

export const runtime = "nodejs";
export const maxDuration = 15;

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const origin = getEffectiveOriginNode(req);
  
  // Handle CORS preflight
  if (handlePreflightNode(req, res, ["POST", "OPTIONS"])) {
    return;
  }

  setCorsHeadersNode(res, origin, ["POST", "OPTIONS"]);

  if (!isAllowedOrigin(origin)) {
    res.status(403).json({ error: "Unauthorized" });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const roomId = req.query.id as string;
  if (!roomId) {
    res.status(400).json({ error: "Room ID is required" });
    return;
  }

  const body = req.body || {};
  const username = body.username?.toLowerCase();
  if (!username) {
    res.status(400).json({ error: "Username is required" });
    return;
  }

  try {
    assertValidUsername(username, "leave-room");
    assertValidRoomId(roomId, "leave-room");
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Validation error" });
    return;
  }

  if (isProfaneUsername(username)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const roomData = await getRoom(roomId);
    if (!roomData) {
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

    res.status(200).json({ success: true });
  } catch (error) {
    console.error(`Error leaving room ${roomId}:`, error);
    res.status(500).json({ error: "Failed to leave room" });
  }
}
