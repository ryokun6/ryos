/**
 * POST /api/rooms/[id]/leave
 * 
 * Leave a room
 */

import { getEffectiveOrigin, isAllowedOrigin, preflightIfNeeded } from "../../_utils/_cors.js";
import { isProfaneUsername, assertValidRoomId, assertValidUsername } from "../../_utils/_validation.js";

import { Redis } from "@upstash/redis";
import { getRoom, setRoom } from "../../chat-rooms/_redis.js";

function getRedis(): Redis {
  return new Redis({
    url: process.env.REDIS_KV_REST_API_URL!,
    token: process.env.REDIS_KV_REST_API_TOKEN!,
  });
}
import { CHAT_ROOM_PREFIX, CHAT_ROOM_USERS_PREFIX } from "../../chat-rooms/_constants.js";
import { removeRoomPresence, refreshRoomUserCount } from "../../chat-rooms/_presence.js";
import type { Room } from "../../chat-rooms/_types.js";

export const edge = true;
export const config = {
  runtime: "edge",
};

function getRoomId(req: Request): string | null {
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/");
  const roomsIndex = pathParts.indexOf("rooms");
  if (roomsIndex !== -1 && pathParts[roomsIndex + 1]) {
    return pathParts[roomsIndex + 1];
  }
  return null;
}

export default async function handler(req: Request) {
  const origin = getEffectiveOrigin(req);
  
  if (req.method === "OPTIONS") {
    const preflight = preflightIfNeeded(req, ["POST", "OPTIONS"], origin);
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

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  }

  const roomId = getRoomId(req);
  if (!roomId) {
    return new Response(JSON.stringify({ error: "Room ID is required" }), { status: 400, headers });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers });
  }

  const username = body?.username?.toLowerCase();
  if (!username) {
    return new Response(JSON.stringify({ error: "Username is required" }), { status: 400, headers });
  }

  try {
    assertValidUsername(username, "leave-room");
    assertValidRoomId(roomId, "leave-room");
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Validation error" }), { status: 400, headers });
  }

  if (isProfaneUsername(username)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
  }

  try {
    const roomData = await getRoom(roomId);
    if (!roomData) {
      return new Response(JSON.stringify({ error: "Room not found" }), { status: 404, headers });
    }

    const removed = await removeRoomPresence(roomId, username);

    if (removed) {
      const userCount = await refreshRoomUserCount(roomId);

      if (roomData.type === "private") {
        const updatedMembers = roomData.members ? roomData.members.filter((m) => m !== username) : [];

        if (updatedMembers.length <= 1) {
          const pipeline = getRedis().pipeline();
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

    return new Response(JSON.stringify({ success: true }), { status: 200, headers });
  } catch (error) {
    console.error(`Error leaving room ${roomId}:`, error);
    return new Response(JSON.stringify({ error: "Failed to leave room" }), { status: 500, headers });
  }
}
