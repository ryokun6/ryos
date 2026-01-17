/**
 * /api/rooms/[id]/messages/[msgId]
 * 
 * DELETE - Delete a specific message (admin only)
 */

import { Redis } from "@upstash/redis";
import {
  jsonResponse,
  errorResponse,
  handleCors,
  requireAdmin,
} from "../../../_utils/middleware.js";
import { assertValidRoomId } from "../../../_utils/_validation.js";

// Import from existing chat-rooms modules
import {
  roomExists,
  deleteMessage as deleteMessageFromRedis,
} from "../../../chat-rooms/_redis.js";
import { broadcastMessageDeleted } from "../../../chat-rooms/_pusher.js";

export const runtime = "edge";
export const maxDuration = 15;

/**
 * Extract room ID and message ID from URL path
 */
function getIds(request: Request): { roomId: string | null; messageId: string | null } {
  const url = new URL(request.url);
  const pathParts = url.pathname.split("/");
  // Path: /api/rooms/[id]/messages/[msgId]
  const roomsIndex = pathParts.indexOf("rooms");
  const messagesIndex = pathParts.indexOf("messages");
  
  return {
    roomId: roomsIndex !== -1 ? pathParts[roomsIndex + 1] || null : null,
    messageId: messagesIndex !== -1 ? pathParts[messagesIndex + 1] || null : null,
  };
}

/**
 * DELETE /api/rooms/[id]/messages/[msgId] - Delete a message (admin only)
 */
export async function DELETE(request: Request): Promise<Response> {
  const cors = handleCors(request, ["DELETE", "OPTIONS"]);
  if (cors.preflight) return cors.preflight;
  if (!cors.allowed) {
    return errorResponse("Unauthorized", 403);
  }

  const redis = new Redis({
    url: process.env.REDIS_KV_REST_API_URL!,
    token: process.env.REDIS_KV_REST_API_TOKEN!,
  });

  // Require admin
  const auth = await requireAdmin(request, redis, cors.origin);
  if (auth.error) return auth.error;

  const { roomId, messageId } = getIds(request);

  if (!roomId || !messageId) {
    return errorResponse("Room ID and message ID are required", 400, cors.origin);
  }

  try {
    assertValidRoomId(roomId, "delete-message");
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : "Invalid room ID", 400, cors.origin);
  }

  try {
    const exists = await roomExists(roomId);
    if (!exists) {
      return errorResponse("Room not found", 404, cors.origin);
    }

    const deleted = await deleteMessageFromRedis(roomId, messageId);
    if (!deleted) {
      return errorResponse("Message not found", 404, cors.origin);
    }

    // Broadcast deletion
    try {
      await broadcastMessageDeleted(roomId, messageId);
    } catch (pusherError) {
      console.error("Error triggering Pusher event:", pusherError);
    }

    return jsonResponse({ success: true }, 200, cors.origin);
  } catch (error) {
    console.error(`Error deleting message ${messageId} from room ${roomId}:`, error);
    return errorResponse("Failed to delete message", 500, cors.origin);
  }
}

export async function OPTIONS(request: Request): Promise<Response> {
  const cors = handleCors(request, ["DELETE", "OPTIONS"]);
  return cors.preflight || new Response(null, { status: 204 });
}
