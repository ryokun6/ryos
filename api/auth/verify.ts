/**
 * POST /api/auth/verify
 * Verify authentication token validity
 */

import { API_CONFIG } from "../_lib/constants.js";
import { 
  invalidToken,
  validationError, 
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
  extractAuth,
  validateAuthToken,
} from "../_middleware/auth.js";
import {
  isProfaneUsername,
} from "../_middleware/validation.js";

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
  const preflightResponse = handleCorsPreflightIfNeeded(req, ["POST", "OPTIONS"]);
  if (preflightResponse) return preflightResponse;
  
  if (!isAllowedOrigin(origin)) {
    return jsonError(validationError("Unauthorized origin"));
  }

  if (req.method !== "POST") {
    const response = jsonError(validationError("Method not allowed"));
    return withCors(response, origin);
  }

  try {
    // Extract auth from headers
    const { username, token } = extractAuth(req);

    if (!username) {
      logInfo(requestId, "Token verification failed: Missing X-Username header");
      const response = jsonError(validationError("X-Username header is required"));
      return withCors(response, origin);
    }

    if (!token) {
      logInfo(requestId, "Token verification failed: Missing Authorization header");
      const response = jsonError(validationError("Authorization header is required"));
      return withCors(response, origin);
    }

    // Block profane usernames
    if (isProfaneUsername(username)) {
      logInfo(requestId, `Token verification blocked for profane username: ${username}`);
      const response = jsonError(invalidToken());
      return withCors(response, origin);
    }

    logInfo(requestId, `Verifying token for user: ${username}`);

    // Validate token (allow expired within grace period)
    const validationResult = await validateAuthToken(username, token, {
      allowExpired: true,
    });

    if (!validationResult.valid) {
      logInfo(requestId, `Token verification failed for user: ${username}`);
      const response = jsonError(invalidToken());
      return withCors(response, origin);
    }

    logInfo(requestId, `Token verified for user: ${username} (expired: ${validationResult.expired ?? false})`);
    logComplete(requestId, startTime, 200);

    const response = jsonSuccess({
      valid: true,
      username: username.toLowerCase(),
      expired: validationResult.expired ?? false,
      message: validationResult.expired 
        ? "Token is within grace period - consider refreshing" 
        : "Token is valid",
    });
    return withCors(response, origin);

  } catch (error) {
    logError(requestId, "Token verification error", error);
    logComplete(requestId, startTime, 500);
    const response = jsonError(internalError());
    return withCors(response, origin);
  }
}
