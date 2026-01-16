/**
 * POST /api/auth/login
 * Authenticate user with password
 */

import { z } from "zod";
import bcrypt from "bcryptjs";
import { getRedis } from "../_lib/redis.js";
import { REDIS_KEYS, TTL, API_CONFIG } from "../_lib/constants.js";
import { 
  invalidCredentials, 
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
  generateToken,
  storeToken,
  storeLastValidToken,
  deleteToken,
} from "../_middleware/auth.js";
import {
  checkAuthRateLimit,
  getClientIp,
} from "../_middleware/rate-limit.js";
import {
  isProfaneUsername,
} from "../_middleware/validation.js";
import type { User } from "../_lib/types.js";

// =============================================================================
// Configuration
// =============================================================================

export const runtime = API_CONFIG.DEFAULT_RUNTIME;
export const maxDuration = API_CONFIG.DEFAULT_MAX_DURATION;

// =============================================================================
// Schema
// =============================================================================

const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  oldToken: z.string().optional(), // For token rotation
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
    let body: z.infer<typeof LoginSchema>;
    try {
      const rawBody = await req.json();
      const parsed = LoginSchema.safeParse(rawBody);
      if (!parsed.success) {
        const response = jsonError(validationError("Invalid request body", parsed.error.format()));
        return withCors(response, origin);
      }
      body = parsed.data;
    } catch {
      const response = jsonError(validationError("Invalid JSON body"));
      return withCors(response, origin);
    }

    const { username: originalUsername, password, oldToken } = body;
    const username = originalUsername.toLowerCase();

    logInfo(requestId, `Login attempt for username: ${username}`);

    // Block profane usernames
    if (isProfaneUsername(username)) {
      logInfo(requestId, `Login blocked for profane username: ${username}`);
      const response = jsonError(invalidCredentials());
      return withCors(response, origin);
    }

    // Rate limit check
    const ip = getClientIp(req);
    const rateLimitResult = await checkAuthRateLimit("login", `ip:${ip}`, requestId);
    if (!rateLimitResult.allowed) {
      const response = jsonError(validationError("Too many login attempts. Please try again later."));
      return withCors(response, origin);
    }

    const redis = getRedis();
    const userKey = `${REDIS_KEYS.USER}${username}`;

    // Check if user exists
    const userData = await redis.get<User | string>(userKey);
    if (!userData) {
      logInfo(requestId, `User not found: ${username}`);
      const response = jsonError(invalidCredentials());
      return withCors(response, origin);
    }

    // Get password hash
    const passwordKey = `${REDIS_KEYS.PASSWORD_HASH}${username}`;
    const passwordHash = await redis.get<string>(passwordKey);
    
    if (!passwordHash) {
      logInfo(requestId, `No password set for user: ${username}`);
      const response = jsonError(invalidCredentials());
      return withCors(response, origin);
    }

    // Verify password
    const isValid = await bcrypt.compare(password, passwordHash);
    if (!isValid) {
      logInfo(requestId, `Invalid password for user: ${username}`);
      const response = jsonError(invalidCredentials());
      return withCors(response, origin);
    }

    // Delete old token if provided
    if (oldToken) {
      await deleteToken(oldToken);
      await storeLastValidToken(username, oldToken, Date.now(), TTL.TOKEN_GRACE_PERIOD);
    }

    // Generate new token
    const authToken = generateToken();
    await storeToken(username, authToken);

    const user = typeof userData === "string" ? JSON.parse(userData) : userData;

    logInfo(requestId, `User authenticated successfully: ${username}`);
    logComplete(requestId, startTime, 200);

    const response = jsonSuccess({ user, token: authToken });
    return withCors(response, origin);

  } catch (error) {
    logError(requestId, "Login error", error);
    logComplete(requestId, startTime, 500);
    const response = jsonError(internalError());
    return withCors(response, origin);
  }
}
