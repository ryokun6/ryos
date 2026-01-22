/**
 * POST /api/rooms/[id]/join
 * 
 * Join a room
 */

import {
  createRedis,
  getEffectiveOrigin,
  isAllowedOrigin,
  preflightIfNeeded,
} from "../../_utils/middleware.js";
import { isProfaneUsername, assertValidRoomId, assertValidUsername } from "../../_utils/_validation.js";
import { getRoom, setRoom } from "../_helpers/_redis.js";
import { setRoomPresence, refreshRoomUserCount } from "../_helpers/_presence.js";
import type { Room } from "../_helpers/_types.js";

export const config = {
  runtime: "bun",
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
    assertValidUsername(username, "join-room");
    assertValidRoomId(roomId, "join-room");
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Validation error" }), { status: 400, headers });
  }

  if (isProfaneUsername(username)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
  }

  try {
    const [roomData, userData] = await Promise.all([
      getRoom(roomId),
      createRedis().get(`chat:users:${username}`),
    ]);

    if (!roomData) {
      return new Response(JSON.stringify({ error: "Room not found" }), { status: 404, headers });
    }

    if (!userData) {
      return new Response(JSON.stringify({ error: "User not found" }), { status: 404, headers });
    }

    await setRoomPresence(roomId, username);
    const userCount = await refreshRoomUserCount(roomId);
    const updatedRoom: Room = { ...roomData, userCount };
    await setRoom(roomId, updatedRoom);

    return new Response(JSON.stringify({ success: true }), { status: 200, headers });
  } catch (error) {
    console.error(`Error joining room ${roomId}:`, error);
    return new Response(JSON.stringify({ error: "Failed to join room" }), { status: 500, headers });
  }
}
