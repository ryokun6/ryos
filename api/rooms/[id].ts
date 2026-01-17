/**
 * /api/rooms/[id]
 * 
 * GET    - Get a single room
 * DELETE - Delete a room
 */

import { Redis } from "@upstash/redis";
import { getEffectiveOrigin, isAllowedOrigin, preflightIfNeeded } from "../_utils/_cors.js";
import { validateAuthToken } from "../_utils/_auth-validate.js";
import { assertValidRoomId } from "../_utils/_validation.js";

// Import from existing chat-rooms modules
import {
  getRoom,
  setRoom,
} from "../chat-rooms/_redis.js";

function getRedis(): Redis {
  return new Redis({
    url: process.env.REDIS_KV_REST_API_URL!,
    token: process.env.REDIS_KV_REST_API_TOKEN!,
  });
}
import {
  CHAT_ROOM_PREFIX,
  CHAT_ROOM_USERS_PREFIX,
  CHAT_ROOMS_SET,
} from "../chat-rooms/_constants.js";
import {
  refreshRoomUserCount,
  deleteRoomPresence,
} from "../chat-rooms/_presence.js";
import type { Room } from "../chat-rooms/_types.js";

export const edge = true;
export const config = {
  runtime: "edge",
};

function getRoomId(req: Request): string | null {
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/");
  return pathParts[pathParts.length - 1] || null;
}

export default async function handler(req: Request) {
  const origin = getEffectiveOrigin(req);
  
  if (req.method === "OPTIONS") {
    const preflight = preflightIfNeeded(req, ["GET", "DELETE", "OPTIONS"], origin);
    if (preflight) return preflight;
    return new Response(null, { status: 204 });
  }

  if (!isAllowedOrigin(origin)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { 
      status: 403, headers: { "Content-Type": "application/json" },
    });
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (origin) headers["Access-Control-Allow-Origin"] = origin;

  const roomId = getRoomId(req);
  if (!roomId) {
    return new Response(JSON.stringify({ error: "Room ID is required" }), { status: 400, headers });
  }

  try {
    assertValidRoomId(roomId, "room-operation");
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Invalid room ID" }), { status: 400, headers });
  }

  // GET - Get single room
  if (req.method === "GET") {
    try {
      const roomObj = await getRoom(roomId);
      if (!roomObj) {
        return new Response(JSON.stringify({ error: "Room not found" }), { status: 404, headers });
      }

      const userCount = await refreshRoomUserCount(roomId);
      const room: Room = { ...roomObj, userCount };

      return new Response(JSON.stringify({ room }), { status: 200, headers });
    } catch (error) {
      console.error(`Error fetching room ${roomId}:`, error);
      return new Response(JSON.stringify({ error: "Failed to fetch room" }), { status: 500, headers });
    }
  }

  // DELETE - Delete room
  if (req.method === "DELETE") {
    const authHeader = req.headers.get("authorization");
    const usernameHeader = req.headers.get("x-username");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token || !usernameHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized - missing credentials" }), { status: 401, headers });
    }

    const authResult = await validateAuthToken(getRedis(), usernameHeader, token, {});
    if (!authResult.valid) {
      return new Response(JSON.stringify({ error: "Unauthorized - invalid token" }), { status: 401, headers });
    }

    const username = usernameHeader.toLowerCase();

    try {
      const roomData = await getRoom(roomId);
      if (!roomData) {
        return new Response(JSON.stringify({ error: "Room not found" }), { status: 404, headers });
      }

      // Permission check
      if (roomData.type === "private") {
        if (!roomData.members || !roomData.members.includes(username)) {
          return new Response(JSON.stringify({ error: "Unauthorized - not a member" }), { status: 403, headers });
        }
      } else {
        if (username !== "ryo") {
          return new Response(JSON.stringify({ error: "Unauthorized - admin required" }), { status: 403, headers });
        }
      }

      if (roomData.type === "private") {
        const updatedMembers = roomData.members!.filter((member) => member !== username);

        if (updatedMembers.length <= 1) {
          const pipeline = getRedis().pipeline();
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
        const pipeline = getRedis().pipeline();
        pipeline.del(`${CHAT_ROOM_PREFIX}${roomId}`);
        pipeline.del(`chat:messages:${roomId}`);
        pipeline.del(`${CHAT_ROOM_USERS_PREFIX}${roomId}`);
        pipeline.srem(CHAT_ROOMS_SET, roomId);
        await pipeline.exec();
        await deleteRoomPresence(roomId);
      }

      return new Response(JSON.stringify({ success: true }), { status: 200, headers });
    } catch (error) {
      console.error(`Error deleting room ${roomId}:`, error);
      return new Response(JSON.stringify({ error: "Failed to delete room" }), { status: 500, headers });
    }
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
}
