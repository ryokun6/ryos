/**
 * POST /api/rooms/:roomId/leave - Leave a room
 */

import { z } from "zod";
import { API_CONFIG } from "../../_lib/constants.js";
import { 
  validationError, 
  notFound,
  internalError,
} from "../../_lib/errors.js";
import { jsonSuccess, jsonError, withCors } from "../../_lib/response.js";
import { generateRequestId, logInfo, logError, logComplete } from "../../_lib/logging.js";
import {
  getEffectiveOrigin,
  isAllowedOrigin,
  handleCorsPreflightIfNeeded,
} from "../../_middleware/cors.js";
import {
  isProfaneUsername,
  assertValidUsername,
  assertValidRoomId,
} from "../../_middleware/validation.js";
import {
  getRoom,
  setRoom,
  deleteRoom,
  updateRoomMembers,
  removeRoomPresence,
  refreshRoomUserCount,
  broadcastRoomUpdated,
  getRoomsWithUsers,
  broadcastToUsers,
} from "../../_services/index.js";

// =============================================================================
// Configuration
// =============================================================================

export const runtime = API_CONFIG.DEFAULT_RUNTIME;
export const maxDuration = API_CONFIG.DEFAULT_MAX_DURATION;

// =============================================================================
// Schema
// =============================================================================

const LeaveRoomSchema = z.object({
  username: z.string().min(1),
});

// =============================================================================
// Handler
// =============================================================================

export default async function handler(req: Request): Promise<Response> {
  const requestId = generateRequestId();
  const startTime = performance.now();
  
  // CORS handling
  const origin = getEffectiveOrigin(req);
  const preflightResponse = handleCorsPreflightIfNeeded(req, ["POST", "OPTIONS"]);
  if (preflightResponse) return preflightResponse;
  
  if (!isAllowedOrigin(origin)) {
    return jsonError(validationError("Unauthorized origin"));
  }

  if (req.method !== "POST") {
    const response = jsonError(validationError("Method not allowed"));
    return withCors(response, origin);
  }

  // Extract roomId from URL
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  const roomId = pathParts[2];

  if (!roomId) {
    const response = jsonError(validationError("Room ID is required"));
    return withCors(response, origin);
  }

  try {
    // Validate room ID
    try {
      assertValidRoomId(roomId);
    } catch (e) {
      const response = jsonError(validationError(e instanceof Error ? e.message : "Invalid room ID"));
      return withCors(response, origin);
    }

    // Parse body
    let body: z.infer<typeof LeaveRoomSchema>;
    try {
      const rawBody = await req.json();
      const parsed = LeaveRoomSchema.safeParse(rawBody);
      if (!parsed.success) {
        const response = jsonError(validationError("Invalid request body", parsed.error.format()));
        return withCors(response, origin);
      }
      body = parsed.data;
    } catch {
      const response = jsonError(validationError("Invalid JSON body"));
      return withCors(response, origin);
    }

    const username = body.username.toLowerCase();

    // Validate username
    try {
      assertValidUsername(username);
    } catch (e) {
      const response = jsonError(validationError(e instanceof Error ? e.message : "Invalid username"));
      return withCors(response, origin);
    }

    // Block profane usernames
    if (isProfaneUsername(username)) {
      const response = jsonError(validationError("Username contains inappropriate language"));
      return withCors(response, origin);
    }

    logInfo(requestId, `User ${username} leaving room ${roomId}`);

    // Check if room exists
    const room = await getRoom(roomId);
    if (!room) {
      const response = jsonError(notFound("Room"));
      return withCors(response, origin);
    }

    // Remove presence
    const removed = await removeRoomPresence(roomId, username);

    if (removed) {
      if (room.type === "private") {
        // For private rooms, also update member list
        const updatedMembers = room.members?.filter((m) => m !== username) || [];

        if (updatedMembers.length <= 1) {
          // Delete room if not enough members
          await deleteRoom(roomId);
          logInfo(requestId, `Private room ${roomId} deleted (not enough members)`);

          // Notify affected users
          const rooms = await getRoomsWithUsers();
          try {
            await broadcastToUsers(room.members || [], "rooms-updated", { rooms });
          } catch (e) {
            logError(requestId, "Failed to broadcast rooms-updated", e);
          }
        } else {
          // Update member list
          const updatedRoom = await updateRoomMembers(roomId, updatedMembers);
          if (updatedRoom) {
            try {
              await broadcastRoomUpdated(updatedRoom);
            } catch (e) {
              logError(requestId, "Failed to broadcast room-updated", e);
            }
          }
        }
      } else {
        // For public rooms, just refresh count and broadcast
        const userCount = await refreshRoomUserCount(roomId);
        const updatedRoom = { ...room, userCount };

        try {
          await broadcastRoomUpdated(updatedRoom);
        } catch (e) {
          logError(requestId, "Failed to broadcast room-updated", e);
        }
      }

      logInfo(requestId, `User ${username} left room ${roomId}`);
    } else {
      logInfo(requestId, `User ${username} was not in room ${roomId}`);
    }

    logComplete(requestId, startTime, 200);
    const response = jsonSuccess({ success: true });
    return withCors(response, origin);

  } catch (error) {
    logError(requestId, "Leave room error", error);
    logComplete(requestId, startTime, 500);
    const response = jsonError(internalError());
    return withCors(response, origin);
  }
}
