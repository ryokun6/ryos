/**
 * GET /api/rooms/:roomId/users - Get active users in a room
 */

import { API_CONFIG } from "../../_lib/constants.js";
import { 
  validationError, 
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
  assertValidRoomId,
} from "../../_middleware/validation.js";
import {
  getActiveUsersInRoom,
} from "../../_services/index.js";

// =============================================================================
// Configuration
// =============================================================================

export const runtime = API_CONFIG.EDGE_RUNTIME;
export const maxDuration = API_CONFIG.DEFAULT_MAX_DURATION;

// =============================================================================
// Handler
// =============================================================================

export default async function handler(req: Request): Promise<Response> {
  const requestId = generateRequestId();
  const startTime = performance.now();
  
  // CORS handling
  const origin = getEffectiveOrigin(req);
  const preflightResponse = handleCorsPreflightIfNeeded(req, ["GET", "OPTIONS"]);
  if (preflightResponse) return preflightResponse;
  
  if (!isAllowedOrigin(origin)) {
    return jsonError(validationError("Unauthorized origin"));
  }

  if (req.method !== "GET") {
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

    logInfo(requestId, `Getting users for room ${roomId}`);

    const users = await getActiveUsersInRoom(roomId);

    logInfo(requestId, `Returning ${users.length} users for room ${roomId}`);
    logComplete(requestId, startTime, 200);

    const response = jsonSuccess({ users, count: users.length });
    return withCors(response, origin);

  } catch (error) {
    logError(requestId, "Get room users error", error);
    logComplete(requestId, startTime, 500);
    const response = jsonError(internalError());
    return withCors(response, origin);
  }
}
