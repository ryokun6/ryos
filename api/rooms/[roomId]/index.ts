/**
 * GET /api/rooms/:roomId - Get room details
 * DELETE /api/rooms/:roomId - Delete room
 */

import { API_CONFIG } from "../../_lib/constants.js";
import { 
  validationError, 
  notFound,
  forbidden,
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
  getAuthContext,
} from "../../_middleware/auth.js";
import {
  getRoom,
  deleteRoom as deleteRoomService,
  updateRoomMembers,
  refreshRoomUserCount,
  removeRoomPresence,
  deleteRoomPresence,
  broadcastRoomDeleted,
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
// Handler
// =============================================================================

export default async function handler(req: Request): Promise<Response> {
  const requestId = generateRequestId();
  const startTime = performance.now();
  
  // CORS handling
  const origin = getEffectiveOrigin(req);
  const preflightResponse = handleCorsPreflightIfNeeded(req, ["GET", "DELETE", "OPTIONS"]);
  if (preflightResponse) return preflightResponse;
  
  if (!isAllowedOrigin(origin)) {
    return jsonError(validationError("Unauthorized origin"));
  }

  // Extract roomId from URL
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  // Path is /api/rooms/:roomId
  const roomId = pathParts[2];

  if (!roomId) {
    const response = jsonError(validationError("Room ID is required"));
    return withCors(response, origin);
  }

  try {
    // GET - Get room details
    if (req.method === "GET") {
      logInfo(requestId, `Getting room: ${roomId}`);

      const room = await getRoom(roomId);
      if (!room) {
        const response = jsonError(notFound("Room"));
        return withCors(response, origin);
      }

      // Refresh user count
      const userCount = await refreshRoomUserCount(roomId);
      const roomWithCount = { ...room, userCount };

      logInfo(requestId, `Returning room: ${roomId}`);
      logComplete(requestId, startTime, 200);

      const response = jsonSuccess({ room: roomWithCount });
      return withCors(response, origin);
    }

    // DELETE - Delete room
    if (req.method === "DELETE") {
      // Authenticate
      const auth = await getAuthContext(req);
      if (!auth.valid || !auth.username) {
        const response = jsonError(validationError("Authentication required"));
        return withCors(response, origin);
      }

      logInfo(requestId, `Deleting room: ${roomId} by ${auth.username}`);

      const room = await getRoom(roomId);
      if (!room) {
        const response = jsonError(notFound("Room"));
        return withCors(response, origin);
      }

      // Check permissions
      if (room.type === "private") {
        // User must be a member of the private room
        if (!room.members || !room.members.includes(auth.username)) {
          const response = jsonError(forbidden("Not a member of this room"));
          return withCors(response, origin);
        }

        // For private rooms, leaving means removing yourself from members
        const updatedMembers = room.members.filter((m) => m !== auth.username);

        if (updatedMembers.length <= 1) {
          // Delete the room entirely if only 0-1 members would remain
          await deleteRoomService(roomId);
          logInfo(requestId, `Private room deleted (not enough members): ${roomId}`);

          // Notify remaining members
          const rooms = await getRoomsWithUsers();
          try {
            await broadcastToUsers(room.members, "rooms-updated", { rooms });
          } catch (e) {
            logError(requestId, "Failed to broadcast rooms-updated", e);
          }
        } else {
          // Update room with remaining members
          const updatedRoom = await updateRoomMembers(roomId, updatedMembers);
          await removeRoomPresence(roomId, auth.username);
          logInfo(requestId, `User ${auth.username} left private room ${roomId}`);

          if (updatedRoom) {
            try {
              await broadcastRoomUpdated(updatedRoom);
            } catch (e) {
              logError(requestId, "Failed to broadcast room-updated", e);
            }
          }
        }
      } else {
        // Public rooms require admin
        if (!auth.isAdmin) {
          const response = jsonError(forbidden("Admin access required for public rooms"));
          return withCors(response, origin);
        }

        // Delete public room
        await deleteRoomService(roomId);
        logInfo(requestId, `Public room deleted: ${roomId}`);

        // Broadcast deletion
        try {
          await broadcastRoomDeleted(roomId, room.type, room.members || []);
        } catch (e) {
          logError(requestId, "Failed to broadcast room-deleted", e);
        }
      }

      logComplete(requestId, startTime, 200);
      const response = jsonSuccess({ success: true });
      return withCors(response, origin);
    }

    // Method not allowed
    const response = jsonError(validationError("Method not allowed"));
    return withCors(response, origin);

  } catch (error) {
    logError(requestId, "Room error", error);
    logComplete(requestId, startTime, 500);
    const response = jsonError(internalError());
    return withCors(response, origin);
  }
}
