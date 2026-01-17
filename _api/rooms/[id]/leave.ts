/**
 * POST /api/rooms/[id]/leave
 * 
 * Leave a room
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
import {
  CHAT_ROOM_PREFIX,
  CHAT_ROOM_USERS_PREFIX,
} from "../../chat-rooms/_constants.js";
import {
  removeRoomPresence,
  refreshRoomUserCount,
  getDetailedRooms,
} from "../../chat-rooms/_presence.js";
import { broadcastRoomUpdated, broadcastToSpecificUsers } from "../../chat-rooms/_pusher.js";
import type { Room } from "../../chat-rooms/_types.js";

export const runtime = "edge";
export const maxDuration = 15;

interface LeaveRequest {
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
  const { data: body, error: parseError } = await parseJsonBody<LeaveRequest>(request);
  if (parseError || !body) {
    return errorResponse(parseError || "Invalid request body", 400, cors.origin);
  }

  const username = body.username?.toLowerCase();

  if (!username) {
    return errorResponse("Username is required", 400, cors.origin);
  }

  // Validate
  try {
    assertValidUsername(username, "leave-room");
    assertValidRoomId(roomId, "leave-room");
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : "Validation error", 400, cors.origin);
  }

  if (isProfaneUsername(username)) {
    return errorResponse("Unauthorized", 401, cors.origin);
  }

  try {
    const roomData = await getRoom(roomId);
    if (!roomData) {
      return errorResponse("Room not found", 404, cors.origin);
    }

    const removed = await removeRoomPresence(roomId, username);

    if (removed) {
      const previousUserCount = roomData.userCount;
      const userCount = await refreshRoomUserCount(roomId);

      if (roomData.type === "private") {
        const updatedMembers = roomData.members
          ? roomData.members.filter((m) => m !== username)
          : [];

        if (updatedMembers.length <= 1) {
          // Delete private room
          const pipeline = redis.pipeline();
          pipeline.del(`${CHAT_ROOM_PREFIX}${roomId}`);
          pipeline.del(`chat:messages:${roomId}`);
          pipeline.del(`${CHAT_ROOM_USERS_PREFIX}${roomId}`);
          await pipeline.exec();

          const rooms = await getDetailedRooms();
          try {
            await broadcastToSpecificUsers(roomData.members || [], rooms);
          } catch (pusherError) {
            console.error("Error triggering Pusher event:", pusherError);
          }
        } else {
          // Update room
          const updatedRoom: Room = {
            ...roomData,
            members: updatedMembers,
            userCount,
          };
          await setRoom(roomId, updatedRoom);

          try {
            await broadcastRoomUpdated(roomId);
          } catch (pusherError) {
            console.error("Error triggering Pusher event:", pusherError);
          }
        }
      } else {
        // Public room
        if (userCount !== previousUserCount) {
          try {
            await broadcastRoomUpdated(roomId);
          } catch (pusherError) {
            console.error("Error triggering Pusher event:", pusherError);
          }
        }
      }
    }

    return jsonResponse({ success: true }, 200, cors.origin);
  } catch (error) {
    console.error(`Error leaving room ${roomId}:`, error);
    return errorResponse("Failed to leave room", 500, cors.origin);
  }
}

export async function OPTIONS(request: Request): Promise<Response> {
  const cors = handleCors(request, ["POST", "OPTIONS"]);
  return cors.preflight || new Response(null, { status: 204 });
}
