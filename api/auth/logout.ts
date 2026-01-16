/**
 * POST /api/auth/logout
 * Logout current session or all sessions
 */

import { z } from "zod";
import { API_CONFIG } from "../_lib/constants.js";
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
  deleteToken,
  deleteAllUserTokens,
} from "../_middleware/auth.js";

// =============================================================================
// Configuration
// =============================================================================

export const runtime = API_CONFIG.EDGE_RUNTIME;
export const maxDuration = API_CONFIG.DEFAULT_MAX_DURATION;

// =============================================================================
// Schema
// =============================================================================

const LogoutSchema = z.object({
  all: z.boolean().optional(), // If true, logout all devices
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
    // Authenticate request
    const auth = await getAuthContext(req);
    if (!auth.valid || !auth.username || !auth.token) {
      const response = jsonError(validationError("Authentication required"));
      return withCors(response, origin);
    }

    // Parse body (optional)
    let logoutAll = false;
    try {
      const rawBody = await req.json();
      const parsed = LogoutSchema.safeParse(rawBody);
      if (parsed.success) {
        logoutAll = parsed.data.all ?? false;
      }
    } catch {
      // Empty body is fine, defaults to single logout
    }

    logInfo(requestId, `Logout ${logoutAll ? "all devices" : "current session"} for user: ${auth.username}`);

    let deletedCount = 0;

    if (logoutAll) {
      // Delete all tokens for user
      deletedCount = await deleteAllUserTokens(auth.username);
      logInfo(requestId, `Deleted ${deletedCount} tokens for user: ${auth.username}`);
    } else {
      // Delete only current token
      await deleteToken(auth.token);
      deletedCount = 1;
      logInfo(requestId, `Deleted current token for user: ${auth.username}`);
    }

    logComplete(requestId, startTime, 200);

    const response = jsonSuccess({
      message: logoutAll 
        ? `Logged out from ${deletedCount} device(s)` 
        : "Logged out from current session",
      deletedCount,
    });
    return withCors(response, origin);

  } catch (error) {
    logError(requestId, "Logout error", error);
    logComplete(requestId, startTime, 500);
    const response = jsonError(internalError());
    return withCors(response, origin);
  }
}
