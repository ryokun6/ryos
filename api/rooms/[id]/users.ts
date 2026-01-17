/**
 * GET /api/rooms/[id]/users
 * 
 * Get active users in a room
 */

import {
  getEffectiveOrigin,
  isAllowedOrigin,
  preflightIfNeeded,
} from "../../_utils/middleware.js";
import { assertValidRoomId } from "../../_utils/_validation.js";
import { getActiveUsersAndPrune } from "../../chat-rooms/_presence.js";

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
    const preflight = preflightIfNeeded(req, ["GET", "OPTIONS"], origin);
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

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  }

  const roomId = getRoomId(req);
  if (!roomId) {
    return new Response(JSON.stringify({ error: "Room ID is required" }), { status: 400, headers });
  }

  try {
    assertValidRoomId(roomId, "get-room-users");
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Invalid room ID" }), { status: 400, headers });
  }

  try {
    const users = await getActiveUsersAndPrune(roomId);
    return new Response(JSON.stringify({ users }), { status: 200, headers });
  } catch (error) {
    console.error(`Error getting users for room ${roomId}:`, error);
    return new Response(JSON.stringify({ error: "Failed to get room users" }), { status: 500, headers });
  }
}
