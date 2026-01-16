/**
 * GET /api/users/me
 * Get current authenticated user info
 */

import { getRedis } from "../_lib/redis.js";
import { REDIS_KEYS, API_CONFIG } from "../_lib/constants.js";
import { 
  unauthorized,
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
import {
  getAuthContext,
} from "../_middleware/auth.js";
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
    // Authenticate request
    const auth = await getAuthContext(req);
    if (!auth.valid || !auth.username) {
      const response = jsonError(unauthorized());
      return withCors(response, origin);
    }

    logInfo(requestId, `Getting info for current user: ${auth.username}`);

    const redis = getRedis();
    const userKey = `${REDIS_KEYS.USER}${auth.username}`;
    const userData = await redis.get<User | string>(userKey);

    if (!userData) {
      logInfo(requestId, `User not found: ${auth.username}`);
      const response = jsonError(notFound("User"));
      return withCors(response, origin);
    }

    const user = typeof userData === "string" ? JSON.parse(userData) : userData;

    // Check if password is set
    const passwordKey = `${REDIS_KEYS.PASSWORD_HASH}${auth.username}`;
    const passwordHash = await redis.get<string>(passwordKey);
    const hasPassword = !!passwordHash;

    // Return full user info for the authenticated user
    const userInfo = {
      username: user.username,
      lastActive: user.lastActive,
      hasPassword,
      isAdmin: auth.isAdmin,
      tokenExpired: auth.expired ?? false,
    };

    logInfo(requestId, `Returning info for user: ${auth.username}`);
    logComplete(requestId, startTime, 200);

    const response = jsonSuccess({ user: userInfo });
    return withCors(response, origin);

  } catch (error) {
    logError(requestId, "Get current user error", error);
    logComplete(requestId, startTime, 500);
    const response = jsonError(internalError());
    return withCors(response, origin);
  }
}
