/**
 * GET/POST /api/auth/password
 * GET - Check if password is set
 * POST - Set or update password
 */

import { z } from "zod";
import bcrypt from "bcryptjs";
import { getRedis } from "../_lib/redis.js";
import { REDIS_KEYS, VALIDATION, API_CONFIG } from "../_lib/constants.js";
import { 
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
  getAuthContext,
} from "../_middleware/auth.js";
import {
  validatePassword,
} from "../_middleware/validation.js";

// =============================================================================
// Configuration
// =============================================================================

export const runtime = API_CONFIG.DEFAULT_RUNTIME;
export const maxDuration = API_CONFIG.DEFAULT_MAX_DURATION;

// =============================================================================
// Schema
// =============================================================================

const SetPasswordSchema = z.object({
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
  const preflightResponse = handleCorsPreflightIfNeeded(req, ["GET", "POST", "OPTIONS"]);
  if (preflightResponse) return preflightResponse;
  
  if (!isAllowedOrigin(origin)) {
    return jsonError(validationError("Unauthorized origin"));
  }

  // Authenticate request
  const auth = await getAuthContext(req);
  if (!auth.valid || !auth.username) {
    const response = jsonError(validationError("Authentication required"));
    return withCors(response, origin);
  }

  const redis = getRedis();
  const passwordKey = `${REDIS_KEYS.PASSWORD_HASH}${auth.username}`;

  try {
    // GET - Check if password is set
    if (req.method === "GET") {
      logInfo(requestId, `Checking password status for user: ${auth.username}`);
      
      const passwordHash = await redis.get<string>(passwordKey);
      const hasPassword = !!passwordHash;

      logComplete(requestId, startTime, 200);
      const response = jsonSuccess({
        hasPassword,
        username: auth.username,
      });
      return withCors(response, origin);
    }

    // POST - Set password
    if (req.method === "POST") {
      // Parse body
      let body: z.infer<typeof SetPasswordSchema>;
      try {
        const rawBody = await req.json();
        const parsed = SetPasswordSchema.safeParse(rawBody);
        if (!parsed.success) {
          const response = jsonError(validationError("Invalid request body", parsed.error.format()));
          return withCors(response, origin);
        }
        body = parsed.data;
      } catch {
        const response = jsonError(validationError("Invalid JSON body"));
        return withCors(response, origin);
      }

      const { password } = body;

      logInfo(requestId, `Setting password for user: ${auth.username}`);

      // Validate password
      const passwordError = validatePassword(password);
      if (passwordError) {
        const response = jsonError(validationError(passwordError));
        return withCors(response, origin);
      }

      // Hash and store password
      const passwordHash = await bcrypt.hash(password, VALIDATION.PASSWORD.BCRYPT_ROUNDS);
      await redis.set(passwordKey, passwordHash);

      logInfo(requestId, `Password set successfully for user: ${auth.username}`);
      logComplete(requestId, startTime, 200);

      const response = jsonSuccess({
        success: true,
        message: "Password set successfully",
      });
      return withCors(response, origin);
    }

    // Method not allowed
    const response = jsonError(validationError("Method not allowed"));
    return withCors(response, origin);

  } catch (error) {
    logError(requestId, "Password operation error", error);
    logComplete(requestId, startTime, 500);
    const response = jsonError(internalError());
    return withCors(response, origin);
  }
}
