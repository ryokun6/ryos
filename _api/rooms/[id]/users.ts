/**
 * GET /api/rooms/[id]/users
 * 
 * Get active users in a room
 */

import {
  jsonResponse,
  errorResponse,
  handleCors,
} from "../../_utils/middleware.js";
import { assertValidRoomId } from "../../_utils/_validation.js";

// Import from existing chat-rooms modules
import { getActiveUsersAndPrune } from "../../chat-rooms/_presence.js";

export const runtime = "edge";
export const maxDuration = 15;

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

export async function GET(request: Request): Promise<Response> {
  const cors = handleCors(request, ["GET", "OPTIONS"]);
  if (cors.preflight) return cors.preflight;
  if (!cors.allowed) {
    return errorResponse("Unauthorized", 403);
  }

  const roomId = getRoomId(request);
  if (!roomId) {
    return errorResponse("Room ID is required", 400, cors.origin);
  }

  try {
    assertValidRoomId(roomId, "get-room-users");
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : "Invalid room ID", 400, cors.origin);
  }

  try {
    const users = await getActiveUsersAndPrune(roomId);
    return jsonResponse({ users }, 200, cors.origin);
  } catch (error) {
    console.error(`Error getting users for room ${roomId}:`, error);
    return errorResponse("Failed to get room users", 500, cors.origin);
  }
}

export async function OPTIONS(request: Request): Promise<Response> {
  const cors = handleCors(request, ["GET", "OPTIONS"]);
  return cors.preflight || new Response(null, { status: 204 });
}
