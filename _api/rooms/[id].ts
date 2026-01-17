/**
 * /api/rooms/[id]
 * 
 * GET    - Get a single room
 * DELETE - Delete a room
 */

import { Redis } from "@upstash/redis";
import {
  jsonResponse,
  errorResponse,
  handleCors,
  requireAuth,
} from "../_utils/middleware.js";
import { validateAuth } from "../_utils/auth/index.js";
import { assertValidRoomId } from "../_utils/_validation.js";

// Import from existing chat-rooms modules
import {
  getRoom,
  setRoom,
} from "../chat-rooms/_redis.js";
import { redis } from "../chat-rooms/_redis.js";
import {
  CHAT_ROOM_PREFIX,
  CHAT_ROOM_USERS_PREFIX,
  CHAT_ROOMS_SET,
} from "../chat-rooms/_constants.js";
import {
  refreshRoomUserCount,
  deleteRoomPresence,
} from "../chat-rooms/_presence.js";
import { broadcastRoomDeleted } from "../chat-rooms/_pusher.js";
import type { Room } from "../chat-rooms/_types.js";

export const runtime = "edge";
export const maxDuration = 15;

/**
 * Extract room ID from URL path
 */
function getRoomId(request: Request): string | null {
  const url = new URL(request.url);
  const pathParts = url.pathname.split("/");
  // Path: /api/rooms/[id] -> ["", "api", "rooms", "[id]"]
  return pathParts[pathParts.length - 1] || null;
}

/**
 * GET /api/rooms/[id] - Get a single room
 */
export async function GET(request: Request): Promise<Response> {
  const cors = handleCors(request, ["GET", "DELETE", "OPTIONS"]);
  if (cors.preflight) return cors.preflight;
  if (!cors.allowed) {
    return errorResponse("Unauthorized", 403);
  }

  const roomId = getRoomId(request);
  if (!roomId) {
    return errorResponse("Room ID is required", 400, cors.origin);
  }

  try {
    assertValidRoomId(roomId, "get-room");
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : "Invalid room ID", 400, cors.origin);
  }

  try {
    const roomObj = await getRoom(roomId);

    if (!roomObj) {
      return errorResponse("Room not found", 404, cors.origin);
    }

    const userCount = await refreshRoomUserCount(roomId);
    const room: Room = { ...roomObj, userCount };

    return jsonResponse({ room }, 200, cors.origin);
  } catch (error) {
    console.error(`Error fetching room ${roomId}:`, error);
    return errorResponse("Failed to fetch room", 500, cors.origin);
  }
}

/**
 * DELETE /api/rooms/[id] - Delete a room
 */
export async function DELETE(request: Request): Promise<Response> {
  const cors = handleCors(request, ["GET", "DELETE", "OPTIONS"]);
  if (cors.preflight) return cors.preflight;
  if (!cors.allowed) {
    return errorResponse("Unauthorized", 403);
  }

  const redisClient = new Redis({
    url: process.env.REDIS_KV_REST_API_URL!,
    token: process.env.REDIS_KV_REST_API_TOKEN!,
  });

  // Require authentication
  const auth = await requireAuth(request, redisClient, cors.origin);
  if (auth.error) return auth.error;

  const roomId = getRoomId(request);
  if (!roomId) {
    return errorResponse("Room ID is required", 400, cors.origin);
  }

  try {
    assertValidRoomId(roomId, "delete-room");
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : "Invalid room ID", 400, cors.origin);
  }

  const username = auth.user!.username;

  try {
    const roomData = await getRoom(roomId);

    if (!roomData) {
      return errorResponse("Room not found", 404, cors.origin);
    }

    // Permission check based on room type
    if (roomData.type === "private") {
      // Private room: only members can leave/delete
      if (!roomData.members || !roomData.members.includes(username)) {
        return errorResponse("Unauthorized - not a member of this room", 403, cors.origin);
      }
    } else {
      // Public room: only admin can delete
      if (username !== "ryo") {
        return errorResponse("Unauthorized - admin access required for public rooms", 403, cors.origin);
      }
    }

    if (roomData.type === "private") {
      // For private rooms, remove user from members
      const updatedMembers = roomData.members!.filter(
        (member) => member !== username
      );

      if (updatedMembers.length <= 1) {
        // Delete the entire room if <=1 members would remain
        const pipeline = redis.pipeline();
        pipeline.del(`${CHAT_ROOM_PREFIX}${roomId}`);
        pipeline.del(`chat:messages:${roomId}`);
        pipeline.del(`${CHAT_ROOM_USERS_PREFIX}${roomId}`);
        pipeline.srem(CHAT_ROOMS_SET, roomId);
        await pipeline.exec();
        await deleteRoomPresence(roomId);
      } else {
        // Update room with remaining members
        const updatedRoom: Room = {
          ...roomData,
          members: updatedMembers,
          userCount: updatedMembers.length,
        };
        await setRoom(roomId, updatedRoom);
      }
    } else {
      // Delete public room entirely
      const pipeline = redis.pipeline();
      pipeline.del(`${CHAT_ROOM_PREFIX}${roomId}`);
      pipeline.del(`chat:messages:${roomId}`);
      pipeline.del(`${CHAT_ROOM_USERS_PREFIX}${roomId}`);
      pipeline.srem(CHAT_ROOMS_SET, roomId);
      await pipeline.exec();
      await deleteRoomPresence(roomId);
    }

    // Broadcast deletion
    try {
      await broadcastRoomDeleted(roomId, roomData.type, roomData.members || []);
    } catch (pusherError) {
      console.error("Error triggering Pusher event:", pusherError);
    }

    return jsonResponse({ success: true }, 200, cors.origin);
  } catch (error) {
    console.error(`Error deleting room ${roomId}:`, error);
    return errorResponse("Failed to delete room", 500, cors.origin);
  }
}

export async function OPTIONS(request: Request): Promise<Response> {
  const cors = handleCors(request, ["GET", "DELETE", "OPTIONS"]);
  return cors.preflight || new Response(null, { status: 204 });
}
