/**
 * POST /api/auth/refresh
 * Refresh authentication token
 */

import { z } from "zod";
import { getRedis } from "../_lib/redis.js";
import { REDIS_KEYS, TTL, API_CONFIG } from "../_lib/constants.js";
import { 
  invalidToken,
  validationError, 
  internalError,
  notFound,
} from "../_lib/errors.js";
import { jsonSuccess, jsonError, withCors } from "../_lib/response.js";
import { generateRequestId, logInfo, logError, logComplete } from "../_lib/logging.js";
import {
  getEffectiveOrigin,
  isAllowedOrigin,
  handleCorsPreflightIfNeeded,
} from "../_middleware/cors.js";
import {
  validateAuthToken,
  generateToken,
  storeToken,
  deleteToken,
  storeLastValidToken,
} from "../_middleware/auth.js";
import {
  checkAuthRateLimit,
  getClientIp,
} from "../_middleware/rate-limit.js";

// =============================================================================
// Configuration
// =============================================================================

export const runtime = API_CONFIG.EDGE_RUNTIME;
export const maxDuration = API_CONFIG.DEFAULT_MAX_DURATION;

// =============================================================================
// Schema
// =============================================================================

const RefreshSchema = z.object({
  username: z.string().min(1),
  token: z.string().min(1), // The old token to refresh
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

  try {
    // Parse body
    let body: z.infer<typeof RefreshSchema>;
    try {
      const rawBody = await req.json();
      const parsed = RefreshSchema.safeParse(rawBody);
      if (!parsed.success) {
        const response = jsonError(validationError("Invalid request body", parsed.error.format()));
        return withCors(response, origin);
      }
      body = parsed.data;
    } catch {
      const response = jsonError(validationError("Invalid JSON body"));
      return withCors(response, origin);
    }

    const { username: originalUsername, token: oldToken } = body;
    const username = originalUsername.toLowerCase();

    logInfo(requestId, `Token refresh attempt for user: ${username}`);

    // Rate limit check
    const ip = getClientIp(req);
    const rateLimitResult = await checkAuthRateLimit("refresh", `${username}:${ip}`, requestId);
    if (!rateLimitResult.allowed) {
      const response = jsonError(validationError("Too many refresh attempts. Please try again later."));
      return withCors(response, origin);
    }

    // Check if user exists
    const redis = getRedis();
    const userKey = `${REDIS_KEYS.USER}${username}`;
    const userData = await redis.get(userKey);
    
    if (!userData) {
      logInfo(requestId, `User not found: ${username}`);
      const response = jsonError(notFound("User"));
      return withCors(response, origin);
    }

    // Validate old token (allow expired within grace period)
    const validationResult = await validateAuthToken(username, oldToken, {
      allowExpired: true,
    });

    if (!validationResult.valid) {
      logInfo(requestId, `Invalid token for user: ${username}`);
      const response = jsonError(invalidToken());
      return withCors(response, origin);
    }

    // Store old token for grace period
    await storeLastValidToken(username, oldToken, Date.now(), TTL.TOKEN_GRACE_PERIOD);
    
    // Delete old token
    await deleteToken(oldToken);

    // Generate new token
    const newToken = generateToken();
    await storeToken(username, newToken);

    logInfo(requestId, `Token refreshed for user: ${username} (was ${validationResult.expired ? "expired" : "valid"})`);
    logComplete(requestId, startTime, 200);

    const response = jsonSuccess({
      token: newToken,
      wasExpired: validationResult.expired ?? false,
    });
    return withCors(response, origin);

  } catch (error) {
    logError(requestId, "Token refresh error", error);
    logComplete(requestId, startTime, 500);
    const response = jsonError(internalError());
    return withCors(response, origin);
  }
}
