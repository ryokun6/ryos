/**
 * POST /api/rooms/:roomId/join - Join a room
 */

import { z } from "zod";
import { getRedis } from "../../_lib/redis.js";
import { REDIS_KEYS, API_CONFIG } from "../../_lib/constants.js";
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
  setRoomPresence,
  refreshRoomUserCount,
  broadcastRoomUpdated,
} from "../../_services/index.js";

// =============================================================================
// Configuration
// =============================================================================

export const runtime = API_CONFIG.DEFAULT_RUNTIME;
export const maxDuration = API_CONFIG.DEFAULT_MAX_DURATION;

// =============================================================================
// Schema
// =============================================================================

const JoinRoomSchema = z.object({
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
  // Path is /api/rooms/:roomId/join
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
    let body: z.infer<typeof JoinRoomSchema>;
    try {
      const rawBody = await req.json();
      const parsed = JoinRoomSchema.safeParse(rawBody);
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

    logInfo(requestId, `User ${username} joining room ${roomId}`);

    // Check if room exists
    const room = await getRoom(roomId);
    if (!room) {
      const response = jsonError(notFound("Room"));
      return withCors(response, origin);
    }

    // Check if user exists
    const redis = getRedis();
    const userData = await redis.get(`${REDIS_KEYS.USER}${username}`);
    if (!userData) {
      const response = jsonError(notFound("User"));
      return withCors(response, origin);
    }

    // Set presence
    await setRoomPresence(roomId, username);
    const userCount = await refreshRoomUserCount(roomId);

    // Update room
    const updatedRoom = { ...room, userCount };
    await setRoom(roomId, updatedRoom);

    logInfo(requestId, `User ${username} joined room ${roomId}, count: ${userCount}`);

    // Broadcast
    try {
      await broadcastRoomUpdated(updatedRoom);
    } catch (e) {
      logError(requestId, "Failed to broadcast room-updated", e);
    }

    logComplete(requestId, startTime, 200);
    const response = jsonSuccess({ success: true, userCount });
    return withCors(response, origin);

  } catch (error) {
    logError(requestId, "Join room error", error);
    logComplete(requestId, startTime, 500);
    const response = jsonError(internalError());
    return withCors(response, origin);
  }
}
