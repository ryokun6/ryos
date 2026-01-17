/**
 * POST /api/rooms/[id]/join
 * 
 * Join a room
 */

import { Redis } from "@upstash/redis";
import {
  jsonResponse,
  errorResponse,
  handleCors,
  parseJsonBody,
} from "../../_utils/middleware.js";
import {
  isProfaneUsername,
  assertValidRoomId,
  assertValidUsername,
} from "../../_utils/_validation.js";

// Import from existing chat-rooms modules
import { getRoom, setRoom } from "../../chat-rooms/_redis.js";
import { redis } from "../../chat-rooms/_redis.js";
import { setRoomPresence, refreshRoomUserCount } from "../../chat-rooms/_presence.js";
import { broadcastRoomUpdated } from "../../chat-rooms/_pusher.js";
import type { Room } from "../../chat-rooms/_types.js";

export const runtime = "edge";
export const maxDuration = 15;

interface JoinRequest {
  username: string;
}

/**
 * Extract room ID from URL path
 */
function getRoomId(request: Request): string | null {
  const url = new URL(request.url);
  const pathParts = url.pathname.split("/");
  const roomsIndex = pathParts.indexOf("rooms");
  if (roomsIndex !== -1 && pathParts[roomsIndex + 1]) {
    return pathParts[roomsIndex + 1];
  }
  return null;
}

export async function POST(request: Request): Promise<Response> {
  const cors = handleCors(request, ["POST", "OPTIONS"]);
  if (cors.preflight) return cors.preflight;
  if (!cors.allowed) {
    return errorResponse("Unauthorized", 403);
  }

  const roomId = getRoomId(request);
  if (!roomId) {
    return errorResponse("Room ID is required", 400, cors.origin);
  }

  // Parse body
  const { data: body, error: parseError } = await parseJsonBody<JoinRequest>(request);
  if (parseError || !body) {
    return errorResponse(parseError || "Invalid request body", 400, cors.origin);
  }

  const username = body.username?.toLowerCase();

  if (!username) {
    return errorResponse("Username is required", 400, cors.origin);
  }

  // Validate
  try {
    assertValidUsername(username, "join-room");
    assertValidRoomId(roomId, "join-room");
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : "Validation error", 400, cors.origin);
  }

  if (isProfaneUsername(username)) {
    return errorResponse("Unauthorized", 401, cors.origin);
  }

  try {
    const [roomData, userData] = await Promise.all([
      getRoom(roomId),
      redis.get(`chat:users:${username}`),
    ]);

    if (!roomData) {
      return errorResponse("Room not found", 404, cors.origin);
    }

    if (!userData) {
      return errorResponse("User not found", 404, cors.origin);
    }

    await setRoomPresence(roomId, username);
    const userCount = await refreshRoomUserCount(roomId);
    const updatedRoom: Room = { ...roomData, userCount };
    await setRoom(roomId, updatedRoom);

    // Broadcast update
    try {
      await broadcastRoomUpdated(roomId);
    } catch (pusherError) {
      console.error("Error triggering Pusher event:", pusherError);
    }

    return jsonResponse({ success: true }, 200, cors.origin);
  } catch (error) {
    console.error(`Error joining room ${roomId}:`, error);
    return errorResponse("Failed to join room", 500, cors.origin);
  }
}

export async function OPTIONS(request: Request): Promise<Response> {
  const cors = handleCors(request, ["POST", "OPTIONS"]);
  return cors.preflight || new Response(null, { status: 204 });
}
