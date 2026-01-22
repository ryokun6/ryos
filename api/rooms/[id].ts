/**
 * /api/rooms/[id]
 * 
 * GET    - Get a single room
 * DELETE - Delete a room
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  createRedis,
  getEffectiveOrigin,
  isAllowedOrigin,
  preflightIfNeeded,
} from "../_utils/middleware.js";
import { validateAuth } from "../_utils/auth/index.js";
import { assertValidRoomId } from "../_utils/_validation.js";

// Import from existing chat-rooms modules
import {
  getRoom,
  setRoom,
} from "./_helpers/_redis.js";
import {
  CHAT_ROOM_PREFIX,
  CHAT_ROOM_USERS_PREFIX,
  CHAT_ROOMS_SET,
} from "./_helpers/_constants.js";
import {
  refreshRoomUserCount,
  deleteRoomPresence,
} from "./_helpers/_presence.js";
import type { Room } from "./_helpers/_types.js";

export const config = {
  runtime: "nodejs",
};

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const origin = getEffectiveOrigin(req);
  
  if (req.method === "OPTIONS") {
    const preflight = preflightIfNeeded(req, ["GET", "DELETE", "OPTIONS"], origin);
    if (preflight) {
      res.status(204).end();
      return;
    }
    res.status(204).end();
    return;
  }

  if (!isAllowedOrigin(origin)) {
    res.status(403).json({ error: "Unauthorized" });
    return;
  }

  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  const roomId = req.query.id as string;
  if (!roomId) {
    res.status(400).json({ error: "Room ID is required" });
    return;
  }

  try {
    assertValidRoomId(roomId, "room-operation");
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Invalid room ID" });
    return;
  }

  // GET - Get single room
  if (req.method === "GET") {
    try {
      const roomObj = await getRoom(roomId);
      if (!roomObj) {
        res.status(404).json({ error: "Room not found" });
        return;
      }

      const userCount = await refreshRoomUserCount(roomId);
      const room: Room = { ...roomObj, userCount };

      res.status(200).json({ room });
      return;
    } catch (error) {
      console.error(`Error fetching room ${roomId}:`, error);
      res.status(500).json({ error: "Failed to fetch room" });
      return;
    }
  }

  // DELETE - Delete room
  if (req.method === "DELETE") {
    const authHeader = req.headers["authorization"] as string;
    const usernameHeader = req.headers["x-username"] as string;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token || !usernameHeader) {
      res.status(401).json({ error: "Unauthorized - missing credentials" });
      return;
    }

    const authResult = await validateAuth(createRedis(), usernameHeader, token, {});
    if (!authResult.valid) {
      res.status(401).json({ error: "Unauthorized - invalid token" });
      return;
    }

    const username = usernameHeader.toLowerCase();

    try {
      const roomData = await getRoom(roomId);
      if (!roomData) {
        res.status(404).json({ error: "Room not found" });
        return;
      }

      // Permission check
      if (roomData.type === "private") {
        if (!roomData.members || !roomData.members.includes(username)) {
          res.status(403).json({ error: "Unauthorized - not a member" });
          return;
        }
      } else {
        if (username !== "ryo") {
          res.status(403).json({ error: "Unauthorized - admin required" });
          return;
        }
      }

      if (roomData.type === "private") {
        const updatedMembers = roomData.members!.filter((member) => member !== username);

        if (updatedMembers.length <= 1) {
          const pipeline = createRedis().pipeline();
          pipeline.del(`${CHAT_ROOM_PREFIX}${roomId}`);
          pipeline.del(`chat:messages:${roomId}`);
          pipeline.del(`${CHAT_ROOM_USERS_PREFIX}${roomId}`);
          pipeline.srem(CHAT_ROOMS_SET, roomId);
          await pipeline.exec();
          await deleteRoomPresence(roomId);
        } else {
          const updatedRoom: Room = { ...roomData, members: updatedMembers, userCount: updatedMembers.length };
          await setRoom(roomId, updatedRoom);
        }
      } else {
        const pipeline = createRedis().pipeline();
        pipeline.del(`${CHAT_ROOM_PREFIX}${roomId}`);
        pipeline.del(`chat:messages:${roomId}`);
        pipeline.del(`${CHAT_ROOM_USERS_PREFIX}${roomId}`);
        pipeline.srem(CHAT_ROOMS_SET, roomId);
        await pipeline.exec();
        await deleteRoomPresence(roomId);
      }

      res.status(200).json({ success: true });
      return;
    } catch (error) {
      console.error(`Error deleting room ${roomId}:`, error);
      res.status(500).json({ error: "Failed to delete room" });
      return;
    }
  }

  res.status(405).json({ error: "Method not allowed" });
}
