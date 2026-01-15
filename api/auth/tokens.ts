/**
 * GET /api/auth/tokens
 * List active tokens for current user
 */

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
  getUserTokens,
} from "../_middleware/auth.js";

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
    if (!auth.valid || !auth.username || !auth.token) {
      const response = jsonError(validationError("Authentication required"));
      return withCors(response, origin);
    }

    logInfo(requestId, `Listing tokens for user: ${auth.username}`);

    // Get all tokens for user
    const tokens = await getUserTokens(auth.username);

    // Format tokens with masked values
    const tokenList = tokens.map((t) => ({
      maskedToken: `...${t.token.slice(-8)}`,
      createdAt: t.createdAt,
      isCurrent: t.token === auth.token,
    }));

    logInfo(requestId, `Found ${tokenList.length} active tokens for user: ${auth.username}`);
    logComplete(requestId, startTime, 200);

    const response = jsonSuccess({
      tokens: tokenList,
      count: tokenList.length,
    });
    return withCors(response, origin);

  } catch (error) {
    logError(requestId, "List tokens error", error);
    logComplete(requestId, startTime, 500);
    const response = jsonError(internalError());
    return withCors(response, origin);
  }
}
