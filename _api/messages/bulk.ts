/**
 * GET /api/messages/bulk
 * 
 * Get messages for multiple rooms at once
 */

import {
  jsonResponse,
  errorResponse,
  handleCors,
  getQueryParam,
} from "../_utils/middleware.js";
import { ROOM_ID_REGEX } from "../_utils/_validation.js";

// Import from existing chat-rooms modules
import { roomExists, getMessages } from "../chat-rooms/_redis.js";
import type { Message } from "../chat-rooms/_types.js";

export const runtime = "edge";
export const maxDuration = 15;

export async function GET(request: Request): Promise<Response> {
  const cors = handleCors(request, ["GET", "OPTIONS"]);
  if (cors.preflight) return cors.preflight;
  if (!cors.allowed) {
    return errorResponse("Unauthorized", 403);
  }

  const roomIdsParam = getQueryParam(request, "roomIds");
  if (!roomIdsParam) {
    return errorResponse("roomIds query parameter is required", 400, cors.origin);
  }

  const roomIds = roomIdsParam
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

  if (roomIds.length === 0) {
    return errorResponse("At least one room ID is required", 400, cors.origin);
  }

  // Validate all room IDs
  for (const id of roomIds) {
    if (!ROOM_ID_REGEX.test(id)) {
      return errorResponse("Invalid room ID format", 400, cors.origin);
    }
  }

  try {
    // Verify all rooms exist first
    const roomExistenceChecks = await Promise.all(
      roomIds.map((roomId) => roomExists(roomId))
    );

    const validRoomIds = roomIds.filter((_, index) => roomExistenceChecks[index]);
    const invalidRoomIds = roomIds.filter((_, index) => !roomExistenceChecks[index]);

    // Fetch messages for all valid rooms in parallel
    const messagePromises = validRoomIds.map(async (roomId) => {
      const messages = await getMessages(roomId, 20);
      return { roomId, messages };
    });

    const results = await Promise.all(messagePromises);

    // Convert to object map
    const messagesMap: Record<string, Message[]> = {};
    results.forEach(({ roomId, messages }) => {
      messagesMap[roomId] = messages;
    });

    return jsonResponse(
      {
        messagesMap,
        validRoomIds,
        invalidRoomIds,
      },
      200,
      cors.origin
    );
  } catch (error) {
    console.error("Error fetching bulk messages:", error);
    return errorResponse("Failed to fetch bulk messages", 500, cors.origin);
  }
}

export async function OPTIONS(request: Request): Promise<Response> {
  const cors = handleCors(request, ["GET", "OPTIONS"]);
  return cors.preflight || new Response(null, { status: 204 });
}
