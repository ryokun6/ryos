/**
 * POST /api/auth/register
 * Create a new user account
 */

import { z } from "zod";
import bcrypt from "bcryptjs";
import { getRedis } from "../_lib/redis.js";
import { REDIS_KEYS, TTL, VALIDATION, API_CONFIG } from "../_lib/constants.js";
import { 
  alreadyExists, 
  validationError, 
  internalError,
  blocked,
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
} from "../_middleware/auth.js";
import {
  checkAuthRateLimit,
  isBlocked,
  setBlock,
  getClientIp,
} from "../_middleware/rate-limit.js";
import {
  validateUsername,
  validatePassword,
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

const RegisterSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
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
    let body: z.infer<typeof RegisterSchema>;
    try {
      const rawBody = await req.json();
      const parsed = RegisterSchema.safeParse(rawBody);
      if (!parsed.success) {
        const response = jsonError(validationError("Invalid request body", parsed.error.format()));
        return withCors(response, origin);
      }
      body = parsed.data;
    } catch {
      const response = jsonError(validationError("Invalid JSON body"));
      return withCors(response, origin);
    }

    const { username: originalUsername, password } = body;
    const username = originalUsername.toLowerCase();

    logInfo(requestId, `Registration attempt for username: ${username}`);

    // Check IP block
    const ip = getClientIp(req);
    const ipBlocked = await isBlocked("createUser", `ip:${ip}`);
    if (ipBlocked) {
      logInfo(requestId, `Registration blocked for IP: ${ip}`);
      const response = jsonError(blocked("User creation temporarily blocked. Try again in 24 hours."));
      return withCors(response, origin);
    }

    // Rate limit check
    const rateLimitResult = await checkAuthRateLimit("createUser", `ip:${ip}`, requestId);
    if (!rateLimitResult.allowed) {
      // Set 24h block after rate limit exceeded
      await setBlock("createUser", `ip:${ip}`, TTL.USER_CREATE_BLOCK);
      logInfo(requestId, `Rate limit exceeded, blocking IP: ${ip}`);
      const response = jsonError(blocked("Too many registration attempts. You're blocked for 24 hours."));
      return withCors(response, origin);
    }

    // Validate username
    const usernameError = validateUsername(username);
    if (usernameError) {
      const response = jsonError(validationError(usernameError));
      return withCors(response, origin);
    }

    // Validate password
    const passwordError = validatePassword(password);
    if (passwordError) {
      const response = jsonError(validationError(passwordError));
      return withCors(response, origin);
    }

    const redis = getRedis();
    const userKey = `${REDIS_KEYS.USER}${username}`;

    // Check if user exists
    const existingUser = await redis.get(userKey);
    if (existingUser) {
      // If user exists, try to authenticate with provided password
      const passwordKey = `${REDIS_KEYS.PASSWORD_HASH}${username}`;
      const passwordHash = await redis.get<string>(passwordKey);
      
      if (passwordHash) {
        const isValid = await bcrypt.compare(password, passwordHash);
        if (isValid) {
          // Password matches - log them in
          logInfo(requestId, `Existing user authenticated via register: ${username}`);
          
          const authToken = generateToken();
          await storeToken(username, authToken);
          await storeLastValidToken(
            username,
            authToken,
            Date.now() + TTL.USER_EXPIRATION * 1000,
            TTL.USER_EXPIRATION + TTL.TOKEN_GRACE_PERIOD
          );

          const userData = typeof existingUser === "string" 
            ? JSON.parse(existingUser) 
            : existingUser;

          logComplete(requestId, startTime, 200);
          const response = jsonSuccess({
            user: userData,
            token: authToken,
            isExisting: true,
          });
          return withCors(response, origin);
        }
      }
      
      logInfo(requestId, `Username already taken: ${username}`);
      const response = jsonError(alreadyExists("Username"));
      return withCors(response, origin);
    }

    // Create new user
    const user: User = {
      username,
      lastActive: Date.now(),
    };

    // Atomic set (only if not exists)
    const created = await redis.setnx(userKey, JSON.stringify(user));
    if (!created) {
      // Race condition - user was created between check and set
      logInfo(requestId, `Race condition on user creation: ${username}`);
      const response = jsonError(alreadyExists("Username"));
      return withCors(response, origin);
    }

    // Hash and store password
    const passwordHash = await bcrypt.hash(password, VALIDATION.PASSWORD.BCRYPT_ROUNDS);
    const passwordKey = `${REDIS_KEYS.PASSWORD_HASH}${username}`;
    await redis.set(passwordKey, passwordHash);

    // Generate auth token
    const authToken = generateToken();
    await storeToken(username, authToken);
    await storeLastValidToken(
      username,
      authToken,
      Date.now() + TTL.USER_EXPIRATION * 1000,
      TTL.USER_EXPIRATION + TTL.TOKEN_GRACE_PERIOD
    );

    logInfo(requestId, `User created successfully: ${username}`);
    logComplete(requestId, startTime, 201);

    const response = jsonSuccess({ user, token: authToken }, 201);
    return withCors(response, origin);

  } catch (error) {
    logError(requestId, "Registration error", error);
    logComplete(requestId, startTime, 500);
    const response = jsonError(internalError());
    return withCors(response, origin);
  }
}
