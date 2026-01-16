/**
 * GET /api/users/:username
 * Get user profile by username
 */

import { getRedis } from "../_lib/redis.js";
import { REDIS_KEYS, API_CONFIG } from "../_lib/constants.js";
import { 
  validationError, 
  notFound,
  internalError,
} from "../_lib/errors.js";
import { jsonSuccess, jsonError, withCors } from "../_lib/response.js";
import { generateRequestId, logInfo, logError, logComplete } from "../_lib/logging.js";
import {
  getEffectiveOrigin,
  isAllowedOrigin,
  handleCorsPreflightIfNeeded,
} from "../_middleware/cors.js";
import type { User } from "../_lib/types.js";

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

  try {
    // Extract username from URL path
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    // Path is /api/users/:username
    const username = pathParts[pathParts.length - 1]?.toLowerCase();

    if (!username) {
      const response = jsonError(validationError("Username is required"));
      return withCors(response, origin);
    }

    logInfo(requestId, `Getting profile for user: ${username}`);

    const redis = getRedis();
    const userKey = `${REDIS_KEYS.USER}${username}`;
    const userData = await redis.get<User | string>(userKey);

    if (!userData) {
      logInfo(requestId, `User not found: ${username}`);
      const response = jsonError(notFound("User"));
      return withCors(response, origin);
    }

    const user = typeof userData === "string" ? JSON.parse(userData) : userData;

    // Return only public user info
    const publicProfile = {
      username: user.username,
      lastActive: user.lastActive,
    };

    logInfo(requestId, `Returning profile for user: ${username}`);
    logComplete(requestId, startTime, 200);

    const response = jsonSuccess({ user: publicProfile });
    return withCors(response, origin);

  } catch (error) {
    logError(requestId, "Get user error", error);
    logComplete(requestId, startTime, 500);
    const response = jsonError(internalError());
    return withCors(response, origin);
  }
}
